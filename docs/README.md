# NeoBIM Identity Control Plane — Documentation

This is the complete operating manual for the NeoBIM Identity Control Plane: an enterprise identity
and access management platform built entirely on open-source Ory components (Kratos, Hydra, Keto,
Oathkeeper), plus this repository's own Python platform services and Next.js admin console. If
you've never used Ory, OAuth2, OpenID Connect, or administered an identity platform before, start
at [`01-introduction`](01-introduction/README.md) and read the ten chapters roughly in order. If
you already know the platform, jump straight to the chapter you need — every chapter is
self-contained.

## Reading order — Introduction → Installation → User Guide → Administration → Development → Integrations → Operations → Reference → Architecture → Contributing

| Chapter | Covers |
|---|---|
| [`01-introduction`](01-introduction/README.md) | What this platform is, in plain language; the high-level architecture picture; a plain-language glossary of every term used elsewhere in these docs |
| [`02-installation`](02-installation/README.md) | Prerequisites, the fastest path from a fresh clone to a working administrator account, and the Docker Compose mechanics behind `make up` |
| [`03-user-guide`](03-user-guide/README.md) | Everything an end user sees: registration, login, MFA, passkeys, recovery, sessions, social login, and account settings |
| [`04-administration`](04-administration/README.md) | The Admin Console (`/console/*`) — identities, organizations, authorization (roles/permissions/policies), identity providers, applications/OAuth clients, audit/reports/notifications, themes, plugins, and flows |
| [`05-development`](05-development/README.md) | How this platform is built and extended — the 11 `platform/*` services, the full HTTP API reference, the plugin system, theming, and a live enterprise test dataset |
| [`06-integrations`](06-integrations/README.md) | Every third-party application wired to this platform as an OAuth2/OIDC relying party — Mealie, Superset, Airflow, Open WebUI, the NeoBIM family (including BuildOS and CBM Demo), and the custom validation harnesses |
| [`07-operations`](07-operations/README.md) | Running this platform day to day: health checks, logs, backup/restore, upgrades, production hardening, and the Docker Compose/Kubernetes/Helm/Terraform deployment surfaces |
| [`08-reference`](08-reference/README.md) | Fast lookup: the full port/URL table, environment-variable and config-schema reference, the security guide, and a demo walkthrough script |
| [`09-architecture`](09-architecture/README.md) | The deep architecture reference for Kratos/Hydra/Keto/Oathkeeper, every ADR, the honest deployment-surface status matrix, and what's currently verified true about this platform |
| [`10-contributing`](10-contributing/README.md) | Contribution guidelines and the security-sensitive-change policy |

## If you only read one other page

Read [`09-architecture`'s current-state section](09-architecture/README.md#current-state--what-this-platform-actually-is-today).
It is the single most up-to-date account of what's actually working right now, what remains a known
limitation, and the honest status of every deployment surface — this documentation's ethos is
disclosing gaps plainly, not marketing language.
