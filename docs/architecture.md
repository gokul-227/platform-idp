# Architecture

## The services

**Kratos** owns identities, credentials and sessions. Every sign-in, sign-up,
recovery and profile change is a Kratos *flow*: Kratos holds the state, our app
renders it. The app never sees a password or an upstream token.

**Hydra** is the OAuth2 and OIDC provider. It issues tokens to applications and
delegates authentication to Kratos through our consent screen. Its public
hostname is the `iss` claim in every token it has ever minted, so that hostname
is permanent.

**Keto** answers relationship questions ("may this subject read that object")
against the namespace model in `ory/keto/namespaces.keto.ts`. Both its ports are
internal-only; it has one caller.

**apps/id** renders the Kratos flows and the OAuth consent screen. It holds no
admin credential of any kind, except Hydra admin, which the consent contract
requires (accepting a challenge is an admin call).

**apps/console** is the operator surface over both admin APIs. It is the only
service that can create or modify an identity or an OAuth client.

## Why the admin APIs sit apart

Kratos and Hydra admin have no authentication. That is deliberate on Ory's part:
the admin API is meant to be unreachable rather than protected. So they run as
their own Cloud Run services with `ingress = INGRESS_TRAFFIC_INTERNAL_ONLY`, no
`allUsers` invoker, and an explicit invoker list. The console and apps/id call them with a Google-signed
identity token from the metadata server, audienced at the target service, so no
key material exists anywhere.

A Cloud Run service exposes one port, which is why the admin surfaces need their
own services rather than another port on the same one. Getting this wrong is
quiet: the pages render, the calls fail.

## A first-factor sign-in, end to end

1. Browser opens `{env}/login`. No `?flow=`, so the app redirects to
   `auth.{env}/self-service/login/browser`.
2. Kratos creates a flow, sets a CSRF cookie, redirects back with `?flow=`.
3. The app fetches the flow and renders it: an email field, the social buttons
   Kratos declares, and nothing the flow does not offer.
4. The form posts **to Kratos**, not to the app.
5. Kratos emails a six-digit code and returns the flow in its next state; the
   app renders the code step. The mail also carries a one-click link back into
   the flow, built from the flow URL the form submitted as `transient_payload`;
   the courier template only links allowlisted sign-in origins.
6. The code is submitted — typed, or filled and submitted by the code step
   honoring the link's `#code=` fragment — and Kratos sets a session cookie and
   redirects to the configured return URL.

The app renders and forwards. Every field, button and error text comes from the
flow — the one addition of the app's own is `transient_payload` above — which
is why CSRF, rate limiting and code expiry are Kratos's problem and not ours.

## Cookies across hostnames

Kratos sets its CSRF and session cookies host-only by default. With the app on
`{env}` and Kratos on `auth.{env}`, the browser would never send them to the
app, the app could not forward them when fetching the flow, Kratos would reject
it, and the app would bounce to mint another flow forever.

`COOKIES_DOMAIN` and `SESSION_COOKIE_DOMAIN` are therefore scoped to the shared
parent. Locally this never comes up, because the app and Kratos share
`localhost`.

## Assurance levels

`session.whoami.required_aal` is `highest_available`: a session is as strong as
that identity can be. An identity with only an emailed code reaches `aal1` and
`whoami` returns 200. Enrol TOTP and the same session answers `403` with
`session_aal2_required` until it steps up.

That single setting is what lets the console demand `aal2` without a second
Kratos deployment, and it is why enrolling a second factor changes the behaviour
of sessions that already exist.

## The console gate

`apps/console/src/proxy.ts` runs on every request and checks four facts from
`/sessions/whoami`:

1. there is a session
2. the identity is on the `staff` schema, which self-service registration cannot
   reach (`selfservice_selectable: false`)
3. it carries a known `staffRole` in `metadata_public`, which only the admin API
   can write, so self-promotion through the settings flow is ignored
4. the session reached `aal2`

Each failure gets the one response that can resolve it. That is not cosmetic:
redirecting every failure to the sign-in app produces an infinite redirect the
moment a session is valid but insufficient, because Kratos then has nothing left
to ask for and returns straight back.

| Outcome | Response |
| --- | --- |
| no session, or one Kratos does not recognise | sign-in app, with `return_to` |
| `403 session_aal2_required` | Kratos's own `?aal=aal2` flow |
| not staff, no role, unknown role, no second factor, Kratos unreachable | `/denied`, a dead end |

The precise reason stays in the guard's log. `/denied` is told one of three
coarse codes, because three is how many distinct things a visitor can do about
it, and because which pool an account is on and how a role is granted are facts
about how access works rather than anything a stranger needs. See
[guarding-an-app.md](guarding-an-app.md#what-the-visitor-is-told).

`/denied` and `/logout` sit outside the matcher: the first must answer without a
session, and the second is the way out of a wrong one.

Nothing reaches the console around this check, because the service takes
load-balancer ingress only and its `*.run.app` URL 404s. IAM cannot be the
control there: the load balancer forwards without a caller identity, so
`allow_public = false` would refuse the load balancer itself.

## The token an API receives

A resource server verifies the access token itself. One RS256 signature against
Hydra's published JWKS, with `iss` and `aud` both pinned and a small clock
tolerance, and no call to the identity service on the request path, so an API
answers while that service is down. `@aec-craft/platform-id-resource-nestjs` is
that verifier, and `PrincipalGuard` registers it so every route is fail-closed
with `@Public()` as the opt-out.

### The audience is the API's own URL

A client receives a token for an API only when that API's URL is both requested
and registered on the client. Two things follow, and each has caused a silent
refusal:

- Hydra reads its own `audience` request parameter. It accepts RFC 8707
  `resource` and ignores it, so a token requested with `resource` arrives with
  `aud: []`.
- The client's registered `audience` list is a ceiling. A requested value absent
  from it is dropped rather than refused, so an unregistered client also yields
  `aud: []`.

Ask for one audience per token, the one about to be called. A token naming two
APIs is accepted by both, so whichever holds it can replay it at the other.

### Claims sit under `ext`

Hydra nests whatever the consent step granted under `ext`, not at the top level.
The consent step puts `aal`, `email` and `schema` there; `sub` and `client_id` are
top-level, and `client_id` uses the underscore spelling. The verifier reads both
shapes.

`sub` is an identity id for a person and a client id for a service, and `type`
separates the two namespaces, so an API reads `type` before it reads `sub`. A
token whose subject is the client itself is a machine; anything else is a person
acting through that client.

Everything unknown fails closed. `aal` ends at `aal0`, never at a level nothing
could read, so a check demanding `aal2` refuses a caller that never proved one.
`email` and `staffRole` are absent rather than empty, so absent means unknown
rather than "has no role".

`staffRole` never arrives in a token. The verifier refuses to read it from `ext`,
because a value inside a grant is one a consented application holds. Operator
reach stays on the browser session the console gates at aal2, which is also why
the API's staff surface is the one thing still to be re-homed.

## Data

One Postgres instance per environment, private IP only, with a database and a
dedicated user per service. Each Cloud Run service reads only its own DSN
secret, so a compromised container cannot read another service's data. Direct
VPC egress with `PRIVATE_RANGES_ONLY` keeps public traffic (SMTP, upstream OIDC)
off the VPC, so no Cloud NAT is needed.

The DSN is the private IP with `sslmode=require`, not the `/cloudsql` socket:
that socket goes through the Auth Proxy, which needs a public or PSC endpoint.
