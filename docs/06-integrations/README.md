# 6. Integrations

## Purpose

This chapter explains how third-party software authenticates through this platform instead of
building its own login, documents every registered application, how the registry works, and the
cross-app bug catalog found while getting real software to interoperate with this platform's Ory
stack.

## Overview — the relying-party pattern

If you have never worked with OAuth2/OIDC before: it's an industry-standard way for an application
(the "relying party") to redirect a user to a trusted identity provider, have that provider confirm
who the user is, and get a signed token back proving it — without ever seeing the user's password
itself. Here, **this platform's Ory stack (Kratos + Hydra + Keto + Oathkeeper) is that identity
provider**, and every app in this chapter is a relying party pointed at it.

An "Application" in this platform is an OAuth2/OIDC client registered against Ory Hydra. Every
integration follows the same shape:

1. The app redirects the user's browser to Hydra's `/oauth2/auth` endpoint (through Oathkeeper's
   public proxy), optionally with PKCE.
2. Hydra checks for an active Kratos session; if none exists, the user authenticates at Kratos's
   real login page.
3. Hydra's consent step auto-accepts for every client currently registered here.
4. Hydra redirects back to the app's registered `redirect_uri` with an authorization code.
5. The app exchanges that code for tokens at Hydra's token endpoint — this last step is where most
   of the real, interesting bugs in this repo's history were found (see each app's section, and the
   [cross-app bug catalog](#cross-app-bug-catalog) below).

For the underlying flow mechanics (scopes, PKCE, claims, token endpoint details), see
[chapter 3](../03-user-guide/README.md#part-1--authentication-signing-up-signing-in-and-signing-in-elsewhere)
and [chapter 5](../05-development/README.md#api-reference) — this chapter is about registration and
per-app integration specifics, not flow mechanics.

## The application roster

| App | Port | What it is |
|---|---|---|
| [Mealie](#mealie) | `9925` | Real upstream recipe-manager app (mealie-recipes/mealie), unmodified official image |
| [Superset](#superset) | `9928` | Real upstream Apache Superset, unmodified official image, proxied via Oathkeeper at `/apps/superset/*` |
| [Airflow](#airflow) | `9929` | Real upstream Apache Airflow, unmodified official image, proxied via Oathkeeper at `/apps/airflow/*` |
| [Open WebUI](#open-webui) | `9927` | Real upstream Open WebUI, unmodified official image |
| [NeoBIM UI](#neobim-family--ui-demo-and-auth-context) (demo app) | `9930` | NeoBIM's own design-system demo app, Ory-authenticated |
| [BuildOS](#buildos-integration) | `3000` (external repo) | Real integration: the external `buildos` repo's `apps/platform` pointed at this platform's Hydra |
| [CBM Demo](#cbm-demo-cognitive-building-model-lab) | `3004` (external repo) | Real integration: a 3D building-model viewer, same pattern as BuildOS |
| [Flask Identity Viewer](#flask-identity-viewer--httplocalhost9931) | `9931` | Custom validation harness — full token/claims/Keto-tuple viewer |
| [FastAPI RBAC Playground](#fastapi-rbac-playground--httplocalhost9932) | `9932` | Custom validation harness, a full OIDC relying party — real Hydra introspection + Keto checks |
| [Streamlit Enterprise Portal](#streamlit-enterprise-portal--httplocalhost9933) | `9933` | Custom validation harness — Keto-gated department pages |
| [authlib-demo](#authlib-demo--reference-client-enabled-false) | `3200` | Reference OIDC client, `enabled: false` by default |

Full per-app URLs and every other port this platform exposes live in
[chapter 8](../08-reference/README.md) — treat that table as the current source of truth for
ports. `integrations/applications/platform.yaml` remains `enabled: false` — a prepared-but-not-yet-piloted
integration for the separate NeoBIM/aec-craft `platform` repo, distinct from the now-live `buildos`
integration.

Mealie, Superset, Airflow, and Open WebUI prove genuine third-party interoperability: none of them
were written with this platform in mind, they just speak generic OIDC.

## Source of truth: `integrations/applications/*.yaml`

Every application is declared as a YAML file in `integrations/applications/`. This is the **source of truth** —
`platform/app-registry` (port `8080`) reads these files and syncs them to real Ory Hydra OAuth2
clients via Hydra's Admin API. Nothing in Hydra is hand-created; it's always derived from a
registry file.

`integrations/applications/_template.yaml` documents the schema:

```yaml
client_id: example-app
client_name: Example Application
redirect_uris:
  - http://localhost:4455/auth/callback
post_logout_redirect_uris:
  - http://localhost:4455/
grant_types:
  - authorization_code
  - refresh_token
scope: openid profile email offline_access
client_secret_env_var: EXAMPLE_APP_OIDC_CLIENT_SECRET
token_endpoint_auth_method: client_secret_post
enabled: false
tenant_id: default
tags:
  - template
  - example
```

Field notes:

- `client_secret_env_var` — the registry file never contains a secret directly; it names an
  environment variable app-registry reads at sync time.
- `enabled` — nothing is synced to Hydra until this is `true`.
- `token_endpoint_auth_method` — don't assume `client_secret_post` (this repo's usual convention)
  applies to every relying party. Mealie's Authlib-based OIDC client defaults to
  `client_secret_basic`, confirmed live. Airflow, Superset, Open WebUI, and NeoBIM UI hit the same
  pattern.
- `audience` — not expressible in this schema at all. BuildOS's and CBM Demo's adapters require it
  (RFC 8707 resource indicator); see their own sections below for the manual follow-up `PUT` this
  requires.

## Onboarding a new application — step by step

1. **Create the registry file.** Copy `integrations/applications/_template.yaml` to
   `integrations/applications/<name>.yaml` and fill in the fields, or use the console UI:
   `/console/applications` → "Register application," which creates the YAML file *and* immediately
   syncs it.
2. **Set `enabled: true`.** If you hand-edited the YAML file, sync it:
   ```bash
   make sync
   # or
   curl -X POST http://localhost:8080/api/v1/sync
   ```
   Sync is idempotent — re-running it reconciles Hydra to match whatever's currently in
   `integrations/applications/`.
3. **Export the client secret env var** the file names, before syncing.
4. **Configure the client in detail** at `/console/applications/{client_id}` — see
   [chapter 4](../04-administration/README.md#8-applications--oauth-clients) for the full console
   walkthrough (redirect URIs, grant types, token lifetimes, secret rotation).

## Removing an application

Delete (or set `enabled: false` in) its `integrations/applications/<name>.yaml` and re-sync — or use "Delete
application" on `/console/applications/{client_id}`, which removes both the registry file and the
Hydra client.

---

## Mealie

Mealie is the simplest real-world proof that this platform works exactly like Okta, Auth0, or
Keycloak would for a third-party application: an unmodified, genuinely independent open-source
project logging users in via generic OIDC, with zero awareness this platform exists.

[Mealie](https://github.com/mealie-recipes/mealie) v2.8.0 (FastAPI, AGPL-3.0) runs from its
**unmodified official image** (`ghcr.io/mealie-recipes/mealie:v2.8.0`) at `http://localhost:9925`,
configured entirely through its own documented `OIDC_*` environment variables.
`integrations/applications/mealie.yaml` registers it (`enabled: true`).

**Verified live end-to-end via a real browser**: registration → OIDC login → session established
→ `GET /api/users/self` confirms `"authMethod":"OIDC"` with the correct name/email.

### The `localhost`-resolves-to-self networking bug — fixed

For a while, Mealie's own server-side token exchange failed. Oathkeeper's OIDC discovery document
(fetched by Mealie at `http://oathkeeper:4455/.well-known/openid-configuration`, correct for the
internal address) advertises `http://localhost:4455/...` endpoints — correct for the browser, but
Mealie's own backend then called *that* URL from inside its own container, where `localhost`
resolves to Mealie itself, not Oathkeeper.

**Root cause, confirmed**: glibc's NSS "files" backend returns both the container's own
`127.0.0.1`/`::1` entries for `localhost` ahead of anything appended via Compose's `extra_hosts` —
`extra_hosts` only *appends* after the default entry, so it's silently never consulted first.

**The fix that actually holds**: a custom `entrypoint` in
`deployment/docker/compose/docker-compose.applications.yml` that **rewrites** (not appends to)
`/etc/hosts` at container start, resolving Oathkeeper's real container IP fresh on every boot via
Docker's embedded DNS (`getent hosts oathkeeper`), then exec-ing Mealie's real entrypoint unchanged:

```sh
OATHKEEPER_IP=$(getent hosts oathkeeper | awk '{print $1}')
grep -v '^::1' /etc/hosts | sed "s/^127\.0\.0\.1[[:space:]]*localhost$/${OATHKEEPER_IP}\tlocalhost/" > /tmp/newhosts
cat /tmp/newhosts > /etc/hosts
exec /app/run.sh
```

The `grep -v '^::1'` line matters as much as the `sed` substitution — the IPv6 `::1 localhost`
entry is easy to miss, and if left in place still resolves `localhost` to the container itself over
IPv6 even after the IPv4 line is rewritten. This same fix, applied per-container, also resolves the
identical bug for Open WebUI and NeoBIM UI (see their own sections).

### How to log in

1. Open `http://localhost:9925`.
2. Click **Login with Identity Platform**.
3. Sign in with a real platform identity (register at `http://localhost:4455/auth/registration` if
   needed).
4. Hydra's consent step completes automatically.
5. Redirected back to Mealie, signed in, with `authMethod: OIDC`.

### Troubleshooting

| Symptom | Cause | What to check |
|---|---|---|
| Login button does nothing / 404 | `OIDC_AUTH_ENABLED` not set on the Mealie container | `docker compose ... exec mealie env \| grep OIDC` |
| `invalid_client` at authorize or token step | `token_endpoint_auth_method` mismatch | Mealie's Authlib client needs `client_secret_basic`, not this registry's usual `client_secret_post` |
| **(Resolved)** 500/connection-refuse right after the callback | The now-fixed `localhost`-resolves-to-self bug | Confirm the custom `entrypoint` rewrites both IPv4 and IPv6 `/etc/hosts` lines |
| `redirect_uri` mismatch from Hydra | Registered `redirect_uris` doesn't match Mealie's actual callback path | Mealie redirects through its SPA route (`/login`) — `integrations/applications/mealie.yaml` uses `http://localhost:9925/login` |

---

## Open WebUI

Open WebUI is the app that first exposed two real, previously-latent platform bugs — both only
reachable via a genuinely *fresh* (never-remembered) login — plus its own independent,
disclosed user-activation quirk.

[Open WebUI](https://github.com/open-webui/open-webui) v0.10.2 (FastAPI) runs from its
**unmodified official image** at `http://localhost:9927`, standalone (no Oathkeeper proxying —
uses an explicit absolute redirect URI). `integrations/applications/open-webui.yaml` registers it
(`enabled: true`).

**Verified live end-to-end via a real Playwright browser test**: full login → Open WebUI issues its
own session JWT → `GET /api/v1/auths/` returns the correct `name`/`email` claims from this
platform's ID token.

### Three real platform/interop bugs this integration found and fixed

1. **Kratos was missing `oauth2_provider.url`** — `/self-service/login/browser?login_challenge=...`
   500'd on every *fresh* (non-remembered) Hydra-initiated login. Every previous RP test happened
   to already have a Kratos session cookie, which never exercises this code path. Fixed in
   `ory/kratos/config/kratos.yaml.tmpl`.
2. **auth-service's consent handler lost the email/name context on a fresh login** — once Kratos
   could complete the Hydra login challenge natively, it bypassed auth-service's own `/hydra/login`
   context-building. Fixed by having `/hydra/consent` fall back to a Kratos admin identity lookup
   by subject when the login context is empty.
3. **Open WebUI doesn't send PKCE by default**, despite its Authlib client fully supporting S256 —
   `OAUTH_CODE_CHALLENGE_METHOD=S256` must be set explicitly, or this platform's PKCE-enforced
   Hydra rejects the authorize request outright.

### The `localhost`-resolves-to-self networking bug — fixed

Same root cause and fix as Mealie above — a custom `entrypoint` in
`docker-compose.applications.yml` rewrites both `/etc/hosts` entries at container start.

### Open WebUI's own user-activation gate — disclosed, not an Ory bug

Independent of anything Ory does, only the very first OIDC-provisioned user auto-activates as
admin; every subsequent user defaults to role `pending` and is blocked with "Account Activation
Pending" until an existing Open WebUI admin manually approves them — even though Kratos and Hydra
had already fully authenticated the user. This is Open WebUI's own onboarding design.

**Fixed with two parts, both required:**

1. `DEFAULT_USER_ROLE: user` set on the Compose service — controls subsequently auto-provisioned
   users.
2. A one-time call to `POST /api/v1/auths/admin/config`. **Open WebUI persists this setting in its
   own database after first boot**, and that persisted value overrides the env var from then on —
   so setting the env var alone is not sufficient once the container has booted once already.

### How to log in

Open `http://localhost:9927`, click **Sign in with Identity Platform**, sign in with a real
platform identity, land in the chat interface, immediately usable.

### Troubleshooting

| Symptom | Cause | What to check |
|---|---|---|
| `invalid_request: ... code_challenge` | PKCE isn't sent by default | Confirm `OAUTH_CODE_CHALLENGE_METHOD=S256` is set |
| First cold boot takes several minutes | Open WebUI's RAG subsystem re-downloading an embedding model | Set `OFFLINE_MODE=True` |
| **(Resolved)** `500` on a fresh login | Kratos missing `oauth2_provider.url` | Confirm `kratos.yaml.tmpl` has this set |
| **(Resolved)** ID token has `email: null, name: null` | auth-service lost login context on a fresh login | See fix #2 above |
| New user stuck on "Account Activation Pending" | Open WebUI's own activation gate | Confirm `DEFAULT_USER_ROLE: user` **and** the one-time admin API call were both done |

---

## Superset

Apache Superset demonstrates the same Oathkeeper path-prefix proxying pattern as Airflow (both are
Flask-AppBuilder apps), plus two real, non-obvious packaging/framework pitfalls.

[Apache Superset](https://github.com/apache/superset) v5.0.0 runs from its **unmodified official
image** (`apache/superset:5.0.0`) at `http://localhost:9928`, proxied via Oathkeeper at
`/apps/superset/*`, configured through Flask-AppBuilder's `OAUTH_PROVIDERS` mechanism plus one small
`CUSTOM_SECURITY_MANAGER` config class. `integrations/applications/superset.yaml` registers it
(`enabled: true`).

**Verified live**: full login → Superset issues its own session cookie → `GET /api/v1/me/` returns
the correct `email`/`first_name`.

### Two real interop bugs found and fixed

1. **Authlib installed via plain `pip install` never reached the app** — the official image's
   `superset` console script runs inside an isolated `uv`-managed venv at `/app/.venv`. Fixed in
   the `Dockerfile`: `uv pip install --python /app/.venv/bin/python Authlib==1.3.2`.
2. **Flask-AppBuilder only knows how to parse OAuth userinfo responses for a fixed list of named
   providers** (`github`, `google`, `azure`, `okta`, `authentik`, ...) — a generic OIDC provider
   named `hydra` hits `OAuthProviderUnknown`. Fixed via `CUSTOM_SECURITY_MANAGER` overriding
   `get_oauth_user_info`.

Same pitfalls as every other Flask-AppBuilder/Authlib app here: PKCE is opt-in
(`code_challenge_method` must be set explicitly), and the client defaults to `client_secret_basic`.
Superset never hit the `localhost`-resolves-to-self bug, because it's proxied through Oathkeeper at
`/apps/superset/*` rather than making a direct container-to-container discovery call.

### How to log in

Open `http://localhost:4455/apps/superset` (through Oathkeeper), click **Sign In with hydra**, sign
in, land on Superset's dashboard.

### Troubleshooting

| Symptom | Cause | What to check |
|---|---|---|
| `ModuleNotFoundError('authlib')` during `superset db upgrade` | Authlib installed outside the isolated `uv` venv | `uv pip install --python /app/.venv/bin/python Authlib==1.3.2` |
| `Error returning OAuth user info:` (message swallowed) | Flask-AppBuilder doesn't recognize `hydra` as a named provider | Confirm `CUSTOM_SECURITY_MANAGER` overrides `get_oauth_user_info` |
| `invalid_request: ... code_challenge` | PKCE opt-in | Confirm `code_challenge_method` is set in `client_kwargs` |
| `invalid_client` at token exchange | Auth method mismatch | Superset needs `client_secret_basic` |

---

## Airflow

Apache Airflow shows a slightly different wiring pattern: instead of running on its own bare port,
it's reached **through Oathkeeper's proxy**, at a path prefix, because its own
`AIRFLOW__WEBSERVER__BASE_URL` config option needs to match wherever it's actually reachable from a
browser.

[Apache Airflow](https://github.com/apache/airflow) v2.10.5 runs from its **unmodified official
image** (`apache/airflow:2.10.5`), configured through Flask-AppBuilder's `OAUTH_PROVIDERS`
mechanism plus a small `SECURITY_MANAGER_CLASS` config class — the same extension point Superset
uses. `integrations/applications/airflow.yaml` registers it (`enabled: true`).

**Verified live**: full login → Airflow creates its own local user record → confirmed via
`airflow users list` showing the platform identity's UUID as username, correct email and name,
auto-assigned the `Viewer` role.

**Important, confirmed-live detail**: Airflow's `AIRFLOW__WEBSERVER__BASE_URL` is literally
`http://localhost:4455/apps/airflow` — hitting the bare port root directly
(`http://localhost:9929/`) 404s by design, not a bug.

### Two historical bugs, now fixed

1. **`invalid_request` from Hydra** — the registry originally registered Airflow's direct-port
   callback, but Flask-AppBuilder actually sends
   `http://localhost:4455/apps/airflow/oauth-authorized/hydra`. Fixed by correcting
   `integrations/applications/airflow.yaml`'s `redirect_uris`.
2. **`invalid_client` at token exchange** — the registered client secret contained literal `+`/`/`
   characters mishandled somewhere in the pipeline. Fixed by regenerating
   `AIRFLOW_OIDC_CLIENT_SECRET` as a safe alphanumeric-only secret.

### How to log in

Open `http://localhost:4455/apps/airflow` (never the bare port), click **Sign In with hydra**, sign
in, Hydra consent auto-accepts, land on Airflow's dashboard as `Viewer`.

### Troubleshooting

| Symptom | Cause | What to check |
|---|---|---|
| Bare `http://localhost:9929/` 404s | Expected — Airflow's `base_url` is `/apps/airflow` | Always go through `http://localhost:4455/apps/airflow` |
| `redirect_uri does not match` | **Resolved historical bug** | `integrations/applications/airflow.yaml`'s `redirect_uris` is now the Oathkeeper-proxied path |
| `invalid_client` at token exchange | **Resolved historical bug** — unsafe secret characters | Regenerate `AIRFLOW_OIDC_CLIENT_SECRET` alphanumeric-only if this recurs |
| `invalid_request: ... code_challenge` | PKCE opt-in in Authlib | Confirm `code_challenge_method` set in `client_kwargs` |
| `OAuthProviderUnknown` in logs | Flask-AppBuilder doesn't recognize `hydra` | Confirm `SECURITY_MANAGER_CLASS` overrides `get_oauth_user_info` |

---

## NeoBIM family — UI demo and auth context

This section covers everything NeoBIM/aec-craft-related: the NeoBIM UI demo app, why NeoBIM's own
Better-Auth-based authorization server is deliberately *not* deployed here, and the real BuildOS
integration.

| Sub-topic | What it is | Status |
|---|---|---|
| NeoBIM UI | A sample relying party wearing NeoBIM's own design system | Registered, full login verified live (after the shared networking fix) |
| NeoBIM Platform's own auth | `platform-neobim/apps/auth` — a full, independent OAuth2/OIDC authorization server (Better Auth), kept for context only | Deliberately not built/run/deployed anywhere in this repo |
| BuildOS integration | The external `buildos` repo's `apps/platform` pointed at this platform's Hydra | Hydra client real and confirmed live; full real-browser login verification pending |

### NeoBIM UI (demo app)

`applications/neobim/neobim-ui` is a Next.js application built from NeoBIM's own design system
(`ui-neobim/packages/ui`) plus a page layout harvested from `platform-neobim/apps/auth`, wired to
authenticate through **this platform's existing Ory Hydra + Kratos**. It runs at
`http://localhost:9930`, standalone. `integrations/applications/neobim-ui.yaml` registers it
(`enabled: true`). NeoBIM UI is **not** the same thing as `identity-ui` — `identity-ui` is this
platform's own admin console/self-service frontend; NeoBIM UI is a sample third-party-style app
that authenticates *against* this platform, the same way Mealie or Superset does.

It hit the same `localhost`-resolves-to-self networking bug as Mealie and Open WebUI (its own
`src/lib/oidc-config.ts` used `HYDRA_PUBLIC_URL` for both the browser-facing authorize URL and its
own server-side token-exchange calls) — fixed identically, via the same `/etc/hosts`-rewriting
entrypoint. **Verified live end-to-end via a real Playwright browser test.**

Open `http://localhost:9930`, click **Sign in with Identity Platform**, sign in, land on `/account`
showing your email, name, and subject.

### NeoBIM Platform's own auth system — why it's not deployed here

`platform-neobim/apps/auth` is not a login page waiting to be pointed at an external identity
provider — it is **itself a full OAuth2/OIDC authorization server**, built on Better Auth plus the
`@better-auth/oauth-provider` plugin, with its own `/oauth2/authorize`, `/oauth2/token`, its own
EdDSA-signed JWTs, its own `user`/`session`/`oauthClient` tables, and its own seeded first-party
OAuth clients for other apps in its monorepo. In short: this app is architecturally the same *kind*
of thing Ory Kratos+Hydra is in this platform — a second, independent identity provider, not a
consumer of one. Deploying it as-is would mean running a second, independent authentication system
side-by-side with Ory, directly contradicting "one centralized identity, everywhere." Instead: reuse
the visual layer only (NeoBIM UI, above), and separately point the external `buildos` repo's own
already-generic OIDC adapter at this platform's Hydra directly (BuildOS, below) — neither requires
`apps/auth` to run at all. Nothing inside `platform-neobim/` or `ui-neobim/` was modified.

### BuildOS integration

`buildos`'s `apps/platform` was already a relying party before this integration — it uses
`@aec-craft/platform-auth-nextjs` (`createPlatformAuth`), a fully protocol-generic OIDC adapter
(issuer, client ID/secret, redirect URI, scopes, and audience all read from environment variables).
Previously it pointed at NeoBIM Platform's own Better-Auth-based issuer. Repointing it at this
platform's Hydra instead required **zero `buildos` source code changes** — purely an
environment-variable change in its own git-ignored `apps/platform/.env.local`.

`integrations/applications/buildos.yaml` has `enabled: true`, and a real Hydra OAuth2 client exists (confirmed
via a direct admin API query: `client_id: buildos`, `redirect_uris:
["http://localhost:3000/auth/callback"]`, `audience: ["http://localhost:3100"]`). The
`@aec-craft/platform-auth-nextjs` adapter sends an RFC 8707 `resource` indicator on both the
authorize and token requests — Hydra rejects the request unless the client's `audience` field lists
that value. This can't be expressed through the registry schema, so it's set with one manual
follow-up call after every `make sync`:

```bash
curl -X PUT http://hydra:4445/admin/clients/buildos \
  -H "Content-Type: application/json" \
  -d '{"audience": ["http://localhost:3100"]}'
```

**Verification status — honest, not overclaimed**: the Hydra client is real and confirmed live via
a direct admin API query. Whether a full login was exercised through a real browser against
`buildos`'s actual dev server has not been confirmed — **integration wired, browser verification
pending**. Don't treat this as equivalent to the Playwright-verified status of Mealie/Open
WebUI/NeoBIM UI until that verification is actually run and recorded.

BuildOS's own Convex backend has no auth/session verification wired to the resulting token yet — a
disclosed gap in `buildos`'s own repository, not something this integration was scoped to close.

### Troubleshooting

| Symptom | Cause | What to check |
|---|---|---|
| **(Resolved)** NeoBIM UI's server-side token exchange fails | The now-fixed `localhost`-resolves-to-self bug | Confirm the custom `entrypoint` rewrites both IPv4/IPv6 for `neobim-ui` |
| `invalid_client` for NeoBIM UI | Auth method mismatch | `openid-client` v6 needs `client.ClientSecretBasic(secret)` explicitly |
| NeoBIM UI discovery fails with `OAUTH_HTTP_REQUEST_FORBIDDEN` | `openid-client` v6 refuses plain-HTTP issuers by default | `NEOBIM_OIDC_ALLOW_INSECURE_HTTP=true` (local only, never in a real deployment) |
| BuildOS authorize request rejected over `resource` | Hydra client's `audience` doesn't list `PLATFORM_API_URL`'s value | Re-run the manual `PUT /admin/clients/buildos` — this doesn't survive a plain `make sync` |

---

## CBM Demo (Cognitive Building Model Lab)

`cbm-demo` (`https://github.com/aec-craft/cbm-demo`) is a local sibling repository, never pushed
upstream — a 3D building-model viewer, "a throwaway lab for the cognitive building model." Its
`apps/app` (the Next.js viewer shell) is the only piece with authentication, integrated here using
the identical `@aec-craft/platform-auth-nextjs` pattern already proven for BuildOS.

**Before**: `apps/app` pointed at a shared "Platform App" OAuth2 client belonging to the actual
`platform` repo — in effect, borrowing another app's identity. **After**: a dedicated Hydra client
(`cbm-demo`) was registered, and the app's own `auth.ts` was edited **locally only** (never
committed — this checkout is disposable) to point at it directly:

```typescript
export const auth = createPlatformAuth({
  issuer: env("AUTH_ISSUER"),           // http://localhost:4455 (this platform's Oathkeeper)
  clientId: env("AUTH_CLIENT_ID"),      // cbm-demo
  getClientSecret: () => process.env.AUTH_CLIENT_SECRET!,
  redirectUri: env("AUTH_REDIRECT_URI"),
  scopes: ["openid", "profile", "email", "offline_access"],
  audience: env("PLATFORM_API_URL"),
  apiBaseUrl: env("PLATFORM_API_URL"),
  postLoginRedirect: "/",
  postLogoutRedirect: "/auth/login",
});
```

This required **zero changes to the shared `platform` or `ui` repos** — same pattern as BuildOS.
Runs on port **3004** (the app's own default 3002 was already bound by the real `platform` repo's
own dev server on this machine — a local-only port change, not a registry requirement).

`integrations/applications/cbm-demo.yaml` (`enabled: true`); its Hydra `audience` was set to
`http://localhost:3100` via the same manual follow-up `PUT` pattern as BuildOS.

**Browser verification (HTTP-level, cookie-jar-driven, not a full Playwright pass)**: unauthenticated
request to `/` correctly redirects to `/auth/login` (307); PKCE authorize request well-formed; client
secret confirmed valid at Hydra's token endpoint; full login as Marcus Chen (Platform Admin)
completed — real password auth, login/consent auto-accepted, real authorization code issued, real
`sparc_at`/`sparc_rt` cookies set after the callback. No new identities were created — login was
verified against the NeoBIM demo roster as it existed at the time (see
[chapter 5](../05-development/README.md#enterprise-test-dataset--neobim-retired) — that dataset has
since been retired; `marcus.chen@neobim.example` still exists and this verification would still
pass against it today, see [chapter 8](../08-reference/README.md#signing-up-signing-in-and-the-live-test-dataset)
for the current dataset).

### Known limitations

- **The app's own homepage returns a 500**, unrelated to authentication — a pre-existing
  version-skew issue between two independently-evolving sibling repos (`platform-sdk`'s checked-out
  version doesn't export a class the app imports), out of scope for this identity-platform
  integration to fix.
- **Logout is not fully verified end-to-end** — the same crash happens inside Next.js's middleware
  chain before `/auth/logout` runs. Separately, `createLogoutHandler`'s real source redirects to a
  Better Auth-specific `${issuer}/logout?callbackURL=...` convention that doesn't match this
  platform's real self-service logout route (`/auth/logout`, no bare `/logout`, no `callbackURL`) —
  RP-initiated logout back to this Ory platform would need a compatibility route or reconfiguring
  this handler call.
- **`PLATFORM_API_URL`/`audience` has no real backing service** in this local setup (same disclosed
  caveat as BuildOS).

### Troubleshooting

| Symptom | Cause | What to check |
|---|---|---|
| "Module not found: @aec-craft/platform-auth-nextjs" | `pnpm.overrides` missing or `pnpm install` not re-run | Check root `package.json`'s overrides |
| Turbopack "Module not found" for a package that exists on disk | `turbopack.root` not set to the common ancestor of `cbm-demo` and linked sibling repos | Add/verify in `next.config.ts` |
| Port 3002 already in use | A pre-existing `platform` repo dev server | Use a different port (this integration uses 3004) |
| `invalid_client` at token endpoint | `AUTH_CLIENT_SECRET` mismatch | Re-check `.env.local` matches `integrations/applications/cbm-demo.yaml`'s secret env var value |

---

## Validation apps, cross-app bug catalog, and the reference client

Four small, custom applications exist purely to validate this platform's own identity and
authorization behavior — not products, never pushed anywhere, and (unlike Mealie/Superset/
Airflow/Open WebUI) written specifically for this repository: Flask Identity Viewer, FastAPI RBAC
Playground, Streamlit Enterprise Portal, and the disabled-but-real `authlib-demo` reference client.

Source lives under `applications/examples/flask-identity-viewer/`, `applications/examples/fastapi-rbac-playground/`,
`applications/examples/streamlit-enterprise-portal/`, and `applications/examples/authlib-demo/`. The first three each
have their own `Dockerfile` and Compose service:

```bash
docker compose -f deployment/docker/compose/docker-compose.yml \
  -f deployment/docker/compose/docker-compose.dev.yml \
  -f deployment/docker/compose/docker-compose.applications.yml \
  up -d flask-identity-viewer fastapi-rbac-playground streamlit-enterprise-portal
```

All three register real Hydra OAuth2 clients — run `make sync` after first bringing them up.
`authlib-demo` has no default Compose service and is `enabled: false` by default.

### Cross-app status summary

| App | Stack | Kind | Server-side token exchange |
|---|---|---|---|
| Mealie | Python + FastAPI | Real upstream | Verified working |
| Open WebUI | Python + FastAPI | Real upstream | Verified working |
| Superset | Python + Flask | Real upstream | Verified working |
| Airflow | Python + Flask | Real upstream | Verified working |
| NeoBIM UI | TypeScript + Next.js | NeoBIM-branded demo | Verified working |
| BuildOS | External sibling repo, Next.js | Real, newly integrated | Hydra client wired; full browser login verification pending |
| Flask Identity Viewer | Python + Flask | Custom validation harness | Verified working (avoids the networking pitfall by design) |
| FastAPI RBAC Playground | Python + FastAPI | Custom validation harness, full OIDC relying party | Verified working |
| Streamlit Enterprise Portal | Python + Streamlit | Custom validation harness | Verified working |
| authlib-demo | Python + FastAPI (Authlib) | Reference client, `enabled: false` | Verified working (when enabled) |

### The `localhost`-resolves-to-self networking bug — the fix these harnesses demonstrate by design

Flask Identity Viewer, FastAPI RBAC Playground, and Streamlit Enterprise Portal each use **two
different base URLs, deliberately**: the browser-facing authorize redirect uses
`OATHKEEPER_PUBLIC_URL` (`http://localhost:4455`); every server-side call (token exchange,
userinfo, refresh) uses `OATHKEEPER_INTERNAL_URL` (`http://oathkeeper:4455`) instead of following
whatever the discovery document happens to advertise:

```python
# applications/examples/flask-identity-viewer/app.py
PUBLIC_URL = os.environ.get("OATHKEEPER_PUBLIC_URL", "http://localhost:4455")
INTERNAL_URL = os.environ.get("OATHKEEPER_INTERNAL_URL", "http://oathkeeper:4455")
...
return redirect(f"{PUBLIC_URL}/oauth2/auth?{query}")   # browser-facing
...
resp = requests.post(f"{INTERNAL_URL}/oauth2/token", ...)   # server-side
```

This is the same class of fix the `/etc/hosts` rewrite achieves for Mealie/Open WebUI/NeoBIM UI —
solved at the application-config layer instead of the container-network layer, since these three
were written with this platform in mind from the start.

### Flask Identity Viewer — `http://localhost:9931`

A real OIDC relying party for seeing exactly what a successful login produces: the real
`/userinfo` response, decoded ID/access token claims (decoding only, not signature-verifying), the
raw tokens, a **Refresh token** button (a real `grant_type=refresh_token` exchange), and the signed-
in identity's real Keto relation tuples.

### FastAPI RBAC Playground — `http://localhost:9932`

**Converted from a paste-a-token-only tool into a full OIDC relying party**: its own registry entry
and Hydra client, session-based login modeled on Flask Identity Viewer's pattern. Exercises
**authorization**, not just authentication:

| Endpoint | What it checks | Without a session/token | With one |
|---|---|---|---|
| `GET /api/public` | Nothing | `200` | `200` |
| `GET /api/protected` | Token is active (real Hydra introspection) | `401` | `200` |
| `GET /api/admin-only` | Token valid **and** `Organization:platform#admin` (real Keto check) | `401` | `200` if admin, `403` if not |
| `GET /api/organizations/{org_id}/view` | Token valid **and** `Organization:{org_id}#view` (real Keto check) | `401` | `200` if permitted, `403` if not |

Every check is a real HTTP call to Hydra's `/admin/oauth2/introspect` and/or Keto's
`/relation-tuples/check` — no local token validation or permission logic is duplicated.

### Streamlit Enterprise Portal — `http://localhost:9933`

A business-app-shaped UI (Dashboard, Engineering, Finance, HR, Platform Admin) whose sidebar only
shows the pages the signed-in identity actually has access to — each gated by a real, live Keto
check evaluated on every page load. This was originally demoed by signing in as different
department-scoped NeoBIM users to watch the sidebar change; that dataset has since been retired
(only `marcus.chen@neobim.example` survives — see
[chapter 8](../08-reference/README.md#signing-up-signing-in-and-the-live-test-dataset)), so the
department-by-department sidebar comparison can no longer be demonstrated with a normal user today.
The gating mechanism itself is unaffected — it still checks real Keto tuples on every page load —
but exercising the multi-department contrast again would need new `Resource`/`Organization` tuples
granted to the current Sparc Engineering identities, which do not exist yet.

**A real, working technique worth knowing**: Streamlit's `st.link_button` opens the OAuth authorize
URL in a **new browser tab**, which gets a fresh server-side Streamlit session with no access to
the original tab's `st.session_state` — so a PKCE `code_verifier` stashed there is unreachable when
the new tab's session handles the callback. The fix: generate the PKCE code verifier, and use it
**directly as the OAuth2 `state`** value — a single random ≥43-character token satisfies both
Hydra's `state`-length requirement (≥8 characters) and PKCE's verifier-length requirement, and Hydra
echoes `state` back verbatim on the callback. No server-side session state needs to survive the
tab hop.

### authlib-demo — reference client, `enabled: false`

A small, purpose-built reference OIDC client — written *for* this repository, not a real
third-party product — to exercise this platform's raw OIDC surface directly (discovery,
authorization code + PKCE, token exchange, userinfo, a Keto-protected API call, RP-initiated
logout) with minimal, readable code. `integrations/applications/authlib-demo.yaml` is real and intentionally
`enabled: false` — a reference app you run manually, not a long-lived service in the default stack.

Run it (no default Compose service):

```bash
docker run --rm -p 3200:3200 -v "$(pwd):/app" -w /app python:3.13-slim sh -c "
  pip install --quiet fastapi 'uvicorn[standard]' authlib httpx itsdangerous &&
  PYTHONPATH=src uvicorn authlib_demo.main:app --host 0.0.0.0 --port 3200"
```

Flip `enabled: false` to `true`, export `AUTHLIB_DEMO_SECRET`, and run `make sync` first.

## Centralized identity

**Verified live**: the same platform identity, registered once via Kratos, has been logged into
Mealie, Open WebUI, Superset, Airflow, and NeoBIM UI independently — each app creating its own
local account/session tied to that one identity, with no separate password anywhere. This is the
core "register once, log in once, use everywhere" story.

*Honest scope note on logout*: none of these apps implements OIDC back-channel/front-channel logout
(most self-hosted OIDC RPs don't). Logging out of the platform's Kratos session revokes the ability
to mint *new* tokens for other apps, but an app's own already-issued session remains valid until
that app's own session expires — standard OIDC behavior, not a platform gap.

## Cross-app bug catalog

Every one of these was found by actually driving a live login, not by inspecting config:

1. This platform's Hydra **enforces PKCE for all clients** — a client that omits `code_challenge`
   gets `invalid_request` at the authorize endpoint.
2. A client's `token_endpoint_auth_method` must match its Hydra registration — this repo's registry
   convention is `client_secret_post`, but Mealie, Open WebUI, Superset, Airflow, and NeoBIM UI's
   clients all default to `client_secret_basic` instead.
3. Org/role membership arrives as **ID-token claims** (via auth-service's login `context`), not a
   custom OAuth scope.
4. **`/userinfo` was never routed by Oathkeeper** — only `/oauth2/*` and `/.well-known/*` had
   rules. Mealie was the first client tested that calls the userinfo endpoint separately; it 404'd
   until a `hydra-userinfo-rules` rule was added.
5. **The `name` claim must be a string, not an object.** OIDC Core 5.1 requires `name` to be a plain
   string; this platform's identity schema stores it as `{"first": ..., "last": ...}`. Fixed in
   `auth-service`'s `_display_name()` helper.
6. **Kratos was missing `oauth2_provider.url`** — 500'd on every fresh, non-remembered Hydra login.
7. **auth-service's consent handler lost the login context** once Kratos could complete the Hydra
   login itself.
8. **Superset's official image installs into an isolated `uv` venv** that plain `pip install`
   doesn't reach.
9. **Flask-AppBuilder only recognizes OAuth userinfo responses for a fixed list of named
   providers** — fixed via a security-manager subclass overriding `get_oauth_user_info`.
10. **Two real bugs building Streamlit Enterprise Portal**: its authorize URL initially omitted
    `state`; Hydra enforces PKCE regardless of client confidentiality, and a new-tab session can't
    see a stashed verifier — fixed by using the verifier as `state` (see above).
11. **The `localhost`-resolves-to-self Docker networking bug** — Mealie's, Open WebUI's, and NeoBIM
    UI's server-side token exchange all failed for the same root cause — fixed via a custom
    `/etc/hosts`-rewriting entrypoint covering both IPv4 and IPv6.
12. **Airflow's registered redirect_uri initially pointed at its direct port**, then its client
    secret contained unsafe characters — both fixed.
13. **Open WebUI's own user-activation gate** blocks every non-first OIDC-provisioned user as
    `pending` regardless of successful Ory authentication — fixed via `DEFAULT_USER_ROLE` plus a
    one-time admin API call.

## Candidates evaluated and found unsuitable

Two candidates were evaluated and documented rather than forced into a fake integration:

- **Tandoor Recipes** — django-allauth's `openid_connect` provider never generates a PKCE
  `code_challenge`, confirmed by reading the installed package source inside the container.
- **JupyterHub** — its `oauthenticator` library has no PKCE support at any pinned or latest
  version, the same class of gap as Tandoor. **JupyterHub is not, and has never been, an active
  integration in this platform** — it was evaluated and removed for exactly this reason; if any
  older document or comment still describes it as wired up, that's stale.

## What these validation apps are not

None of the four implement session persistence across a real page refresh via secure server-side
session storage — they're intentionally minimal harnesses. They also don't verify the ID token's
signature (Flask Identity Viewer decodes but doesn't verify).

## Troubleshooting (integrations-wide)

| Symptom | Likely cause | Fix |
|---|---|---|
| `make sync` runs but the app still isn't in `/console/applications` | The registry file's `enabled` field is still `false`, or the file is prefixed with `_` | Set `enabled: true`, remove any `_` prefix, re-run `make sync` |
| Hydra rejects the client with `invalid_client` at token exchange | `token_endpoint_auth_method` doesn't match what the app's own OIDC library actually sends | Check the app's own section above — several real apps here default to `client_secret_basic` |
| Authorize request fails with `invalid_request: ... must include a code_challenge` | This platform's Hydra enforces PKCE for every client | Enable PKCE explicitly in the app's own config |
| Login redirects and consent succeed, but the app 500s / connection-refuses right after | Historically, the `localhost`-resolves-to-self networking bug (now fixed for Mealie/Open WebUI/NeoBIM UI) | See each app's own Troubleshooting section |
| A harness's login redirects and consent succeed, then a 500/connection error | Should not happen for the four validation harnesses — if seen, check their `OATHKEEPER_INTERNAL_URL`/`HYDRA_ADMIN_URL`/`KETO_READ_URL` env vars point at internal Docker service names |

## FAQ

**Do I need to know OAuth2/OIDC to add an app here?** No — copy the template, fill in the fields,
set `enabled: true`, run `make sync`.

**Where do I see the actual login/consent/token flow explained?**
[Chapter 3](../03-user-guide/README.md) — this chapter is about registration, not flow mechanics.

**Can two apps share one OAuth2 client?** No — each app gets its own `client_id` in
`integrations/applications/`, even if two apps are otherwise identical in configuration.

**Are all sample apps fully working today?** Yes, for every app with its own registry entry
enabled — Mealie, Open WebUI, Superset, Airflow, NeoBIM UI, and all four validation apps have
verified working logins including their own server-side token exchange. BuildOS's Hydra client is
real and confirmed live; a full real-browser login verification is honestly flagged as pending.
CBM Demo is verified at the HTTP level; a full Playwright pass was not captured.

## Common mistakes

- Assuming every app uses `client_secret_post` — several real apps here default to
  `client_secret_basic` instead.
- Forgetting to export the `client_secret_env_var` before running `make sync`.
- Assuming a fresh 500 after a successful login/consent is a new platform bug — check each app's
  Troubleshooting section for prior, already-diagnosed causes first.
- Pointing a new harness's server-side calls at the public `localhost:4455` URL instead of the
  internal Docker address.
- Assuming every app here is fully working just because it's "registered" — check the status
  table, and BuildOS's/CBM Demo's honestly-flagged pending browser verification in particular.
- Re-diagnosing the `localhost`-resolves-to-self networking bug from scratch as if it were new.

## References / Related pages

- [Chapter 3 — User Guide](../03-user-guide/README.md) — OAuth2/OIDC flow mechanics
- [Chapter 5 — Development](../05-development/README.md) — the full platform API surface these
  apps integrate against
- [Chapter 8 — Reference](../08-reference/README.md) — every real port and URL
- [Chapter 9 — Architecture](../09-architecture/README.md) — full session-by-session verification
  history and the honest current-state matrix
