#!/usr/bin/env bash
# Convenience wrapper over `make down` — see start/start.sh's note.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec make down "$@"
