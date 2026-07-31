"""Extended Ory platform verification against a RUNNING stack.

Exercises Hydra OAuth/OIDC, Keto ReBAC, Oathkeeper authn/authz, and (when
`make up-full` is used) observability endpoints. Run via `make test-e2e-platform`.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import uuid

import httpx
import pytest

BASE = os.environ.get("EIP_BASE_URL", "http://localhost:4455").rstrip("/")
HYDRA_ADMIN = os.environ.get("EIP_HYDRA_ADMIN_URL", "http://localhost:4445").rstrip("/")
KETO_READ = os.environ.get("EIP_KETO_READ_URL", "http://localhost:4466").rstrip("/")
KETO_WRITE = os.environ.get("EIP_KETO_WRITE_URL", "http://localhost:4467").rstrip("/")
PROM = os.environ.get("EIP_PROMETHEUS_URL", "http://localhost:9090").rstrip("/")
GRAFANA = os.environ.get("EIP_GRAFANA_URL", "http://localhost:3001").rstrip("/")
LOKI = os.environ.get("EIP_LOKI_URL", "http://localhost:3100").rstrip("/")
TEMPO = os.environ.get("EIP_TEMPO_URL", "http://localhost:3200").rstrip("/")
KRATOS = f"{BASE}/.ory/kratos/public"


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(32)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


@pytest.fixture(scope="module")
def client() -> httpx.Client:
    with httpx.Client(timeout=20.0, follow_redirects=False) as c:
        yield c


def test_hydra_oidc_discovery_and_jwks(client: httpx.Client) -> None:
    discovery = client.get(f"{BASE}/.well-known/openid-configuration")
    assert discovery.status_code == 200, discovery.text
    doc = discovery.json()
    assert doc["issuer"].startswith("http")
    assert "authorization_endpoint" in doc
    jwks = client.get(doc["jwks_uri"].replace("http://localhost:4444", BASE))
    assert jwks.status_code == 200
    assert "keys" in jwks.json()


def test_hydra_client_credentials(client: httpx.Client) -> None:
    cid = f"cc-{uuid.uuid4().hex[:8]}"
    secret = secrets.token_urlsafe(24)
    r = client.post(
        f"{HYDRA_ADMIN}/admin/clients",
        json={
            "client_id": cid,
            "client_secret": secret,
            "grant_types": ["client_credentials"],
            "token_endpoint_auth_method": "client_secret_post",
            "scope": "openid",
        },
    )
    assert r.status_code in (200, 201), r.text
    tok = client.post(
        f"{BASE}/oauth2/token",
        data={"grant_type": "client_credentials", "client_id": cid, "client_secret": secret, "scope": "openid"},
    )
    assert tok.status_code == 200, tok.text
    assert tok.json().get("access_token")
    client.delete(f"{HYDRA_ADMIN}/admin/clients/{cid}")


def test_hydra_authorization_code_pkce_and_introspection(client: httpx.Client) -> None:
    cid = f"pkce-{uuid.uuid4().hex[:8]}"
    secret = secrets.token_urlsafe(24)
    client.post(
        f"{HYDRA_ADMIN}/admin/clients",
        json={
            "client_id": cid,
            "client_secret": secret,
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "redirect_uris": [f"{BASE}/callback"],
            "token_endpoint_auth_method": "client_secret_post",
            "scope": "openid offline_access",
        },
    )
    verifier, challenge = _pkce()
    state = secrets.token_urlsafe(8)
    auth = client.get(
        f"{BASE}/oauth2/auth",
        params={
            "client_id": cid,
            "response_type": "code",
            "scope": "openid offline_access",
            "redirect_uri": f"{BASE}/callback",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        },
    )
    assert auth.status_code in (302, 303), auth.text
    login_url = auth.headers["location"]
    assert "/hydra/login" in login_url or "login_challenge" in login_url
    client.delete(f"{HYDRA_ADMIN}/admin/clients/{cid}")


def test_keto_rbac_rebac_check_and_expand(client: httpx.Client) -> None:
    subject = f"user-{uuid.uuid4().hex[:8]}"
    obj = f"doc-{uuid.uuid4().hex[:6]}"
    put = client.put(
        f"{KETO_WRITE}/admin/relation-tuples",
        json={"namespace": "Resource", "object": obj, "relation": "view", "subject_id": subject},
    )
    assert put.status_code in (200, 201), put.text
    allowed = client.post(
        f"{KETO_READ}/relation-tuples/check",
        json={"namespace": "Resource", "object": obj, "relation": "view", "subject_id": subject},
    )
    assert allowed.status_code == 200
    assert allowed.json().get("allowed") is True
    denied = client.post(
        f"{KETO_READ}/relation-tuples/check",
        json={"namespace": "Resource", "object": obj, "relation": "view", "subject_id": "other-user"},
    )
    # Real Keto behavior: a denied check is a 403, not a 200 with allowed=false.
    assert denied.status_code == 403
    assert denied.json().get("allowed") is False
    # Real Keto behavior: expand is a GET with query params, not a POST with a
    # JSON body (POST returns 405 Method Not Allowed).
    expand = client.get(
        f"{KETO_READ}/relation-tuples/expand",
        params={"namespace": "Resource", "object": obj, "relation": "view", "max-depth": 3},
    )
    assert expand.status_code == 200, expand.text


def test_oathkeeper_bearer_introspection_denies_without_keto(client: httpx.Client) -> None:
    cid = f"api-{uuid.uuid4().hex[:8]}"
    secret = secrets.token_urlsafe(24)
    client.post(
        f"{HYDRA_ADMIN}/admin/clients",
        json={
            "client_id": cid,
            "client_secret": secret,
            "grant_types": ["client_credentials"],
            "token_endpoint_auth_method": "client_secret_post",
        },
    )
    tok = client.post(
        f"{BASE}/oauth2/token",
        data={"grant_type": "client_credentials", "client_id": cid, "client_secret": secret},
    ).json()["access_token"]
    r = client.get(f"{BASE}/api/v1/apps/test-resource", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code in (401, 403, 404), r.text
    client.delete(f"{HYDRA_ADMIN}/admin/clients/{cid}")


def test_kratos_admin_identities_api(client: httpx.Client) -> None:
    r = client.get("http://localhost:4434/admin/identities?per_page=1")
    assert r.status_code == 200, r.text


def test_auth_ui_registration_page(client: httpx.Client) -> None:
    # Real behavior with no `flow` query param yet: identity-ui 307s into
    # Kratos's registration/browser init, which 303s back with a flow id —
    # this GET (no follow_redirects) only observes the first hop.
    r = client.get(f"{BASE}/auth/registration")
    assert r.status_code == 307, r.text
    assert "registration/browser" in r.headers.get("location", "")


@pytest.mark.parametrize(
    "url",
    [
        f"{PROM}/-/ready",
        f"{GRAFANA}/api/health",
        f"{LOKI}/ready",
        f"{TEMPO}/ready",
    ],
)
def test_observability_endpoints(client: httpx.Client, url: str) -> None:
    try:
        r = client.get(url)
    except httpx.ConnectError:
        pytest.skip("observability stack not running (use make up-full)")
    assert r.status_code == 200, f"{url} -> {r.status_code}"


def test_prometheus_scrapes_ory_targets(client: httpx.Client) -> None:
    try:
        r = client.get(f"{PROM}/api/v1/targets")
    except httpx.ConnectError:
        pytest.skip("Prometheus not running")
    assert r.status_code == 200
    active = [t for t in r.json()["data"]["activeTargets"] if t["health"] == "up"]
    assert len(active) >= 4, json.dumps(r.json()["data"]["activeTargets"], indent=2)[:500]
