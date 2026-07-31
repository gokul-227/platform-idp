# tests/

All suites run containerized against a **live** stack (`make up` first) —
none of these use mocks; they hit real services over the network, the
same way `tests/e2e` always has.

| Directory | Run with | What it covers |
|---|---|---|
| `unit/` | `make test-unit` | Repository config validation (no running stack needed) |
| `integration/` | `make test-integration` | Real cross-service flows: Role/Policy → Keto tuple, Invitation accept → Keto tuple, Flow publish |
| `e2e/` | `make test-e2e`, `make test-e2e-platform` | Full browser-cookie user journeys (registration → verify → login → logout), extended Hydra/Keto/Oathkeeper/observability checks, application-plugin OIDC |
| `performance/` | `make test-performance` | Basic single-request latency bounds — **not** a load-testing harness (no k6/Locust; a real one is future work) |
| `security/` | `make test-security` | Real security-boundary checks: unauthenticated console access, Oathkeeper doesn't leak Kratos/Hydra admin surfaces |
| `smoke/` | `make test-smoke` | Fast health-only tripwire across every platform service + (with a real session cookie) every console page |
| `fixtures/` | — | Shared `conftest.py` (base URLs) for suites that want it; not itself a testpath |

`platform/*/tests/` (per-service, with fakes for Kratos/Hydra/Keto/audit-service)
remain separate and are run via `make test-python-services` — this
directory is for tests that span more than one service or hit the real
running stack.

Two Makefile targets that referenced a non-existent `npm test` setup in
`tests/integration/` and `tests/security/` (`tests/load/auth-flow.js`
referencing a k6 script that was never written) were found during this
reorganization and replaced with the real, working Python suites above.
