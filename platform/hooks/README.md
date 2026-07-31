# hooks-service

Receives Kratos webhooks (`ory/kratos/hooks/registration.jsonnet`, `ory/kratos/hooks/login.jsonnet`)
and seeds the corresponding Ory Keto relation tuples on the `Organization` namespace
(`ory/keto/namespaces/namespaces.ts`).

## Run locally

```bash
uv sync --all-groups
uv run uvicorn hooks_service.main:app --host 0.0.0.0 --port 8082
```

## Test / lint / type-check

```bash
uv run pytest
uv run ruff check .
uv run mypy
```

## Endpoints

- `POST /webhooks/registration` — writes an `Organization` relation tuple (`admin`/`member`/
  `billing_admin`) for the newly registered identity when `identity.traits.organization.id` is
  present. Relation names must match `ory/keto/namespaces/namespaces.ts`'s `Organization.related`
  keys, not Kratos-side role vocabulary.
- `POST /webhooks/login` — logs the login event for audit purposes; does not write to Keto.
- `GET /healthz` — liveness/readiness probe target.
