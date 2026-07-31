"""Basic latency measurement for key real endpoints — NOT a load-testing
setup (no concurrency, no ramping, no k6/Locust). This measures single-
request latency against the live stack and asserts a generous upper bound
to catch a genuinely broken/hanging service, not to gate performance
regressions precisely. A real load-testing harness (k6, Locust, or
similar) is a separate, larger undertaking not attempted here — see
docs/08-operations/performance.md for what that would require.

Run containerized: `make test-performance` (see Makefile).
"""

from __future__ import annotations

import os
import time

import httpx

GENEROUS_LOCAL_THRESHOLD_SECONDS = 2.0


def _time_request(url: str) -> float:
    start = time.monotonic()
    response = httpx.get(url, timeout=10.0, follow_redirects=True)
    elapsed = time.monotonic() - start
    assert response.status_code < 500, f"{url} returned {response.status_code}"
    return elapsed


def test_kratos_health_latency() -> None:
    host = os.environ.get("EIP_DOCKER_HOST", "localhost")
    elapsed = _time_request(f"http://{host}:4434/health/ready")
    assert elapsed < GENEROUS_LOCAL_THRESHOLD_SECONDS, f"Kratos health took {elapsed:.2f}s"


def test_console_api_health_latency() -> None:
    host = os.environ.get("EIP_DOCKER_HOST", "localhost")
    elapsed = _time_request(f"http://{host}:8086/healthz")
    assert elapsed < GENEROUS_LOCAL_THRESHOLD_SECONDS, f"console-api health took {elapsed:.2f}s"


def test_oidc_discovery_latency() -> None:
    base_url = os.environ.get("EIP_BASE_URL", "http://localhost:4455")
    elapsed = _time_request(f"{base_url}/.well-known/openid-configuration")
    assert elapsed < GENEROUS_LOCAL_THRESHOLD_SECONDS, f"OIDC discovery took {elapsed:.2f}s"


def test_ten_sequential_health_checks_stay_fast() -> None:
    """Not a concurrency test — just confirms the health endpoint doesn't
    degrade across repeated sequential calls (e.g. a connection leak)."""
    host = os.environ.get("EIP_DOCKER_HOST", "localhost")
    timings = [_time_request(f"http://{host}:8086/healthz") for _ in range(10)]
    assert max(timings) < GENEROUS_LOCAL_THRESHOLD_SECONDS
