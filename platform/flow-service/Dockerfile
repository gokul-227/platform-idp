# =============================================================================
# Flow Service — Dockerfile
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
ENV PATH="/app/.venv/bin:$PATH"
USER 10001:10001
EXPOSE 8089
CMD ["sh", "-c", "uvicorn flow_service.main:app --host 0.0.0.0 --port ${PORT:-8089}"]

FROM base AS dev
RUN uv sync --all-groups
COPY tests ./tests
