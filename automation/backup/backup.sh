#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
output_dir="${1:-${root_dir}/backups/$(date +%Y%m%d%H%M%S)}"
mkdir -p "${output_dir}"
compose=(docker compose -f "${root_dir}/deployment/docker/compose/docker-compose.yml")

for service in postgres-kratos postgres-hydra postgres-keto postgres-platform; do
  database="${service#postgres-}"
  "${compose[@]}" exec -T "${service}" pg_dump -U "${database}" "${database}" >"${output_dir}/${database}.sql"
done

printf 'Backups written to %s\n' "${output_dir}"
