#!/usr/bin/env bash
# Local development mode — identical to `make up` (base compose +
# docker-compose.dev.yml, which adds the bind-mounted source volumes and
# dev-target Docker builds every platform/* service and identity-ui use
# while iterating). This IS the default `make up` behavior; this script
# exists only so `automation/development/dev.sh` documents that explicitly, matching
# automation/deployment/prod.sh's equivalent explicitness for the other mode.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec make up "$@"
