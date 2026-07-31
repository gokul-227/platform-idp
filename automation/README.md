# automation/

Operational scripts, organized by concern. Every wrapper below calls into the
same underlying `make` targets or existing scripts — nothing here
reimplements platform lifecycle logic a second time.

Reorganized from the former flat `scripts/<verb>/` layout (Phase 5 repository
restructure) into concern-based buckets so the top level reads as an index of
what kind of operation lives where, not a list of individual verbs.

| Directory | Script | What it does |
|---|---|---|
| `deployment/` | `start.sh` | `make up` — base + dev compose overlay |
| `deployment/` | `stop.sh` | `make down` |
| `deployment/` | `destroy.sh` | `make destroy` — **destructive**, removes all data volumes |
| `deployment/` | `prod.sh` | base compose only, no dev overlay — closer to a real image, still Docker Compose on one machine, not a real production deployment (see `deployment/kubernetes/`, `deployment/helm/`, `terraform/` for that) |
| `restart/` | `restart.sh` | `make restart` |
| `development/` | `dev.sh` | same as `deployment/start.sh` — local dev mode (bind mounts, dev Docker targets) |
| `health/` | `health.sh` | `make health` (see also `health-check.sh`, `doctor.sh`, `check-tools.sh` in this same directory — the real per-component checks) |
| `logs/` | `logs.sh [service]` | all services, or one service if named |
| `status/` | `status.sh` | `make status` |
| `backup/` | `backup.sh` | real Postgres backup — referenced directly by `make backup` and `docs/07-operations/README.md` |
| `backup/` | `restore.sh <file>` | real Postgres restore — referenced directly by `make restore`. (The old `scripts/restore/restore.sh` thin wrapper around this same script was never actually invoked by anything — only mentioned in docs — so it was retired rather than moved.) |
| `cleanup/` | `cleanup.sh` | removes stopped containers/dangling volumes/networks scoped ONLY to this Compose project's own label — never a blanket `docker system prune` |
| `identity/` | `grant-app-access.sh` | grants a Kratos identity Keto view-access to an application resource |
| `database/seed/` | `seed_enterprise_dataset.py` | seeds the 38-identity/4-organization enterprise demo dataset — see `automation/database/seed/README.md` |
| `docker/` | `docker-build-python-dev.sh`, `docker-workdir-python.sh` | used by every `platform/*` service's containerized test/lint/typecheck |
| `setup/` | `generate-{certs,jwks,secrets}.sh` | first-time local setup |

`automation/ory` and `automation/platform` are the older Compose lifecycle
wrappers (pre-date the `make` targets); `make` remains the preferred,
actively-used surface — see `CLAUDE.md`.
