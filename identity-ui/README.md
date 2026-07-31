# identity-ui

**This is the NeoBIM Identity Platform's one authoritative UI** — the User Portal
(`/auth/login`, `/auth/registration`, `/auth/settings`, ...) and Admin Portal (`/console/*`).
Renders Kratos/Hydra/Keto self-service and admin flows using NeoBIM's own design language; no
Ory Elements, no official Ory branding.

Lives at the repo root deliberately, not under `applications/` — this is the platform itself,
not a business application. Compare:
- [`applications/neobim/neobim-ui`](../applications/neobim/neobim-ui) — a sample business app demonstrating
  OIDC login, unrelated to this app despite the similar name.
- [`vendor/kratos-selfservice-ui-reference`](../vendor/kratos-selfservice-ui-reference) — the official Ory UI, kept only as a
  documented rollback behind `/auth-legacy/*`; not part of the active platform.

Every mutation this app performs goes through a Python backend service
(`platform/console-api`, `platform/app-registry`, `platform/tenant-service`, ...) — see each
page's own comments for which service owns which write path. This app never mutates
Kratos/Hydra/Keto directly.
