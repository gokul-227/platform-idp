#!/usr/bin/env bash
# Convenience wrapper over `make destroy` (DESTRUCTIVE — stops every
# service and removes all data volumes for this stack). Does not touch
# anything outside this project's own compose resources.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec make destroy "$@"
