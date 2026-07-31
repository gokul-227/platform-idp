# tenant-service

Multi-tenancy organization CRUD, backed by Postgres via SQLAlchemy (async, `asyncpg` driver).

## Run locally

```bash
uv sync --all-groups
DATABASE_URL=postgresql+asyncpg://platform:platform_secret@localhost:5435/platform \
  uv run alembic upgrade head
DATABASE_URL=postgresql+asyncpg://platform:platform_secret@localhost:5435/platform \
  uv run uvicorn tenant_service.main:app --host 0.0.0.0 --port 8081
```

## Test / lint / type-check

```bash
uv run pytest
uv run ruff check .
uv run mypy
```

Tests use a fake, in-memory `TenantRepository` (see `tests/test_main.py`) rather than a real
Postgres instance — there's no CI or local sandbox wiring for a live database yet. Verify real
DB behavior via `docker compose up postgres-platform tenant-service-migrate tenant-service`.

## Endpoints

- `POST /tenants` — body `{"name": "...", "domain": "..."}`; 400 if `name` is missing.
- `GET /tenants` — list tenants, newest first.
- `GET /healthz`

## Changes from the pre-port implementation

- **Migrations instead of runtime DDL.** The original bootstrapped its `tenants` table with
  `CREATE TABLE IF NOT EXISTS` on every startup — flagged in `docs/10-reference/repository-audit.md` as a gap
  ("bootstraps its schema at runtime ... no migrations"). This port uses Alembic
  (`migrations/versions/0001_create_tenants_table.py`) instead, matching the schema exactly
  (native `UUID` primary key, `gen_random_uuid()` default, unique `name`/`domain`, `status`
  defaulting to `active`). The service itself no longer creates tables — run
  `uv run alembic upgrade head` (or the `tenant-service-migrate` Compose service) first, the same
  way `kratos-migrate`/`hydra-migrate`/`keto-migrate` already work.
- Everything else — endpoints, request/response shapes, status codes, error messages — is
  unchanged.

## Known gap, preserved intentionally from the pre-port implementation

No authentication/authorization, no tenant-isolation boundary, no update/delete — this was true
before the port and is unchanged by it. `docs/10-reference/implementation-roadmap.md` Phase 2 calls for
designing tenant isolation using "the chosen PostgreSQL/Keto boundary" — a design decision, not
something to make inside a language port. The `redis`/`REDIS_URL` dependency configured in Compose
is also still unused, matching the original (flagged in `docs/10-reference/repository-audit.md`).
