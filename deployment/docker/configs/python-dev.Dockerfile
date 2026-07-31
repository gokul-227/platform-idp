# =============================================================================
# Shared dev/test image for any uv-managed Python package under platform/*,
# plugins/, or the repo root — used for lint/mypy/pytest so contributors never
# need a local Python install or virtualenv (container-first development).
#
# Build with the build context set to the package directory, e.g.:
#   docker build -f docker/configs/python-dev.Dockerfile -t hooks-dev platform/hooks
#   docker run --rm hooks-dev sh -c "uv run ruff check . && uv run mypy && uv run pytest"
# =============================================================================
FROM python:3.13-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN pip install --no-cache-dir uv==0.5.11

COPY pyproject.toml uv.lock* ./
RUN uv sync --all-groups --no-install-project

COPY . .
RUN uv sync --all-groups
