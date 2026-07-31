# =============================================================================
# Tenant Service — Dockerfile
# =============================================================================
FROM python:3.13-slim AS base

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN pip install --no-cache-dir uv==0.5.11

COPY pyproject.toml uv.lock* alembic.ini README.md ./
RUN uv sync --no-dev --no-install-project

COPY src ./src
COPY migrations ./migrations
RUN uv sync --no-dev

FROM base AS runtime
# Invoke the already-synced venv's uvicorn/alembic directly — `uv run` would
# re-check the lockfile on every start and needs a writable HOME/cache dir it
# doesn't have as this unprivileged user.
ENV PATH="/app/.venv/bin:$PATH"
USER 10001:10001
EXPOSE 8081
CMD ["sh", "-c", "uvicorn tenant_service.main:app --host 0.0.0.0 --port ${PORT:-8081}"]

FROM base AS dev
RUN uv sync --all-groups
COPY tests ./tests
