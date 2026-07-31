# authorization-service

Roles and Policies — an enterprise-friendly control-plane abstraction over **Ory Keto**, not a
competing authorization system. Keto (`ory/keto/namespaces/namespaces.ts`) remains the one
authorization engine; every relation Keto actually understands is fixed to a hardcoded
namespace/relation map (`roles.VALID_ROLE_TARGETS`) mirroring that model exactly.

- **Roles** (`GET/POST/PUT/DELETE /api/v1/roles`) are named pointers at a real
  `(namespace, relation)` pair — e.g. "Organization Admin" -> `(Organization, admin)`. Stored as
  `configuration/authorization/roles/*.yaml` (this service owns the write, same pattern as
  `platform/flow-service`/`platform/plugin-service`). A starter catalog is seeded on first boot,
  naming every relation in the namespace model, so the console never starts empty.
- **Policies** (`GET/POST/PUT/DELETE /api/v1/policies`) are a Role assigned to a subject on a
  specific object instance. A Policy has **no storage of its own** — it *is* a real Keto relation
  tuple. Listing reads live tuples back from Keto for each Role's `(namespace, relation)`;
  creating/deleting a Policy creates/deletes that same tuple through Keto's admin API. A Policy's
  `id` is a base64 encoding of the `(namespace, object, relation, subject_id)` tuple it wraps —
  not a new identifier Keto doesn't know about.

This is a different surface than `platform/console-api`'s existing `/api/v1/relation-tuples`
endpoints (the generic, raw Permissions page) — those remain the escape hatch for ad hoc
namespace/object/relation/subject grants. Roles/Policies is the named, curated layer on top for
day-to-day admin work.

## Run locally

```bash
uv sync --all-groups
uv run uvicorn authorization_service.main:app --host 0.0.0.0 --port 8090
```

## Test / lint / type-check

```bash
uv run pytest
uv run ruff check .
uv run mypy
```
