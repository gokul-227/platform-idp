# Signing an app in

How an application authenticates people against buildOS ID. There is one way, one
package, and one place an app is registered.

Reference implementation: `apps/debug`, which runs locally and is never deployed.
The package's own documentation is
[`packages/client-nextjs/README.md`](../packages/client-nextjs/README.md); this page
is the shape of the thing and the reasoning, not the API.

## The one way

An application is an **OAuth client**. It is registered in the console, which
issues a client id and a secret, and the issuer validates its redirect URI
against that client record.

That is the whole onboarding path. Nothing in this repository changes, no
terraform is applied, no configuration is redeployed, and no allow-list gains an
entry. Adding an application is a console action by whoever runs the console.

```
1. Console → Applications → new client
     redirect URI          {appUrl}/auth/callback
     grants                authorization_code, refresh_token
     scopes                openid profile email offline_access
     post-logout redirect  {appUrl}/auth/login

2. In the app: pnpm add @aec-craft/platform-id-client-nextjs

3. Five files, four of them one line each. See the package README.
```

`offline_access` is not optional in practice. Hydra issues a ten minute access
token, and the refresh token is what lets the gate renew silently instead of
walking the visitor back through sign-in every ten minutes.

## What the app ends up holding

A short-lived access token and a refresh token, both in `httpOnly` cookies, plus
whatever claims the issuer wrote. Today that is `sub`, `aal`, `email` and
`schema`, because the consent step puts them into `session.access_token`; see
`apps/id/src/lib/consent.claims.ts`.

Never `staffRole`, even for an operator. A console role grants rather than
describes, and a token is held by the app that received it, so no OAuth client
can exercise operator access; that stays on the browser session the console
gates. `session.staffRole` is therefore always null here.

The app **reads** those claims without verifying them, which is correct here: it
fetched the token from the issuer over TLS and stored it itself. Anything
accepting a token from a *caller* must verify the signature itself, which is what
a resource server does.

## The console is not this

`apps/console` authenticates on a Kratos session cookie instead, in
`apps/console/src/lib/staff.guard.ts`. That is app code, deliberately not a
package, for three reasons:

1. **Nothing else should do it.** Publishing it invites an application to reach
   for a session cookie when it should register as a client, and the cookie shape
   only works on the shared cookie domain anyway.
2. **It must not depend on what it administers.** The console is where OAuth
   clients are created and deleted. If it authenticated through one, deleting
   that record would lock everyone out of the only surface that can restore it.
3. **It is the incident surface.** Its gate needs Kratos. An OAuth client needs
   Kratos, Hydra, a live client record, discovery, and a secret in Secret
   Manager: five things that can be down at the moment an operator most needs to
   get in.

### How that gate works

Four facts, read from `/sessions/whoami` on every request:

1. there is a session
2. the identity is on the `staff` schema, which self-service registration cannot
   reach (`selfservice_selectable: false`)
3. it carries a known `staffRole` in `metadata_public`, which only the admin API
   can write, so self-promotion through the settings flow is ignored
4. the session reached `aal2`

Each failure gets the one response that can resolve it, and that is what keeps it
from looping: bouncing everything to sign-in produces an infinite redirect the
moment a session is valid but insufficient, because Kratos then has nothing left
to ask for and returns straight back.

| Situation | Response |
| --- | --- |
| no cookie, or a session Kratos rejects | the sign-in app, carrying `return_to` |
| `403 session_aal2_required` | Kratos's own step-up flow |
| wrong schema, no role, unknown role, too few factors | `/denied`, a dead end |
| Kratos unreachable | `/denied`, a dead end |

That last row fails closed on purpose. An identity service that cannot be reached
must not become an open door, and it must not become a redirect loop either.

`/denied` and `/logout` sit outside the matcher: the first has to answer without a
session, and the second is the way out of a wrong one.

### What the visitor is told

The precise reason (`not-staff`, `no-role`, `unknown-role`, ...) goes to the
guard's log. What reaches the browser is one of two coarse codes, on `?code=`
and the denial header:

| `code` | What the visitor can do |
| --- | --- |
| `no-access` | nothing, without someone granting access |
| `unavailable` | wait and retry; this one is ours |

Two, because two is how many distinct things a visitor can do about it. Telling
the three no-access reasons apart in public hands an attacker a map and gives a
legitimate visitor nothing, since all three end at the same door. A response
header is not a private channel either, so nothing goes on it that the visitor
may not know.

A session below the assurance floor gets neither code. It goes to Kratos's
step-up flow, which asks for the code when a second factor is enrolled and
offers enrolment when none is, so the guard never has to tell those two apart:
`whoami` reports the level a session reached, never the levels its identity
could reach.

## APIs

Neither shape. A browser app has a cookie and a redirect available; an API has
neither, and answering a service call with a 307 to a login page is wrong.

An API verifies the access token itself. One signature against Hydra's published
keys, with the issuer and the audience both pinned and no network call to the
identity service on the request path, so the API answers while that service is
down. `@aec-craft/platform-id-resource-nestjs` is that verifier.

The audience is the API's own URL, and a client only receives a token for it when
that URL is both requested and registered on the client. Hydra reads its own
`audience` parameter for this and ignores RFC 8707 `resource`, so a token
requested with `resource` arrives with an empty `aud` and is refused. That
contract is in [architecture.md](architecture.md#the-token-an-api-receives).

## Other frameworks

The flow is plain OIDC authorization code with PKCE, so any framework's OIDC
library speaks it. `packages/client-nextjs` is a convenience wrapper around Next's
file conventions, not a protocol of its own.
