#!/usr/bin/env bash
set -euo pipefail

required=(docker curl jq openssl kubectl terraform python3 uv lsof)
missing=()

for command in "${required[@]}"; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    missing+=("${command}")
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  missing+=("docker-compose-v2")
fi

python_version="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 13) else 1)' || missing+=("python>=3.13 (found ${python_version})")

if [[ ! -f .env ]]; then
  missing+=(".env (copy .env.example then run automation/setup/generate-secrets.sh .env)")
fi

if ((${#missing[@]} > 0)); then
  printf 'Missing required tools: %s\n' "${missing[*]}" >&2
  exit 1
fi

ports=(3000 3001 3100 3200 4317 4318 4433 4434 4444 4445 4455 4456 4466 4467 5432 5433 5434 5435 6379 8025 9090)
busy_ports=()
for port in "${ports[@]}"; do
  if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
    busy_ports+=("${port}")
  fi
done

if ((${#busy_ports[@]} > 0)); then
  printf 'Ports already in use: %s\n' "${busy_ports[*]}" >&2
  exit 1
fi

printf 'Local platform prerequisites are available (Python %s).\n' "${python_version}"
