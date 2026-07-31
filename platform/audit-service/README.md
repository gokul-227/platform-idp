# audit-service

Records every Admin Portal mutation (identity create/disable/delete, session revoke, OAuth client
CRUD, permission grant/revoke, application enable/disable, identity provider toggle, ...) as an
immutable, queryable event. `platform/console-api` (and other Python services that own a mutation)
POST one event here right after a mutation succeeds; the console's Audit Logs page reads from here.

Mirrors `platform/tenant-service`'s structure: Postgres via SQLAlchemy async + Alembic, sharing the
same `platform` database (its own `audit_events` table).

## Run locally

```bash
uv sync --all-groups
uv run alembic upgrade head
uv run uvicorn audit_service.main:app --host 0.0.0.0 --port 8087
```

## Test / lint / type-check

```bash
uv run pytest
uv run ruff check .
uv run mypy
```
