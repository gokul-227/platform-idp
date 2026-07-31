#!/usr/bin/env bash
# Prints the WORKDIR a given Python package's dev image uses, so Makefile
# targets can bind-mount src/tests at the correct in-container path (see
# docker-build-python-dev.sh — the counterpart that builds the image).
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <platform/service-dir>" >&2
  exit 1
fi

case "$1" in
  platform/app-registry) echo "/app/platform/app-registry" ;;
  platform/email-service) echo "/app/platform/email-service" ;;
  *) echo "/app" ;;
esac
