"""Fast pass/fail health check across every real platform service and
console page — no data mutation, safe to run anytime. Distinct from
tests/e2e (full user journeys) and platform/*/tests (per-service unit
tests): this is the "is anything obviously down" tripwire.

Run containerized: `make test-smoke` (see Makefile).
"""

from __future__ import annotations

import os

import httpx
import pytest

PLATFORM_SERVICES = {
    "app-registry": 8080,
    "tenant-service": 8081,
    "hooks-service": 8082,
    "auth-service": 8083,
    "email-service": 8084,
    "notification-service": 8085,
    "console-api": 8086,
    "audit-service": 8087,
    "plugin-service": 8088,
    "flow-service": 8089,
    "authorization-service": 8090,
}


@pytest.mark.parametrize("service,port", sorted(PLATFORM_SERVICES.items()))
def test_platform_service_healthz(service: str, port: int) -> None:
    host = os.environ.get("EIP_DOCKER_HOST", "localhost")
    response = httpx.get(f"http://{host}:{port}/healthz", timeout=5.0)
    assert response.status_code == 200, f"{service} healthz returned {response.status_code}"
    assert response.json().get("status") == "healthy"


def test_kratos_ready() -> None:
    # Kratos's admin port (4434) real-redirects /health/ready ->
    # /admin/health/ready (307) — confirmed live; automation/health/
    # health-check.sh's `curl --fail` already treats this as healthy
    # (--fail only trips on 4xx/5xx), so this follows the redirect the
    # same way rather than asserting a bare 200.
    host = os.environ.get("EIP_DOCKER_HOST", "localhost")
    response = httpx.get(f"http://{host}:4434/health/ready", timeout=5.0, follow_redirects=True)
    assert response.status_code == 200


def test_hydra_ready() -> None:
    host = os.environ.get("EIP_DOCKER_HOST", "localhost")
    response = httpx.get(f"http://{host}:4445/health/ready", timeout=5.0, follow_redirects=True)
    assert response.status_code == 200


def test_keto_ready() -> None:
    host = os.environ.get("EIP_DOCKER_HOST", "localhost")
    response = httpx.get(f"http://{host}:4466/health/ready", timeout=5.0, follow_redirects=True)
    assert response.status_code == 200


def test_oathkeeper_ready() -> None:
    host = os.environ.get("EIP_DOCKER_HOST", "localhost")
    response = httpx.get(f"http://{host}:4456/health/ready", timeout=5.0, follow_redirects=True)
    assert response.status_code == 200


def test_mailhog_reachable() -> None:
    host = os.environ.get("EIP_DOCKER_HOST", "localhost")
    response = httpx.get(f"http://{host}:8025/api/v2/messages", timeout=5.0)
    assert response.status_code == 200


CONSOLE_ROUTES = [
    "identities", "sessions", "applications", "organizations", "groups",
    "roles", "policies", "permissions", "themes", "plugins", "flows",
    "notifications", "identity-providers", "developer", "reports", "audit",
    "settings",
]


@pytest.mark.parametrize("route", CONSOLE_ROUTES)
def test_console_page_returns_200(route: str) -> None:
    """Requires an authenticated admin session cookie — see
    tests/e2e/test_identity_lifecycle.py for how one is obtained. Skipped
    entirely if EIP_ADMIN_COOKIE isn't set, since a smoke test shouldn't
    itself perform a real login (that's the e2e suite's job)."""
    cookie = os.environ.get("EIP_ADMIN_COOKIE")
    if not cookie:
        pytest.skip("EIP_ADMIN_COOKIE not set — run after tests/e2e to get a real session")
    base_url = os.environ.get("EIP_BASE_URL", "http://localhost:4455")
    response = httpx.get(
        f"{base_url}/auth/console/{route}", cookies={"ory_kratos_session": cookie}, timeout=10.0,
    )
    assert response.status_code == 200, f"/console/{route} returned {response.status_code}"
