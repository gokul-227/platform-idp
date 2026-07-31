# =============================================================================
# Notification Service — Dockerfile
# =============================================================================
FROM python:3.13-slim AS base

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN pip install --no-cache-dir uv==0.5.11

COPY pyproject.toml uv.lock* README.md ./
RUN uv sync --no-dev --no-install-project

COPY src ./src
RUN uv sync --no-dev

FROM base AS runtime
# Invoke the already-synced venv's uvicorn directly — `uv run` would re-check
# the lockfile on every start and needs a writable HOME/cache dir it doesn't
# have as this unprivileged user.
ENV PATH="/app/.venv/bin:$PATH"
USER 10001:10001
EXPOSE 8085
CMD ["sh", "-c", "uvicorn notification_service.main:app --host 0.0.0.0 --port ${NOTIFICATION_SERVICE_PORT:-8085}"]

FROM base AS dev
RUN uv sync --all-groups
COPY tests ./tests
