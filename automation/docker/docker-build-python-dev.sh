#!/usr/bin/env bash
# Builds the dev/test image for one Python package under platform/*, tags it
# <basename>-dev, and prints the tag to stdout. Used by Makefile's
# lint-python/format-python/test-python-services/install-python-service-deps
# so no target ever runs `uv` on the host — see docs/10-reference/adr/ADR-0012 and this
# repo's container-first development mandate.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <platform/service-dir>" >&2
  exit 1
fi

dir="$1"
tag="$(basename "$dir")-dev"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

case "$dir" in
  platform/app-registry|platform/email-service)
    # Needs repo-root context: depends on config/schemas/ and/or
    # platform/plugin-framework — neither is reachable from a build context
    # scoped to the service directory alone.
    docker build -q -f "$root_dir/$dir/Dockerfile" --target dev -t "$tag" "$root_dir" >/dev/null
    ;;
  platform/plugin-framework)
    # A library with no Dockerfile of its own (never deployed standalone).
    docker build -q -f "$root_dir/deployment/docker/configs/python-dev.Dockerfile" -t "$tag" "$root_dir/$dir" >/dev/null
    ;;
  *)
    docker build -q -f "$root_dir/$dir/Dockerfile" --target dev -t "$tag" "$root_dir/$dir" >/dev/null
    ;;
esac

echo "$tag"
