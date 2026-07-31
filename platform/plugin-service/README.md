# plugin-service

A generic, admin-manageable plugin **registry** — enable/disable/configure/order/remove
config-driven plugins across categories (`authentication`, `identity-provider`, `theme`,
`notification`, `application`, `policy`, `workflow`) from `/console/plugins`, instead of each
category inventing its own toggle mechanism.

**Not the same thing as `platform/plugin-framework`.** That library is a code-loading strategy
pattern — it imports a Python module (e.g. `integrations/email/smtp/provider.py`) to swap an
implementation at process startup (which email provider `email-service` uses). This service is a
runtime **configuration** registry — YAML records an admin can create/edit/enable/disable from
the console, with no code loaded or executed. `GET /api/v1/plugins` shows both, tagged by
`source` (`"config"` for entries this service owns and can mutate, `"code"` for real
`plugins/*/plugin.json` manifests, shown read-only for visibility — e.g. the real `smtp` email
plugin already in use by `email-service`).

## Run locally

```bash
uv sync --all-groups
uv run uvicorn plugin_service.main:app --host 0.0.0.0 --port 8088
```

## Test / lint / type-check

```bash
uv run pytest
uv run ruff check .
uv run mypy
```
