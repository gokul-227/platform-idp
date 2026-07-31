# app-registry

Loads YAML application definitions from `integrations/applications/*.yaml` (validated against
`configuration/schemas/app-registry.schema.json`, mirroring `automation/validation/validate_config.py`'s own
JSON-Schema validation) and syncs them to Ory Hydra as OAuth2/OIDC clients.

## Run locally

```bash
uv sync --all-groups
uv run uvicorn app_registry.main:app --host 0.0.0.0 --port 8080
```

## CLI

```bash
uv run app-registry-cli sync [--dry-run]
uv run app-registry-cli list
uv run app-registry-cli scan
```

## Test / lint / type-check

```bash
uv run pytest
uv run ruff check .
uv run mypy
```

## Endpoints

- `GET /healthz` — liveness probe.
- `GET /ready` — readiness probe; 503 if Hydra Admin API is unreachable.
- `GET /api/v1/registry` — YAML definitions discovered on disk (not yet synced).
- `GET /api/v1/clients` — OAuth2 clients currently registered in Hydra.
- `POST /api/v1/sync[?dry_run=true]` — sync registry definitions to Hydra.

**Known gap, deferred intentionally:** none of these endpoints require authentication —
`POST /api/v1/sync` in particular can be called by anyone who can reach this service. This
matches the pre-port behavior and is tracked as a security-hardening task, not fixed silently
as part of this port (see `docs/10-reference/implementation-roadmap.md` Phase 2 and the platform's own
security-hardening phase).
