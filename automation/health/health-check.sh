#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
redis_password="$(grep -m1 '^REDIS_PASSWORD=' "${root_dir}/.env" 2>/dev/null | cut -d= -f2-)"
compose=(
  docker compose
  -f "${root_dir}/deployment/docker/compose/docker-compose.yml"
)
compose_full=("${compose[@]}" -f "${root_dir}/deployment/docker/compose/docker-compose.observability.yml")
checks=(
  "kratos:http://localhost:4434/health/ready"
  "hydra:http://localhost:4445/health/ready"
  "keto:http://localhost:4466/health/ready"
  "oathkeeper:http://localhost:4456/health/ready"
  "mailhog:http://localhost:8025/api/v2/messages"
)

failed=0
for check in "${checks[@]}"; do
  service="${check%%:*}"
  url="${check#*:}"
  if ! "${compose[@]}" ps --status running -q "${service}" | grep -q .; then
    printf 'FAIL %-16s container is not running\n' "${service}" >&2
    failed=1
    continue
  fi
  if curl --fail --silent --show-error --max-time 5 "${url}" >/dev/null; then
    printf 'OK   %-16s %s\n' "${service}" "${url}"
  else
    printf 'FAIL %-16s %s\n' "${service}" "${url}" >&2
    failed=1
  fi
done

optional_checks=(
  "prometheus:http://localhost:9090/-/ready"
  "grafana:http://localhost:3001/api/health"
  "loki:http://localhost:3100/ready"
  "tempo:http://localhost:3200/ready"
)
for check in "${optional_checks[@]}"; do
  service="${check%%:*}"
  url="${check#*:}"
  if "${compose_full[@]}" ps --status running -q "${service}" | grep -q .; then
    if curl --fail --silent --show-error --max-time 5 "${url}" >/dev/null; then
      printf 'OK   %-16s %s\n' "${service}" "${url}"
    else
      printf 'FAIL %-16s %s\n' "${service}" "${url}" >&2
      failed=1
    fi
  fi
done

for database in kratos hydra keto platform; do
  if "${compose[@]}" exec -T "postgres-${database}" pg_isready -U "${database}" -d "${database}" >/dev/null; then
    printf 'OK   %-16s database connection\n' "postgres-${database}"
  else
    printf 'FAIL %-16s database connection\n' "postgres-${database}" >&2
    failed=1
  fi
done

if "${compose[@]}" exec -T redis redis-cli -a "${redis_password}" ping 2>/dev/null | grep -qx PONG; then
  printf 'OK   %-16s Redis connectivity\n' redis
else
  printf 'FAIL %-16s Redis connectivity\n' redis >&2
  failed=1
fi

exit "${failed}"
