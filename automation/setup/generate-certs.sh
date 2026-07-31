#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:-security/tls/local}"
mkdir -p "${output_dir}"
openssl req -x509 -newkey rsa:4096 -nodes -sha256 -days 30 \
  -keyout "${output_dir}/localhost.key" \
  -out "${output_dir}/localhost.crt" \
  -subj '/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
printf 'Local certificate written to %s\n' "${output_dir}"
