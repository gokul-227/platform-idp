"""Shared fixtures for integration/e2e/security/performance/smoke tests.

Not auto-discovered by pytest (this directory isn't itself a testpath) —
each suite's own Makefile target copies the relevant conftest alongside
its test files when running containerized, matching the existing
test-e2e/test-e2e-platform pattern (see Makefile).
"""

from __future__ import annotations

import os

import pytest


@pytest.fixture
def base_url() -> str:
    return os.environ.get("EIP_BASE_URL", "http://localhost:4455")


@pytest.fixture
def mailhog_url() -> str:
    return os.environ.get("EIP_MAILHOG_URL", "http://localhost:8025")


@pytest.fixture
def console_api_url() -> str:
    return os.environ.get("EIP_CONSOLE_API_URL", "http://localhost:8086")


@pytest.fixture
def tenant_service_url() -> str:
    return os.environ.get("EIP_TENANT_SERVICE_URL", "http://localhost:8081")


@pytest.fixture
def authorization_service_url() -> str:
    return os.environ.get("EIP_AUTHORIZATION_SERVICE_URL", "http://localhost:8090")


@pytest.fixture
def keto_read_url() -> str:
    return os.environ.get("EIP_KETO_READ_URL", "http://localhost:4466")


@pytest.fixture
def kratos_admin_url() -> str:
    return os.environ.get("EIP_KRATOS_ADMIN_URL", "http://localhost:4434")
