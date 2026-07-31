# 8. Reference

## Purpose

This chapter is the fast-lookup reference material for this platform: every real port and browser
URL, the environment-variable/config-schema surfaces, the security posture checklist, a demo
walkthrough script, and a glossary index. It is deliberately *not* where you'll find the deep
architecture reasoning, the ADRs, or the historical audit/planning documents — those live in
[chapter 9 — Architecture](../09-architecture/README.md). It is also not where you'll find the
per-service HTTP API endpoint reference — that's in
[chapter 5 — Development](../05-development/README.md#api-reference), since it's aimed at
developers extending the platform rather than at someone doing a quick lookup.

## Glossary

The full plain-language glossary — Identity, Session, OAuth2, OIDC, Tokens, PKCE, Relation tuple,
Tenant/Organization, ReBAC, zero-trust, AAL1/AAL2 — lives in
[chapter 1's glossary section](../01-introduction/README.md#plain-language-glossary), since every
other chapter assumes that vocabulary from the very first page a reader might open. This chapter
doesn't duplicate it — follow the link if a term elsewhere in this documentation sends you looking
for a definition.

## Port and URL reference

Every real port and browser URL this platform exposes on local Docker Compose, with the actual
values this repo's `.env` uses (compose-file defaults noted in parentheses where they differ).
Everything under `http://localhost:4455` is what a real end user or admin actually visits — the
rest are direct container ports, useful for debugging or admin-API access but not meant for regular
end users.

### The one real entry point: Oathkeeper (port 4455)

| URL | What it is | Auth required? |
|---|---|---|
| `/auth` | Home — sign in / create account (or, if signed in, account settings / sign out) | No |
| `/auth/registration` | Create an account — **disabled in every environment today**; shows a clean "registration disabled" page rather than a form. See [signing up](#signing-up-currently-disabled) below. | No |
| `/auth/login` | Sign in — Email → Continue → Passkey → Google/Microsoft → password (collapsed) | No |
| `/auth/verification` | Email verification (code sent via Mailhog in dev) | No |
| `/auth/recovery` | Forgot password | No |
| `/auth/settings` | Account settings — Profile, Security, Passkeys, Connected accounts, Devices, an inert "Organization SSO — coming soon" placeholder | Yes (own account) |
| `/auth/logout` | Sign out | Yes |
| `/auth/setup` | First-run admin bootstrap — self-disables once any admin exists | Yes (any signed-in account) |
| `/auth/console` | Admin console home (overview/dashboard) | Yes (platform-admin only — see [signing in as admin](#signing-in-as-the-platform-administrator) below) |
| `/auth/console/identities` | Browse/manage every Kratos identity | Yes (admin) |
| `/auth/console/sessions` | Active sessions across all identities — still a real, working page; removed only from the left nav (reach it by URL) | Yes (admin) |
| `/auth/console/organizations` | Organizations (tenants) + invitations | Yes (admin) |
| `/auth/console/organizations/<id>` | One organization's detail/members | Yes (admin) |
| `/auth/console/groups` | Group (Team) management — the newer Group/standing model used by the Sparc Engineering test dataset | Yes (admin) |
| `/auth/console/applications` | **"Application Integrations"** — merged table over registered YAML-backed apps and raw Hydra OAuth2 clients | Yes (admin) |
| `/auth/console/applications/<clientId>` | One registered application's detail/edit | Yes (admin) |
| `/auth/console/clients` | Redirects to `/auth/console/applications` (raw-client rows there link to `/auth/console/clients/<clientId>` for detail/edit) | Yes (admin) |
| `/auth/console/permissions` | Raw Keto relation-tuple browser | Yes (admin) |
| `/auth/console/roles` | Role catalog (naming layer over real Keto tuples) | Yes (admin) |
| `/auth/console/policies` | Policy assignments (Role × object × subject) | Yes (admin) |
| `/auth/console/identity-providers` | Social/enterprise OIDC provider config | Yes (admin) |
| `/auth/console/audit` | Audit event log | Yes (admin) |
| `/auth/console/reports` | DAU/WAU/MAU and other usage reports | Yes (admin) |
| `/auth/console/themes` | Theme editor + version history | Yes (admin) |
| `/auth/console/developer` | Developer Portal — OAuth 2.0 Playground, API keys | Yes (admin) |
| `/auth/console/plugins` | Plugin registry | Yes (admin) |
| `/auth/console/notifications` | Email template editor + test-send + delivery history | Yes (admin) |
| `/auth/console/settings` | Console-level settings (import/export config, Administrators) | Yes (admin) |
| `/auth-legacy/*` | The upstream `kratos-selfservice-ui-node` self-service UI (ADR-0011), an alternate reference implementation of the same flows | No |

**Removed entirely** (not just hidden): `/auth/console/flows` (Authentication Flows) — the console page was removed; the same configuration now lives directly in `ory/kratos/config/kratos.yaml.tmpl`'s `selfservice.methods` block, edited by hand followed by `make restart`. There is no browser URL for it anymore.

### Direct Ory component ports (not proxied, mostly for admin/API/debugging)

| Service | Port | What's there |
|---|---|---|
| Kratos public API | `4433` | `/self-service/*`, `/sessions/whoami` — same as Oathkeeper's `/.ory/kratos/public` |
| Kratos admin API | `4434` | Identity CRUD, session management — **never expose publicly** |
| Hydra public API | `4444` | `/oauth2/*`, `/.well-known/*` — same as Oathkeeper's root |
| Hydra admin API | `4445` | OAuth2 client CRUD, consent/login challenge management — **never expose publicly** |
| Keto read API | `4466` | `/relation-tuples/check`, `/relation-tuples` (GET), `/relation-tuples/expand` (GET) |
| Keto write API | `4467` | `/admin/relation-tuples` (PUT/DELETE) — **never expose publicly** |
| Oathkeeper proxy | `4455` | The real public entry point |
| Oathkeeper admin API | `4456` | Access rule management — **never expose publicly** |

### Platform services (Python/FastAPI) — direct ports

All 11 real backend services, each with its own `/healthz`. A real deployment should not expose them
publicly either — see [chapter 5](../05-development/README.md#api-reference) for the full endpoint
reference behind each.

| Service | Port | Backs |
|---|---|---|
| `app-registry` | `8080` | Applications console page |
| `tenant-service` | `8081` | Organizations console page |
| `hooks-service` | `8082` | Kratos registration/login webhooks, `/auth/setup` bootstrap endpoints |
| `auth-service` | `8083` | Hydra login/consent/logout ↔ Kratos session bridge |
| `email-service` | `8084` | Sends real email via the SMTP plugin |
| `notification-service` | `8085` | Notifications console page |
| `console-api` | `8086` | Identities/sessions/clients/permissions/themes console pages |
| `audit-service` | `8087` | Audit Logs console page |
| `plugin-service` | `8088` | Plugins console page |
| `flow-service` | `8089` | Authentication Flows console page |
| `authorization-service` | `8090` | Roles/Policies console pages |

### Frontends — direct ports

| App | Port | Notes |
|---|---|---|
| `identity-ui` | `3010` | The real frontend — same content Oathkeeper serves at `/auth/*` |
| `auth-ui` (upstream, legacy) | `3005` | The adopted `kratos-selfservice-ui-node` — same content Oathkeeper serves at `/auth-legacy/*` |

### Observability stack

| Service | Port | What's there |
|---|---|---|
| Prometheus | `9090` | Metrics, `/-/ready` for health |
| Grafana | `3001` | Dashboards, `admin`/`admin` by default in dev |
| Loki | `3100` | Log aggregation, `/ready` for health |
| Tempo | `3200` (query), `4318` (OTLP HTTP), `9411` (Zipkin) | Distributed tracing |
| OTel Collector | `4317` (gRPC), `4318` (HTTP), `8889` (Prometheus metrics) | Collects traces/metrics from every instrumented service |

### Sample applications

| App | Port | Registered as a Hydra client? | Notes |
|---|---|---|---|
| Mealie | `9925` | `integrations/applications/mealie.yaml`, `enabled: true` | Standalone OIDC RP, own port |
| Superset | `9928` | `integrations/applications/superset.yaml`, `enabled: true` | Proxied via Oathkeeper at `/apps/superset/*` |
| Airflow | `9929` | `integrations/applications/airflow.yaml`, `enabled: true` | Proxied via Oathkeeper at `/apps/airflow/*` |
| Open WebUI | `9927` | `integrations/applications/open-webui.yaml`, `enabled: true` | Standalone, own port |
| NeoBIM UI (demo app) | `9930` | `integrations/applications/neobim-ui.yaml`, `enabled: true` | Standalone, own port |
| BuildOS | `3000` (external repo) | `integrations/applications/buildos.yaml`, `enabled: true` | Own dev server, run separately |
| CBM Demo | `3004` (external repo) | `integrations/applications/cbm-demo.yaml`, `enabled: true` | Own dev server, run separately |
| Flask Identity Viewer | `9931` | `integrations/applications/flask-identity-viewer.yaml`, `enabled: true` | Custom validation harness |
| FastAPI RBAC Playground | `9932` | `integrations/applications/fastapi-rbac-playground.yaml`, `enabled: true` | Custom validation harness |
| Streamlit Enterprise Portal | `9933` | `integrations/applications/streamlit-enterprise-portal.yaml`, `enabled: true` | Custom validation harness |
| `authlib-demo` | `3200` | `integrations/applications/authlib-demo.yaml`, `enabled: false` by default | Reference OIDC client |
| Mailhog (dev SMTP inbox) | `8025` (web UI), `1025` (SMTP) | n/a | Every email this platform sends in dev lands here |

JupyterHub was evaluated as a sample application and removed — see
[chapter 6](../06-integrations/README.md#candidates-evaluated-and-found-unsuitable).

**Genuine limitation**: any sample app doing a real server-side OAuth token exchange fails at that
step unless it's one of the apps this platform has specifically fixed for it (see
[chapter 6](../06-integrations/README.md)), because Oathkeeper's OIDC discovery document returns
`http://localhost:4455/...` endpoints — correct for the browser, but each app's own container
resolves `localhost` to itself, not Oathkeeper, when it calls that URL server-side.

### Postgres (never exposed in a real deployment — dev-only host ports)

| Database | Port | Owns |
|---|---|---|
| `postgres-kratos` | `5432` | Kratos identities/sessions |
| `postgres-hydra` | `5533` | Hydra OAuth2 clients/tokens/consent |
| `postgres-keto` | `5434` | Keto relation tuples |
| `postgres-platform` | `5435` | All 11 platform services share this one Postgres instance, separate schemas |
| `redis` | `6379` | Session/cache store shared across platform services |

A real production deployment should expose **only** Oathkeeper's proxy port (`4455`, typically
behind TLS on `443`) publicly. Every admin API and both Postgres instances must stay
internal-network-only — see [chapter 7](../07-operations/README.md#production-hardening--an-honest-inventory).

## Environment variable reference

`.env.example` (copied to your own git-ignored `.env`) is the single file that configures this
entire local deployment. [Chapter 2](../02-installation/README.md#step-2--create-your-env-file)
covers the variables that matter most before your first run — platform basics, the Ory
public/admin port pairs, database credentials, `identity-ui`'s own secrets, email/Mailhog, and
social login placeholders. This section covers the remaining variables worth knowing as reference:

| Variable | Purpose |
|---|---|
| `PLATFORM_ENV` | `local` for the default workflow |
| `PLATFORM_BASE_URL` | The Oathkeeper proxy address — the URL a browser actually visits |
| `KRATOS_SECRETS_CIPHER` | Must be exactly 32 raw characters (not base64) — an AES-256 key |
| `HYDRA_SECRETS_SYSTEM`, `HYDRA_SECRETS_COOKIE`, `HYDRA_PAIRWISE_SALT` | Hydra's own signing/session secrets |
| `POSTGRES_KRATOS_*` / `POSTGRES_HYDRA_*` / `POSTGRES_KETO_*` / `POSTGRES_PLATFORM_*` | Per-database credentials — one set per isolated Postgres instance |
| `IDENTITY_UI_PORT` | `identity-ui`'s internal container port (default `3010`) |
| `COOKIE_SECRET` / `CSRF_COOKIE_SECRET` | Session/CSRF cookie signing for `identity-ui` itself |
| `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT` | Which email plugin is active — `smtp` pointed at Mailhog by default |
| `SOCIAL_GOOGLE_CLIENT_ID` / `SOCIAL_GOOGLE_CLIENT_SECRET` (and the Microsoft/GitHub/GitLab/Apple equivalents) | Real credentials for social login providers — see [chapter 4](../04-administration/README.md#7-identity-providers-social--enterprise-login) for how they're then enabled/disabled |

`automation/setup/generate-secrets.sh` fills in every secret-shaped variable automatically — see
[chapter 2](../02-installation/README.md#step-3--generate-secrets-and-certificates).

## Config schema reference

Two schema-validated YAML surfaces are worth knowing as reference points:

- **`integrations/applications/*.yaml`** (validated against `configuration/schemas/app-registry.schema.json`, Draft-07
  JSON Schema, `additionalProperties: false`) — the OAuth2/OIDC client registry. Fields:
  `client_id`, `client_name`, `redirect_uris`, `post_logout_redirect_uris`, `grant_types`, `scope`,
  `client_secret_env_var`, `token_endpoint_auth_method`, `enabled`, `tenant_id`, `tags`. See
  [chapter 6](../06-integrations/README.md#source-of-truth-registryappsyaml) for the full field
  notes and onboarding walkthrough. Notably **absent**: `description`, `icon`, `category`,
  `ordering` — fields a future visual "application launcher" might want, but which this schema has
  no concept of today, since its job is narrowly "declare a Hydra OAuth2 client."
- **`configuration/authorization/roles/*.yaml`** — the Role catalog, one file per role, each naming a
  `(namespace, relation)` pair from a hardcoded, verified list. See
  [chapter 4](../04-administration/README.md#6-authorization--permissions-roles-and-policies) for
  the full schema and starter-catalog table.
- **`configuration/identity-providers.yaml`** — a plain enable/disable checklist for social login
  providers, not where credentials live. See
  [chapter 4](../04-administration/README.md#7-identity-providers-social--enterprise-login).
- **`configuration/flows/*.yaml`** — authentication flow definitions (`id`, `name`, `type`, `enabled`,
  `steps`). See [chapter 5](../05-development/README.md#3-adding-a-new-authentication-flow).
- **`configuration/themes/*.yaml`** — branding, mirroring `identity-ui/themes/types.ts`'s `Theme`
  interface field-for-field. See [chapter 5](../05-development/README.md#themes).
- **`configuration/platform.yaml` / `configuration/cloud.yaml`** — an aspirational single-source-of-truth
  configuration file, validated by `automation/validation/validate_config.py` (`make validate-tools`) but **not
  actually consumed** by Compose/Kubernetes/Helm/Terraform, each of which defines its own values
  independently. Don't treat setting a value here as equivalent to configuring the running system —
  see [chapter 9](../09-architecture/README.md) for the full disclosure.

## API surfaces

The complete, endpoint-by-endpoint reference for all 11 `platform/*` services — including the real
`client_credentials` API-key flow, and every verified Ory OSS limitation relevant to integrating
against this platform — lives in
[chapter 5 — Development](../05-development/README.md#api-reference). It's kept there rather than
here because it's written for someone actively writing code against these services, with worked
examples and a troubleshooting table alongside it, rather than a bare lookup table.

## Security guide

### Non-negotiable controls

- Do not commit secrets or use placeholder cryptographic secrets in a running environment.
- Keep Ory admin APIs private — never expose Kratos's, Hydra's, or Keto's admin/write ports
  publicly (see the [port reference](#port-and-url-reference) above).
- Route public traffic through Oathkeeper or a deliberately configured ingress boundary.
- Use generated local secrets only in ignored `.env` files; use a managed secret provider outside
  local development.
- Review and pin every upstream UI/application integration before deployment.

See [chapter 9](../09-architecture/README.md) for the current, up-to-date state of every
security-relevant finding, and [chapter 7](../07-operations/README.md#production-hardening--an-honest-inventory)
for the honest gap between what's hardened today and what a real production rollout still needs.

## Signing up, signing in, and the live test dataset

This section is the practical, step-by-step companion to the URL table above: exactly how to sign
up, how to sign in as a normal user, how to sign in as the platform administrator, and the full
current roster of test identities/groups/organizations/roles/permissions you can sign in with
right now, with every real password. Everything here was live-verified against the running stack,
not assumed from a design document.

### Signing up (currently disabled)

Self-service registration is **deliberately disabled in every environment**, including local dev —
this is intentional platform policy, not a bug. Visiting `http://localhost:4455/auth/registration`
shows a clean "Registration is currently disabled — contact an administrator" page instead of a
form; hitting the underlying Kratos flow endpoint directly
(`GET http://localhost:4433/self-service/registration/browser`) returns a real `400` with body
`{"error":{"id":"self_service_flow_disabled", ...}}`. There is no user-facing way to create a new
account today. Use one of the pre-seeded identities below instead.

**To re-enable registration** (for development/testing only): set `SELF_REGISTRATION_ENABLED=true`
in `.env`, then run `make restart`. If you do re-enable it, the form only ever collects **Email,
First Name, Last Name** — nothing else — by design (everything else belongs in Account Settings
after the account exists).

### Signing in as a normal user

1. Open **`http://localhost:4455/auth/login`** in a browser.
2. Type one of the emails from the [Sparc Engineering roster](#the-sparc-engineering-test-dataset-primary-live-dataset)
   below into the identifier field and click **Continue**.
3. The page will offer Passkey and Google/Microsoft first — click **"Use password instead"** to
   expand the password field (it's collapsed by default, not removed).
4. Enter the password **`SparcEngineering2026!Secure`** (the same password for all 10 identities in
   this dataset) and submit.
5. You'll land on `/auth/settings` (account settings) — normal users have **no link to the admin
   console anywhere in the UI**, and typing `/auth/console` directly redirects them to
   `/auth/unauthorized` (verified live for all 10 identities in this dataset — none of them can
   reach it).
6. To test a specific permission, call the real permit-check endpoint directly — see
   [Testing permissions directly](#testing-permissions-directly-no-ui-needed) below.

### Signing in as the platform administrator

1. Open **`http://localhost:4455/auth/login`**.
2. Identifier: **`marcus.chen@neobim.example`**. Password: **`NeoBIM2026!Secure`**.
3. Click **"Use password instead"** the same way as above, then submit.
4. Once signed in, open **`http://localhost:4455/auth/console`** — this identity is the **only**
   one in the entire platform that can reach it (it's the sole holder of the real Keto tuple
   `Organization:platform#admin`, which `identity-ui/middleware.ts` checks on every `/console/*`
   request).
5. From the console home you can reach every page in the [URL table](#the-one-real-entry-point-oathkeeper-port-4455) above —
   Identities, Application Integrations, Groups, Audit Logs, Reports, Permissions, Roles, Policies,
   Identity Providers, Themes, Plugins, Developer Portal, Notifications, and Console Settings.

**There is currently only one admin identity.** This was a deliberate decision (not an oversight):
a second candidate admin (Marius Albrecht, see below) was considered and explicitly **not**
granted `Organization:platform#admin` this pass — see
[chapter 9](../09-architecture/README.md#group-authorization-model--authz-architecturehtml-s-design-implemented-as-a-foundation)
for the full reasoning. If `marcus.chen@neobim.example` is ever deleted or its password lost, there
is currently no documented recovery path to regain `/console` access — see
[chapter 9's remaining risks](../09-architecture/README.md).

### The Sparc Engineering test dataset (primary, live dataset)

Seeded by `automation/database/seed/seed_group_model_dataset.py` — a small, realistic engineering
firm using this platform's newer **Group** authorization model (standings `owners > managers >
editors > viewers`, see [chapter 9](../09-architecture/README.md) for the full model). This is the
dataset to use for almost all testing today; the older 38-person "NeoBIM" dataset was retired (see
[chapter 5](../05-development/README.md#enterprise-test-dataset--neobim-retired)) and only
`marcus.chen@neobim.example` survives from it, kept solely as the platform admin.

**Password for all 10 identities below: `SparcEngineering2026!Secure`**

**Groups** (6 total, a real `parent`-linked tree — org → project → contractor → package):

| Group | Display name | Parent | Role in the tree |
|---|---|---|---|
| `sparc` | Sparc Engineering | *(none — org root)* | The client/org principal's own group |
| `nbu-clinic` | NorthBuild Clinic | `sparc` | The one project |
| `acme-mep` | Acme MEP | `nbu-clinic` | A contractor on the project |
| `stahlbau-huber` | Stahlbau Huber | `nbu-clinic` | A contractor on the project |
| `schmidt-architekten` | Schmidt Architekten | `nbu-clinic` | A contractor on the project |
| `acme-mep-controls` | Acme MEP — Controls Package | `acme-mep` | A sub-package 3 levels deep, demonstrating multi-level traversal |

**Identities and standings** (10 total):

| Name | Email | Group | Standing | What they can do |
|---|---|---|---|---|
| Marius Albrecht | `marius.albrecht@sparc-engineering.example` | `sparc` | `owners` | Reads/writes/manages/admins **everything** in the tree (owner standing traverses all descendants). Not a platform admin — see above. |
| Lena Brandt | `lena.brandt@sparc-engineering.example` | `sparc` | `viewers` | Reads everything, writes nothing — pure junior/read-only account. |
| Paul Vogel | `paul.vogel@sparc-engineering.example` | `nbu-clinic` | `managers` | Reads/writes/manages the project and all 4 groups beneath it; cannot touch `sparc` itself. |
| Jonas Weber | `jonas.weber@sparc-engineering.example` | `acme-mep` | `managers` | Reads/writes/manages `acme-mep` and its `acme-mep-controls` sub-package only. |
| Timo Bauer | `timo.bauer@sparc-engineering.example` | `acme-mep` | `viewers` | Reads `acme-mep` (and the project, via the roster join); writes nowhere. |
| Sebastian Huber | `sebastian.huber@sparc-engineering.example` | `stahlbau-huber` | `editors` | Reads/writes `stahlbau-huber` only; no membership management rights there. |
| Katrin Schmidt | `katrin.schmidt@sparc-engineering.example` | `schmidt-architekten` | `editors` | Same shape as Huber, scoped to `schmidt-architekten`. |
| Sabine Richter | `sabine.richter@sparc-engineering.example` | `acme-mep` | `editors` | A second Acme MEP editor, alongside Weber's manager standing there. |
| Frida Berger | `frida.berger@sparc-engineering.example` | `nbu-clinic` | `viewers` | A client-reviewer role — direct project-level read-only access. |
| Niklas Vogt | `niklas.vogt@sparc-engineering.example` | `acme-mep-controls` | `managers` | Manages the 3-level-deep sub-package only; does **not** gain anything on the parent `acme-mep` group. |

**Roles/Policies note**: this dataset uses the newer Group/standing model, not the older
Roles/Policies catalog pages — those two authorization surfaces are documented as a known,
unreconciled conflict in [chapter 9](../09-architecture/README.md). If you want to see Roles/Policies
exercised, sign in as `marcus.chen@neobim.example` and look at `/auth/console/roles` and
`/auth/console/policies` — those still reflect the older per-relation naming layer.

### Testing permissions directly (no UI needed)

The console has no dedicated "check my permissions" page — the real permit check is an API call,
and this is genuinely the fastest way to verify a standing:

```bash
curl -s -X POST http://localhost:8090/api/v1/groups/acme-mep/authorize \
  -H 'Content-Type: application/json' \
  -d '{"subject_id": "<identity-id>", "permit": "write"}'
# -> {"allowed": true} or {"allowed": false}
```

Get an identity's id from Kratos's admin API:
`curl -s "http://localhost:4434/admin/identities?credentials_identifier=<email>"`.

### Sample applications you can also sign into

The Sparc Engineering dataset does not carry Keto `Resource` grants for the sample applications
(Mealie/Superset/Airflow/etc.) — those grants exist only for identities in the retired NeoBIM
dataset, and since 37 of those 38 identities were deleted this pass, **none of the currently live
sample-application sign-ins can be demonstrated with a normal user today.** Sign in as
`marcus.chen@neobim.example` to reach any of them (see [chapter 6](../06-integrations/README.md)
for the per-app integration detail); this is a real, disclosed gap, not silently patched over — see
[chapter 9's remaining risks](../09-architecture/README.md).

| App | URL |
|---|---|
| Superset | `http://localhost:9928` |
| Airflow | `http://localhost:4455/apps/airflow/` (must use this path — the direct port 404s by design) |
| Mealie | `http://localhost:9925` |
| Open WebUI | `http://localhost:9927` |
| NeoBIM UI (demo app) | `http://localhost:9930` |
| Flask Identity Viewer | `http://localhost:9931` |
| FastAPI RBAC Playground | `http://localhost:9932` |
| Streamlit Enterprise Portal | `http://localhost:9933` |
| Grafana | `http://localhost:3001` (`admin`/`admin`) |
| Prometheus | `http://localhost:9090` |
| Mailhog (dev email inbox) | `http://localhost:8025` |

### Known limitations to mention if asked

- MFA/passkey/WebAuthn flows require a real hardware or virtual authenticator to click through
  live — not stageable in a scripted demo without one.
- Hydra in this version has no Device Authorization Grant and no Token Exchange (RFC 8693).
- Keto's `namespaces.ts`-designed permission model is not enforced by the running Keto instance —
  only literal relations are ever checked. See
  [chapter 9](../09-architecture/README.md#namespace-model--designed-vs-what-keto-actually-enforces).
- The courier (email) admin API is read-only — "Send test email" sends a new message rather than
  replaying a stored one.
- BuildOS and CBM Demo integrations are wired (real Hydra clients) but require their own dev
  servers running separately — see [chapter 6](../06-integrations/README.md).
- Only one platform administrator exists (`marcus.chen@neobim.example`); no other identity can
  reach `/auth/console` today.

### Troubleshooting

- **"Something went wrong" on an app's login button** — check [chapter 6](../06-integrations/README.md)
  for that specific app; every previously-seen failure mode has a documented root cause and fix.
- **A user can't reach an app that should be allowed** — verify their Keto tuple directly:
  `GET /relation-tuples/check?namespace=Resource&object=<app>&relation=view&subject_id=<id>`
  against Keto's read API (`:4466`).
- **Containers not healthy** — run `make health` and `make doctor` (see [chapter 7](../07-operations/README.md)).

## References / Related pages

- [Chapter 1 — Introduction](../01-introduction/README.md) — the full plain-language glossary
- [Chapter 2 — Installation](../02-installation/README.md) — first-time `.env` setup
- [Chapter 4 — Administration](../04-administration/README.md) — the console pages this reference's
  URLs point at
- [Chapter 5 — Development](../05-development/README.md) — the full per-service API endpoint
  reference and the enterprise test dataset used in the demo walkthrough
- [Chapter 6 — Integrations](../06-integrations/README.md) — per-app integration detail referenced
  throughout the demo walkthrough
- [Chapter 7 — Operations](../07-operations/README.md) — health checks, backup/restore, and the
  broader production-hardening inventory
- [Chapter 9 — Architecture](../09-architecture/README.md) — the deep architecture reference, ADRs,
  and the honest current-state matrix behind everything summarized here
