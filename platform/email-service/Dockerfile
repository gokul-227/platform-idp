# =============================================================================
# Email Service — Dockerfile
# =============================================================================
# Build context MUST be the repo root (see docker/compose/docker-compose.dev.yml
# and Makefile's `docker build -f platform/email-service/Dockerfile .`) because
# this service depends on the local platform/plugin-framework package and on
# integrations/email/ (the actual plugin implementations) — neither is reachable
# from a build context scoped to platform/email-service alone.
FROM python:3.13-slim AS base

WORKDIR /app/platform/email-service
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN pip install --no-cache-dir uv==0.5.11

COPY platform/plugin-framework /app/platform/plugin-framework
COPY platform/email-service/pyproject.toml platform/email-service/uv.lock* platform/email-service/README.md ./
RUN uv sync --no-dev --no-install-project

COPY platform/email-service/src ./src
COPY integrations/email /app/plugins
RUN uv sync --no-dev

FROM base AS runtime
# Invoke the already-synced venv's uvicorn directly — `uv run` would re-check
# the lockfile on every start and needs a writable HOME/cache dir it doesn't
# have as this unprivileged user.
ENV PATH="/app/platform/email-service/.venv/bin:$PATH"
USER 10001:10001
EXPOSE 8084
CMD ["sh", "-c", "uvicorn email_service.main:app --host 0.0.0.0 --port ${EMAIL_SERVICE_PORT:-8084}"]

FROM base AS dev
RUN uv sync --all-groups
COPY platform/email-service/tests ./tests
