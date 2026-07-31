# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this repository actually is

An Ory-based Enterprise Identity Platform (Kratos + Hydra + Keto + Oathkeeper) under active,
incremental completion. **`docs/10-reference/ai-handoff.md` is the single most important document in this
repo** — read it first, always. It has the exact current state, what's verified-working vs. not,
and the exact next task. Don't re-derive this from scratch or re-audit the repository; the handoff
doc exists specifically so that doesn't need to happen every session.

`docs/10-reference/repository-audit.md` and `docs/10-reference/implementation-roadmap.md` are the original planning
documents — useful for historical context, but `docs/10-reference/ai-handoff.md` supersedes them for "what's
actually true right now," since both predate the Python port and container-first migration.

## The two standing architecture mandates

1. **Python-first** (`docs/10-reference/adr/ADR-0012-python-first-custom-tooling.md`): all custom platform
   tooling and services are Python. Don't introduce Go, new Node.js services, or Bash beyond thin
   wrappers. All six `platform/*` services have been ported from the original TypeScript
   (preserving each one's external contract — see each service's README for exactly what changed
   vs. what was intentionally preserved from the pre-port implementation).
2. **Container-first, no local venv/pip** (`docs/10-reference/adr/ADR-0013-container-first-development.md`):
   nothing requires a local Python install, `uv`, or a `.venv`. Every lint/format/mypy/pytest/
   Alembic invocation for any Python package runs inside a Docker container — via that package's
   own `Dockerfile`'s `dev` stage, or `deployment/docker/configs/python-dev.Dockerfile` for packages with no
   Dockerfile of their own (currently only `platform/plugin-framework`). **Never suggest `uv run`,
   `pip install`, or activating a venv directly on the host** — use the Makefile targets below, or
   `automation/docker/docker-build-python-dev.sh <dir>` directly if you need a one-off container.

Do not build a custom authentication UI, administration portal, or demo application — integrate
pinned upstream projects instead (`docs/10-reference/adr/ADR-0011-upstream-adoption-supersedes-admin-ui.md`,
docs/CONTRIBUTING.md). The `vendor/kratos-selfservice-ui-reference` git submodule is the adopted
self-service UI, wired as the `auth-ui` Compose service.

## Commands

```bash
make up / make down / make restart / make destroy      # Docker Compose lifecycle
make health / make doctor                                # health checks / diagnostics
make validate                                            # config schemas, Compose, Kustomize, all Python packages — the CI baseline
make lint-python / make format-python / make test-python-services   # per-package, containerized
make sync / make sync-dry-run / make apps                # app-registry CLI, via `docker compose run` — requires `make up` first
```

Everything above runs in containers. `make format-python` is the one target that writes back to
the host filesystem (it bind-mounts each package's `src/`/`tests/` over the image's copy — see
`automation/docker/docker-workdir-python.sh` for the per-package mount path).

For a single package during iteration:

```bash
tag=$(automation/docker/docker-build-python-dev.sh platform/hooks)
docker run --rm "$tag" sh -c "uv run pytest -q && uv run ruff check . && uv run mypy"
```

`./automation/platform <command>` is the older Compose lifecycle wrapper (`up`, `down`, `health`,
`logs`, `backup`, `restore`, `sync`, `doctor`) — `make` targets are the newer, preferred surface
and mostly just call into Compose directly now.

## Architecture

**Request flow (zero-trust, edge-enforced):** every external request enters through **Ory
Oathkeeper**, which matches an access rule, authenticates (Kratos `/sessions/whoami` for cookie
sessions, Hydra `/oauth2/introspect` for OAuth2 clients), authorizes (Keto ReBAC check), then
mutates the request before forwarding upstream. `ory/oathkeeper/rules/access-rules.json`'s rule
order matters: `/auth/<**>` → `auth-ui` (Kratos self-service UI pages) and `/hydra/<**>` →
`auth-service` (Hydra login/consent/logout challenge orchestration) are deliberately on
**different path prefixes** — they used to collide on `/auth/*` (see ADR history / git log around
the auth-service port) until `ory/hydra/config/hydra.yaml`'s `oauth2.urls` were moved to `/hydra/*`.

**Ory components** (`ory/<component>/`), each with its own Postgres database — `kratos`, `hydra`,
`keto` (namespaces defined in TypeScript at `ory/keto/namespaces/namespaces.ts`; still no
compile/apply pipeline connecting that model to a running Keto instance), `oathkeeper`.

**Platform services** (`platform/*`), all Python/FastAPI, each independently deployable with its
own `pyproject.toml`/`uv.lock`/`Dockerfile`:
- `app-registry` — syncs `integrations/applications/*.yaml` to Hydra OAuth2 clients.
- `auth-service` — Hydra login/consent/logout ↔ Kratos session bridge, at `/hydra/*`.
- `hooks` — Kratos registration/login webhook receiver; writes Keto `Organization` relation tuples.
- `tenant-service` — multi-tenancy CRUD, Postgres via SQLAlchemy async + Alembic migrations.
- `email-service` — sends email via a plugin-selected provider (see below).
- `notification-service` — routes `email`/`sms` notifications; `email` forwards to `email-service`,
  `sms` is mocked (explicitly deferred to the plugin-framework phase in the original code itself).

**`platform/plugin-framework`** — shared manifest/discovery/registry library
(`docs/10-reference/adr/ADR-0004-plugin-architecture.md`, implemented in Python per ADR-0012). Real plugins
live at repo root under `integrations/email/<name>/` (currently only `integrations/email/smtp/`, consumed by
`email-service`). Don't add stub plugins for categories with no second real implementation to
justify them — that's exactly the "no placeholders" anti-pattern this repo is trying to climb out
of.

**Configuration model:** `configuration/platform.yaml`/`configuration/cloud.yaml` are meant to be the single
source of truth, validated against `configuration/schemas/*.schema.json` via `automation/validation/validate_config.py`
(CI-enforced, containerized — see `make validate-tools`). Still **not actually consumed** by
Compose/Helm/Kubernetes/Terraform, which each define their own values independently.

**Deployment surfaces**, in increasing order of production-readiness: `deployment/docker/compose/` (real,
tested — six platform services + Ory stack all run and pass health checks) → `deployment/kubernetes/base/`
(Kustomize; ConfigMaps/Secrets for the Ory components exist, platform services are not yet in K8s
at all) → `deployment/helm/platform/` (umbrella chart, metadata/values only) → `terraform/modules/` (AWS
`postgresql` module only). Check `docs/10-reference/ai-handoff.md` for exactly what's been verified vs. not.

## Tooling conventions

- Every Python package: `ruff` (`select = ["E","F","I","UP","B"]`, line-length 100), `mypy
  --strict` (with `plugins = ["pydantic.mypy"]` when the package uses pydantic-settings —
  otherwise direct `Settings(field_name=...)` construction in tests spuriously fails type-checking
  and, in some pydantic-settings versions, fails at runtime too unless every field's
  `validation_alias` explicitly includes the bare field name via `AliasChoices`), `pytest` with
  `pythonpath = ["src"]`.
- Every service's `Dockerfile` needs `COPY <pkg>/README.md` alongside `pyproject.toml`/`uv.lock` —
  `uv sync`'s project-install step fails without it, since every `pyproject.toml` declares `readme
  = "README.md"`. Every service's `Dockerfile` needs `[build-system]`/`[tool.hatch.build.targets.wheel]`
  configured — without it `uv sync` silently skips installing the project as an importable
  package, and the runtime `uvicorn <module>:app` CMD fails with `ModuleNotFoundError`.
- Runtime (production) Docker stages invoke the synced venv's binary directly via
  `ENV PATH="/app/.venv/bin:$PATH"` — never `uv run` — because `uv run` needs a writable
  `HOME`/cache directory the unprivileged runtime user (`USER 10001:10001`) doesn't have.
- Services needing a build context wider than their own directory (`app-registry` needs
  `configuration/schemas/`; `email-service` needs `platform/plugin-framework` + `integrations/email/`) use repo-root
  Compose build context and preserve the *same relative directory depth* inside the image as on
  the host (custom `WORKDIR`, e.g. `/app/platform/app-registry`) — several test fixtures compute
  the repo root via `Path(__file__).resolve().parents[N]`, which breaks silently if the container
  layout is flattened relative to the host.
