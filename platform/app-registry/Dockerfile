# =============================================================================
# App Registry Service — Dockerfile
# =============================================================================
# Build context is the repo root (see docker/compose/docker-compose.dev.yml).
# WORKDIR mirrors the host's platform/app-registry path exactly, because
# config.py and the test suite compute the repo root via relative `parents[N]`
# from __file__ — a flattened container layout would silently break that.
FROM python:3.13-slim AS base

WORKDIR /app/platform/app-registry
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_REGISTRY_SCHEMA_PATH=/app/configuration/schemas/app-registry.schema.json

RUN pip install --no-cache-dir uv==0.5.11

COPY platform/app-registry/pyproject.toml platform/app-registry/uv.lock* platform/app-registry/README.md ./
RUN uv sync --no-dev --no-install-project

COPY platform/app-registry/src ./src
COPY configuration/schemas/app-registry.schema.json /app/configuration/schemas/app-registry.schema.json
RUN uv sync --no-dev

FROM base AS runtime
# Invoke the already-synced venv's uvicorn directly — `uv run` would re-check
# the lockfile on every start and needs a writable HOME/cache dir it doesn't
# have as this unprivileged user.
ENV PATH="/app/platform/app-registry/.venv/bin:$PATH"
USER 10001:10001
EXPOSE 8080
CMD ["sh", "-c", "uvicorn app_registry.main:app --host 0.0.0.0 --port ${APP_REGISTRY_PORT:-8080}"]

FROM base AS dev
RUN uv sync --all-groups
COPY platform/app-registry/tests ./tests
COPY integrations/applications /app/integrations/applications
