#!/usr/bin/env bash
# Convenience wrapper over `make status`.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec make status "$@"
