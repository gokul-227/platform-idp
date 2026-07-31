# flow-service

Manages authentication flow definitions (`configuration/flows/*.yaml`) — which authentication methods
each flow type (login/registration/recovery/verification/settings) uses, in what order — from
`/console/flows` instead of hand-editing `ory/kratos/config/kratos.yaml.tmpl`.

## A real Kratos constraint, disclosed rather than hidden

Kratos's method enablement (`selfservice.methods.<method>.enabled`) is **global**, not scoped
per flow type — there's no way in this Kratos version to enable `password` for login but not
for registration. So `publish` here is deliberately **enable-only**: it turns on any method that
appears as a step in an *enabled* flow, but never disables a method just because no flow
currently references it — auto-disabling could silently break an unrelated flow that also
depends on that method, in a way this service isn't positioned to detect safely. Disabling a
method globally is still possible by hand-editing the template, same as before this service
existed; this service only ever adds capability, never silently removes it.

Same tradeoff as `console-api`'s Identity Providers feature: `publish` only rewrites the
*rendered* `kratos.yaml` (via the `flows-render` one-shot compose step, running after
`config-render` and before Kratos starts) — Kratos itself has no runtime config-reload API in
the open-source edition, so a published change takes effect on the next Kratos restart.

## Run locally

```bash
uv sync --all-groups
uv run uvicorn flow_service.main:app --host 0.0.0.0 --port 8089
```

## Test / lint / type-check

```bash
uv run pytest
uv run ruff check .
uv run mypy
```
