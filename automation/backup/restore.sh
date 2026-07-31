#!/usr/bin/env bash
set -euo pipefail

if (($# != 1)); then
  printf 'Usage: %s <backup-directory>\n' "$0" >&2
  exit 1
fi

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
backup_dir="$1"
compose=(docker compose -f "${root_dir}/deployment/docker/compose/docker-compose.yml")

for service in postgres-kratos postgres-hydra postgres-keto postgres-platform; do
  database="${service#postgres-}"
  source_file="${backup_dir}/${database}.sql"
  [[ -f "${source_file}" ]] || { printf 'Missing %s\n' "${source_file}" >&2; exit 1; }
  "${compose[@]}" exec -T "${service}" psql -U "${database}" -d "${database}" <"${source_file}"
done
