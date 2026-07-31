#!/usr/bin/env bash
# "Production-like" LOCAL mode: base docker-compose.yml only, WITHOUT the
# docker-compose.dev.yml overlay — every service builds its runtime
# (non-dev) Docker target and runs without host bind-mounts, closer to
# what a real deployment's image looks like. This is still Docker Compose
# on this one machine, not a real production deployment: a genuine
# production rollout goes through deployment/kubernetes + deployment/helm
# (cluster) or terraform/ (cloud) instead — see docs/09-deployment/ and
# docs/09-deployment/terraform.md
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
docker compose --env-file .env -f deployment/docker/compose/docker-compose.yml up -d --build
