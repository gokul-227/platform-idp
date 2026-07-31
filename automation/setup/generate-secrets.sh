#!/usr/bin/env bash
set -euo pipefail

target="${1:-.env}"
if [[ ! -f "${target}" ]]; then
  printf 'Expected an environment file at %s. Copy .env.example first.\n' "${target}" >&2
  exit 1
fi

secret() { openssl rand -base64 48 | tr -d '\n'; }
# Kratos requires secrets.cipher to be *exactly* 32 raw characters (used
# directly as an AES-256 key) — not base64-encoded, unlike every other
# secret here. A base64 value (44+ chars for 32 bytes) fails Kratos's schema
# validation outright at startup.
raw32() { openssl rand -hex 16 | tr -d '\n'; } # 16 bytes hex-encoded = 32 chars
replace() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "${target}"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "${target}"
    rm -f "${target}.bak"
  else
    printf '%s=%s\n' "${key}" "${value}" >>"${target}"
  fi
}

for key in KRATOS_SECRETS_COOKIE HYDRA_SECRETS_SYSTEM HYDRA_SECRETS_COOKIE HYDRA_PAIRWISE_SALT COOKIE_SECRET CSRF_COOKIE_SECRET REDIS_PASSWORD GRAFANA_ADMIN_PASSWORD JUPYTERHUB_OIDC_CLIENT_SECRET SUPERSET_OIDC_CLIENT_SECRET SUPERSET_SECRET_KEY AIRFLOW_OIDC_CLIENT_SECRET; do
  replace "${key}" "$(secret)"
done
replace "KRATOS_SECRETS_CIPHER" "$(raw32)"

# Postgres passwords: URL-safe hex, not base64 — these get embedded directly
# in postgres:// DSNs elsewhere in this file and a base64 password containing
# "/" or "+" would corrupt those URLs.
db_password() { openssl rand -hex 24 | tr -d '\n'; }
kratos_pw="$(db_password)"
hydra_pw="$(db_password)"
keto_pw="$(db_password)"
platform_pw="$(db_password)"
replace "POSTGRES_KRATOS_PASSWORD" "${kratos_pw}"
replace "POSTGRES_HYDRA_PASSWORD" "${hydra_pw}"
replace "POSTGRES_KETO_PASSWORD" "${keto_pw}"
replace "POSTGRES_PLATFORM_PASSWORD" "${platform_pw}"

# Host-tooling convenience DSNs (KRATOS/HYDRA/KETO_DATABASE_URL — connect via
# the host-exposed port, e.g. for a local psql client) must carry the same
# password as the POSTGRES_*_PASSWORD vars above. These are plain literal
# values, not ${VAR} references, because this file isn't guaranteed to be
# sourced by a shell that resolves forward/backward variable references —
# docker compose's own --env-file parsing doesn't re-interpolate variables
# used inside other variables' values either.
sed -i.bak -E "s|^(KRATOS_DATABASE_URL=postgres://kratos:)[^@]*(@.*)|\\1${kratos_pw}\\2|" "${target}"
sed -i.bak -E "s|^(HYDRA_DATABASE_URL=postgres://hydra:)[^@]*(@.*)|\\1${hydra_pw}\\2|" "${target}"
sed -i.bak -E "s|^(KETO_DATABASE_URL=postgres://keto:)[^@]*(@.*)|\\1${keto_pw}\\2|" "${target}"
rm -f "${target}.bak"

printf 'Generated development-only secrets in %s.\n' "${target}"
