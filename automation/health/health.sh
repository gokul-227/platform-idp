#!/usr/bin/env bash
# Convenience wrapper over `make health`. The real per-component health
# check scripts (health-check.sh, doctor.sh, check-tools.sh) that this
# calls into already lived in this same directory before the reorg — kept
# in place, not duplicated.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec make health "$@"
