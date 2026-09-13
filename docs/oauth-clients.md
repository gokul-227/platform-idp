# OAuth clients

An application that wants buildOS to sign its users in registers as an OAuth
client with Hydra. It then runs the authorization code flow against
`oauth.{env}`, and Hydra delegates authentication to Kratos through our consent
screen.

## Creating one

In the console, under **Applications**. The form covers what matters:

| Field | Meaning |
| --- | --- |
| Name | shown on the consent screen, so name it as the user would recognise it |
| Type | confidential (keeps a secret) or public (cannot, so PKCE is enforced) |
| Redirect URIs | exact match, no wildcards |
| Grant types | `authorization_code` for sign-in; `client_credentials` for machine-to-machine |
| Scope | space-separated; `openid` for OIDC, `offline_access` for refresh tokens |
| Skip consent | first-party only, see below |

The client secret is shown once, at creation. Hydra stores it hashed and cannot
show it again; losing it means [rotating](#rotating-a-secret).

**Skip consent** tracks who owns the application, not whether it keeps a secret.
A first-party app should skip it: the user is signing in to us, not granting a
third party access to their data. A third-party app must not, and defaults keep
it off so skipping is always deliberate.

## Changing one

**Edit**, on the application's page in the console. It carries the name, the
redirect URIs, the grant types, the scope and the skip-consent flag, and nothing
else.

The write is `PATCH /admin/clients/{id}` with a JSON Patch document.
`PUT /admin/clients/{id}` replaces the whole registration rather than the fields
you send: on v26.2.0, a put carrying only `client_name` left the client with no
redirect URIs, no grant types, no owner, consent no longer skipped, and `scope`
reset to Hydra's default. Everything the form does not carry (token lifespans,
JWKS, branding, CORS origins, sign-out URIs) therefore survives an edit only
because it is a patch.

Hydra validates neither the registration nor the patch. An unknown grant type is
stored exactly as sent, a redirect URI that is not a URL likewise, and both fail
much later against a real authorization request, so the console is the only place
either is checked.

Response types are not a field. They follow from the grants: the patch adds or
removes `code` and leaves anything else alone, so a hybrid client keeps the
`id_token` it was registered with.

Four things the form does not offer. The edit page says so, and why, rather than
leaving an operator to notice the absence:

| Not editable | Why |
| --- | --- |
| Client ID | Hydra minted it and every token it has issued names it |
| Client secret | stored hashed, so the value at creation was the only copy |
| Type | it decides how every deployed copy of the application authenticates |
| Owner | it decides which organisation may see the application |

### Rotating a secret

`POST /admin/clients/{id}/secrets/rotate` is an Ory Network endpoint. It answers
`404` on Hydra OSS v26.2.0, so there is no zero-downtime rotation and no store of
previous secrets to expire. The console generates 32 random bytes and patches
`/client_secret`; that response echoes the secret, which is the only time it can
be read.

Rotation is a cutover. Verified on v26.2.0: immediately after the patch, a
`client_credentials` request with the old secret answers `401 invalid_client` and
the same request with the new one answers `200`. So rotating and deploying the
new value are one change, not two.

## The consent flow

1. The app sends the user to `oauth.{env}/oauth2/auth?...`.
2. Hydra has no session, so it redirects to `{env}/login?login_challenge=...`.
3. Our app runs the Kratos login flow, then accepts the login challenge against
   Hydra admin.
4. Hydra redirects to `{env}/consent?consent_challenge=...`, where the user sees
   the app name and the scopes it asked for.
5. Accepting returns the user to the app with a code, which the app exchanges for
   tokens at the token endpoint.

Hydra admin is the one admin credential apps/id holds, because steps 3 and 4 are
admin calls. It holds no Kratos admin credential.

## The tokens a client gets

Access tokens are **RS256 JWTs** signed by Hydra, valid for **10 minutes**. A
client should treat one as opaque anyway: send it, and on `401` refresh. What it
must not do is cache one past its `exp` or derive its own authorization decisions
from the claims it can read, because it can read them. Only a resource server
verifies them, against `oauth.{env}/.well-known/jwks.json`.

Refresh tokens are opaque and last 720h. `offline_access` is what asks for one.
Refreshing is a call to Hydra, so a revoked or expired grant fails there
immediately.

Revocation is therefore not instant. Because nothing introspects an access token,
revoking a client, a consent grant or a token stops the client at its next
refresh rather than its next request, which is at most 10 minutes. See
[The token an API receives](architecture.md#the-token-an-api-receives) for why
verification is local and where in the token those claims sit.

Anything a consent decision puts in `session.access_token` becomes part of the
signed access token, nested under an `ext` claim, and is visible to the client.
Nothing confidential belongs there.

What consent puts there is `aal`, `email` and `schema`, read from the granting
Kratos session (`apps/id/src/lib/consent.claims.ts`). The resource-server guard
reads exactly those, which is why they are named that way rather than mapped:
registered claims keep their specified names, ours keep the repo's. A
claim it could not read is omitted rather than emitted empty, so absent means
unknown rather than "has none".

`staffRole` is not among them, and that is the one omission with a reason beyond
"nothing to read". Those three describe the person; a console role grants, since
the platform API opens its operator routes to any caller asserting one. Every
client asks for the same four scopes and holds the token it gets, so emitting it
would give operator reach to every application an operator ever signs into.
Operator access stays on a browser session; see
[The token an API receives](architecture.md#the-token-an-api-receives).

## Wiring the client into an app

For a Next.js app, `@aec-craft/platform-id-client-nextjs` is five files and no
protocol work; see [signing an app in](guarding-an-app.md). For anything else, the
flow is plain authorization code with PKCE, so any OIDC library speaks it.

Two things a client must get right whatever it is written in. Ask for
`offline_access`, or there is no refresh token and the 10 minute access token
becomes a 10 minute session. And renew on expiry rather than restarting the
authorization flow, which works and looks broken.

## Dynamic client registration

`oidc.dynamic_client_registration.enabled` is **false** in
`ory/hydra/hydra.yml`. `POST /oauth2/register` answers `404` with
`Dynamic registration is not enabled.`, and the discovery document carries no
`registration_endpoint`. Every client is created by an operator in the console,
as described above.

It is off because Hydra's DCR is unauthenticated by design and has no
per-registration policy hook. With it on, any anonymous caller gets a
`client_id` plus a `registration_access_token` that lets them manage that client
afterwards; on dev, an unauthenticated request returned `201`. The danger is not
that a stranger owns a client. The consent screen renders a `client_name` the
registrant chose, on our domain and under our branding, so open registration is
a phishing surface as well as an unauthenticated write endpoint on the issuer.

The cost is that clients which expect to register themselves, MCP clients in
particular, now need a client issued in the console before they can connect.

Two ways to give customers self-service clients without reopening that:

- **Through our own API** (recommended). Expose client creation on an endpoint
  that already knows who is calling, gated on the caller's standing in the
  organisation. The endpoint calls Hydra admin, scopes the client to that
  organisation via `metadata`, and only that organisation's members can see or
  change it afterwards. The console does exactly this today for operators; a
  tenant surface is the same call with a different gate.
- **Front DCR with something that authenticates the caller.** Hydra has no
  "require initial access token" switch, so the endpoint has to be taken off the
  public host and put behind a proxy that authenticates and rate-limits. That is
  the same work as the first option with an extra hop.

### Two independent switches

The flag decides whether the endpoint answers.
`webfinger.oidc_discovery.client_registration_url` decides whether discovery
advertises a `registration_endpoint`, and Hydra derives no endpoint from the
flag. Verified on v26.2.0: with the flag off and the URL still set, discovery
kept advertising an endpoint that answered `404`. Both have to move together,
and in deployed environments the URL arrives as
`WEBFINGER_OIDC_DISCOVERY_CLIENT_REGISTRATION_URL` on the Hydra service, where
the environment variable beats the file. Turning it back on for one environment
is `OIDC_DYNAMIC_CLIENT_REGISTRATION_ENABLED=true` plus that URL, so it is never
accidental.

## Ownership and listing

Hydra's client list can filter by `client_name` and `owner`, both exact match,
and nothing else. There is no fuzzy search and no sort. Any per-organisation
view therefore has to filter on a field we set at creation, which is why new
clients carry organisation metadata rather than relying on a query.

The list pages with an opaque token, and so does Kratos's identity list. The
token arrives in a `Link` header (`<...?page_token=...>; rel="next"`) and nowhere
in the body, so the console reads the raw response rather than the parsed one;
the header carries no `rel="next"` on the last page, including when the last page
is exactly full. Neither service sends a `rel="prev"`, and Hydra re-encrypts its
token per response, so a page can be addressed by nothing except the token that
led to it. The console therefore keeps the tokens it walked in the URL
(`?pages=t1,t2`), which is what First and Previous read, and drops them when a
filter changes, because a token belongs to the result set it was issued for.

## The issuer hostname is permanent

`oauth.{env}` is the `iss` claim in every token Hydra has minted and is published
in the discovery document that clients cache. It cannot be renamed later without
invalidating every deployed client's configuration. Kratos's hostname can be
changed at the cost of re-registering redirect URIs upstream; Hydra's cannot be
changed at any price.
