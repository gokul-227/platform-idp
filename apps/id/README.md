# @aec-craft/id

The sign-in surface: Kratos self-service flows, the Hydra consent screen, and
the signed-in person's own account settings. One Next.js app on `@aec-craft/ui`,
talking to Ory through the official `@ory/client-fetch` SDK with no service tier
in between.

The operator console is a separate app (`apps/console`), so this
internet-facing one cannot mint a recovery link or delete somebody else's
identity.

## Run it

From the repository root:

```sh
cp ory/kratos/kratos.local.example.yml ory/kratos/kratos.local.yml   # once; add real OIDC credentials
pnpm ory:up        # Postgres, Kratos, Hydra, Keto, mail catcher (first run pulls images)
pnpm dev           # this app on http://localhost:3200
```

Register at <http://localhost:3200/registration>; the code lands in the mail
catcher at <http://localhost:4436>.

| Port        | What                                                              |
| ----------- | ----------------------------------------------------------------- |
| 3200        | This app                                                          |
| 3201 / 3202 | The operator console / the example consumer                       |
| 4433 / 4434 | Kratos public / admin                                             |
| 4444 / 4445 | Hydra public / admin                                              |
| 4466 / 4467 | Keto read / write                                                 |
| 4436 / 4437 | Mail catcher UI / API                                             |
| 5434        | Postgres (5432 is cloud-sql-proxy, 5433 the platform monorepo's)  |
| 5555        | Callback for the OAuth2 demo loop                                 |

## Surfaces

**Flows** (`src/app/(flows)`) are Kratos self-service: login, registration,
recovery, verification, logout, plus Hydra's consent screen and the error page.

Each page resolves `?flow=` against the Kratos public API, forwarding cookies,
and renders the flow's `ui` container as a plain HTML form that posts straight
back to Kratos. A missing or expired flow bounces through
`/self-service/<flow>/browser` to mint a fresh one.

That shape is the point: the app renders and forwards, every field and error
string comes from the flow, and CSRF, rate limiting and code expiry stay
Kratos's problem. No client JavaScript is involved in a sign-in.

**Account** (`src/app/(account)/account`) is the signed-in person's own
settings: profile traits, authenticator app, recovery codes, active sessions,
linked sign-in providers, connected applications, and closing the account.

Closing your own account is the one admin call this app holds, because Kratos
has no self-service deletion flow. What keeps it narrow is
`src/lib/account.deletion.ts`: the client is private to that module, nothing
exported takes an identity id, and the subject comes from the session cookie the
visitor presented. Adding a second admin call means exporting a client, which is
the whole capability one import away. Put the next one in the console.

## Authentication methods

Passwordless. Email OTP (the `code` method with `passwordless_enabled`) for both
registration and login, plus Google and Microsoft through the `oidc` method.
`password` is disabled, so no password hashes exist anywhere.

Kratos has no magic-link sign-in: links are recovery and verification only, and
OTP is the passwordless primitive. TOTP and lookup-secret recovery codes stay
available as second factors.

OIDC credentials in `ory/kratos/kratos.yml` are placeholders; the real ones go
in the gitignored `kratos.local.yml` overlay. Register the Kratos callback with
each upstream provider:
`http://localhost:4433/self-service/methods/oidc/callback/<id>`. See
[`docs/social-login.md`](../../docs/social-login.md).

## Enterprise SSO

"Continue with SSO" routes by email domain to a Kratos OIDC provider.
`src/lib/sso.ts` holds the domain map; the real source is per-org SSO
connections from the platform API. Enterprise connections are ordinary `oidc`
providers, hidden from the social button row and posted to the flow the same
way.

Ory Network does this routing natively; in OSS it is app-side. SAML is
Network-only, so OSS enterprise SSO means the customer IdP must speak OIDC.

## OAuth2

Kratos is Hydra's login provider (`oauth2_provider.url`) and this app serves the
consent screen at `/consent`. Accepting a challenge is an admin call, which is
why this app holds Hydra admin, unavoidably.

Full round trip against the local stack:

```sh
pnpm ory:seed      # creates the demo-cli client, prints client_id + secret
docker compose exec hydra hydra perform authorization-code --client-id <id> --client-secret <secret> --endpoint http://localhost:4444 --port 5555 --scope openid,offline_access,email
```

RFC 7591 self-registration is disabled. Hydra's `/oauth2/register` authenticates
nobody and has no per-registration policy hook, so an open issuer lets anyone
mint a client whose chosen name then renders on our consent screen. Clients are
created in the console instead, which means a client expecting to register
itself (an MCP client in particular) needs one issued for it first.
[`docs/oauth-clients.md`](../../docs/oauth-clients.md) has the two ways to offer
self-service without reopening the endpoint.

## Registration policy

Open today. For closed registration set
`selfservice.flows.registration.enabled: false`; the flow 404s and identities
are created from the console and handed over with recovery codes. Kratos has no
built-in waitlist, so invite or allowlist gating is a `before.hooks` `web_hook`
on the registration flow.
