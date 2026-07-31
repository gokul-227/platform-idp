# console-api

Backend for the NeoBIM Identity console's Admin Portal (`identity-ui/app/console`).

Per this repo's Python-first mandate, every admin *mutation* the console offers (create/disable/
enable/delete an identity, revoke a session, create/delete an OAuth2 client, write/delete a Keto
relation tuple) is implemented here, not in the Next.js frontend. The console calls this service;
this service calls Kratos/Hydra/Keto's admin APIs. Read-only console pages still read Kratos/
Hydra/Keto directly (see `identity-ui/adapters/admin.ts`) — this service exists
specifically for the write path.

## Run locally

```bash
uv sync --all-groups
uv run uvicorn console_api.main:app --host 0.0.0.0 --port 8086
```

## Test / lint / type-check

```bash
uv run pytest
uv run ruff check .
uv run mypy
```
