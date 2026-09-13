# @aec-craft/platform-id-client-nextjs

The OAuth client half of buildOS ID: what a Next.js application uses to sign
people in. Authorization code with PKCE against Hydra, wrapped as a gate plus
three route handlers.

This is the only package an application installs. The console authenticates
differently, on a Kratos session cookie, but that is app code inside
`apps/console` rather than something to reuse: see
[docs/guarding-an-app.md](../../docs/guarding-an-app.md#the-console-is-not-this).

An app using this is **registered, not configured**: its client id and secret
come from the console's Applications page, and the issuer validates its redirect
URI against that record. Nothing in the identity service's own configuration or
infrastructure has to change to add an app.

## Wiring

Five files, and the first is the only one with any content.

```ts
// src/lib/auth.ts
import "server-only";
import { createIdClient } from "@aec-craft/platform-id-client-nextjs";

export const auth = createIdClient();
```

```ts
// src/proxy.ts          (src/middleware.ts on Next 15, exporting `middleware`)
import { auth } from "@/lib/auth";

export const proxy = auth.guard;

// /auth/* must stay outside: it is the flow that obtains a session, so gating
// it is a redirect loop by construction. The literal cannot come from a
// variable; Next parses it statically and never evaluates the module.
export const config = {
  matcher: ["/((?!auth|_next/static|_next/image|favicon.ico).*)"],
};
```

Then three route files, one line each:

```ts
// src/app/auth/login/route.ts     (and callback/, and logout/)
import { auth } from "@/lib/auth";

export const GET = auth.handlers.login;
```

## Registering the app

In the console, Applications → new client:

| Field | Value |
| --- | --- |
| Redirect URI | `{appUrl}/auth/callback` |
| Grants | `authorization_code`, `refresh_token` |
| Scopes | `openid profile email offline_access` |
| Post-logout redirect | `{appUrl}/auth/login` |

`offline_access` is what yields a refresh token. Without it the gate cannot
renew, and see the ten-minute note below for why that matters.

## Configuration

Nothing is required in code; every option reads an environment variable.

| Variable | What it is |
| --- | --- |
| `OIDC_ISSUER` | Hydra's public base URL, `oauth.{env}` |
| `OIDC_CLIENT_ID` | from the console |
| `OIDC_CLIENT_SECRET` | from the console, once, at creation |
| `APP_URL` | this app's own public origin |

`APP_URL` is not optional in a deployed environment. Every redirect is built on
it, and there is no safe fallback: behind Cloud Run the request's own host is the
container's bind address, so a redirect built from it goes nowhere.

The secret is read late, inside the flow, never at module scope. A factory call
runs at import time, and a build machine has no business holding it.

`requiredAal` is the one option with no variable: an app whose resource server
gates on `aal2` passes `requiredAal: "aal2"`, and the gate re-authorizes rather
than serve a token whose `aal` claim says less. A token states the level the
session had when it was minted and keeps it through every refresh, so this is
the only way a chain minted before the second factor is ever replaced.

## The gate renews

Three outcomes, and the middle one is why this is not a two-line cookie check:

| Request carries | Outcome |
| --- | --- |
| an access token | through |
| only a refresh token | renewed here, then through |
| neither | the login route, carrying `return_to` |

Hydra is configured with a **ten minute** access token. Without that middle
branch a signed-in visitor would be walked back through the authorization flow
every ten minutes: it works, and it looks broken.

Renewal has to happen in the gate because it is the only place in a Next app that
both runs before a page and owns a response to put `Set-Cookie` on. A Server
Component can notice that a token expired but cannot replace it, which is why
`getSession()` is read-only and never refreshes.

## Cookies

`at` (access) and `rt` (refresh) are the session; `pkce`, `state` and `rto` are
transients for one login round trip. All `httpOnly`, all `SameSite=Lax`.

`Lax` rather than `Strict` is load-bearing: the callback arrives as a top-level
navigation from the issuer, and `Strict` would withhold the transients on exactly
that request, breaking every login.

`secureCookies` is inferred from whether `APP_URL` is https rather than defaulting
to true. A `Secure` cookie over http is dropped by the browser with no error
anywhere, and the symptom is a login that appears to succeed and then forgets you
on the next request. When it is on, cookies also take the `__Host-` prefix, which
is a browser-enforced guarantee that no sibling subdomain can write them.

## Ending the session

`handlers.logout` ends this platform session and lands on `postLogoutRedirect`;
it is not a sign-out, because the identity session belongs to Kratos. An app's
own sign-out therefore calls `clearSession(response)` on the redirect it sends
to Kratos, so the token leaves with the person. A proxy that already knows who
is signed in compares `sessionOf(request).subject` with that identity and
re-authorizes on a mismatch, which is what stops a token left in a browser from
acting for the next person to sign in on it.

## What a session gives you

```ts
const session = await auth.getSession();
session?.subject;      // the identity id
session?.email;        // the address on the granting session
session?.accessToken;  // for calling an API
session?.claims;       // everything the issuer wrote
```

The claims are **read, not verified**. That is correct here: this is an app
reading a token it fetched from the issuer over TLS and stored itself. Anything
accepting a token from a caller must verify the signature.

`aal`, `email` and `schema` arrive on every token. The consent screen puts them
into `session.access_token`, Hydra nests them under `ext`, and this package
unwraps them into the fields above.

`staffRole` arrives the same way when consent emitted one, and is null when it
did not, which is most tokens. Holding it is not authority: what it opens is
decided by the API you send the token to, against the roles that deployment lists
and the audience the client was registered for. Hydra re-derives it on every
refresh, so a role revoked in the console stops arriving within one access-token
lifetime rather than at the end of the refresh chain.
