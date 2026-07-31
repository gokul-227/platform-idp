#!/usr/bin/env bash
# Removes stopped containers, dangling anonymous volumes, and orphaned
# networks belonging ONLY to this project's own Compose project (filtered
# by the real `com.docker.compose.project` label Docker sets) — never a
# blanket `docker system prune`, which would also affect unrelated
# containers/images on this machine.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

PROJECT="$(docker compose --env-file .env -f deployment/docker/compose/docker-compose.yml config --format json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("name",""))' 2>/dev/null || true)"
if [ -z "$PROJECT" ]; then
  PROJECT="compose"
fi

echo "Cleaning up Compose project: $PROJECT"
docker compose --env-file .env \
  -f deployment/docker/compose/docker-compose.yml \
  -f deployment/docker/compose/docker-compose.dev.yml \
  down --remove-orphans

docker container prune -f --filter "label=com.docker.compose.project=$PROJECT"
docker volume prune -f --filter "label=com.docker.compose.project=$PROJECT"
docker network prune -f --filter "label=com.docker.compose.project=$PROJECT"
echo "Done."
