#!/usr/bin/env bash
# Convenience wrapper — the canonical entry point is `make up` (see
# Makefile). This exists only to satisfy a predictable
# automation/<bucket>/<verb>.sh layout; it does not reimplement anything.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec make up "$@"
