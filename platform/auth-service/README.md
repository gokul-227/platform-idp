# auth-service

Bridges Ory Hydra's login/consent/logout challenge flow with Ory Kratos sessions: when Hydra
needs to know who's logging in, this service checks the browser's Kratos session and tells Hydra
to accept (or redirects to Kratos's own login page if there's no session yet).

## Run locally

```bash
uv sync --all-groups
uv run uvicorn auth_service.main:app --host 0.0.0.0 --port 8083
```

## Test / lint / type-check

```bash
uv run pytest
uv run ruff check .
uv run mypy
```

## Endpoints

- `GET /hydra/login?login_challenge=...`
- `GET /hydra/consent?consent_challenge=...`
- `GET /hydra/logout?logout_challenge=...`
- `GET /hydra/error?error=...`
- `GET /healthz`

These live under `/hydra/*`, not `/auth/*`. `/auth/*` is Kratos's self-service UI prefix (served
by `auth-ui` — see `ory/kratos/config/kratos.yaml`'s `selfservice.flows.*.ui_url`). Both used to
resolve to the same literal path (e.g. `/auth/login`), which Oathkeeper can't route to two
different backends by path alone; `ory/hydra/config/hydra.yaml`'s `oauth2.urls` and
`ory/oathkeeper/rules/access-rules.json`'s `hydra-orchestrator-rules` were updated together with
this service's routes to resolve that collision.

## Known gaps, preserved intentionally from the pre-port implementation

- **Consent is auto-accepted for every client**, granting every requested scope/audience with no
  per-client policy or allowlist. This was true before the port and is unchanged by it — see
  `docs/10-reference/repository-audit.md`'s security section. Fixing it requires defining a Hydra client-policy
  model first (`docs/10-reference/implementation-roadmap.md` Phase 1), not something to decide inside a
  language port.
- **This service is not wired into `deployment/docker/compose/*.yml`.** It never was —
  `docs/10-reference/repository-audit.md` already flagged `auth-service` and `email-service` as "not composed
  either." The new Oathkeeper rule assumes it will eventually run as `auth-service:8083` on the
  Compose network; until it's actually added to `docker-compose.dev.yml`, requests to
  `/hydra/<**>` through Oathkeeper will fail to connect.
