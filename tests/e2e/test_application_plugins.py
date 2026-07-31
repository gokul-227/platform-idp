"""Application plugin OIDC verification (Superset, Airflow).

Requires `make up-applications`, registry entries enabled, and `make sync`.
Applications are OIDC clients only — identity lifecycle stays on Kratos/UI.

JupyterHub was evaluated as a sample application and removed (its OAuth client
library, `oauthenticator`, has no PKCE support at any pinned or latest
version — see `docs/10-reference/ai-handoff.md`); it is intentionally absent
from APPS below.
"""

from __future__ import annotations

import os
import re
import uuid

import httpx
import pytest

BASE = os.environ.get("EIP_BASE_URL", "http://localhost:4455").rstrip("/")
KRATOS = f"{BASE}/.ory/kratos/public"
KETO_WRITE = os.environ.get("EIP_KETO_WRITE_URL", "http://localhost:4467").rstrip("/")

APPS = {
    "superset": {
        "path": "/apps/superset/login/",
        "secret_env": "SUPERSET_OIDC_CLIENT_SECRET",
    },
    "airflow": {
        "path": "/apps/airflow/login/",
        "secret_env": "AIRFLOW_OIDC_CLIENT_SECRET",
    },
}


class _BrowserishCookies:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    def on_response(self, response: httpx.Response) -> None:
        for value in response.headers.get_list("set-cookie"):
            pair = value.split(";", 1)[0]
            name, _, val = pair.partition("=")
            if val:
                self.store[name.strip()] = val.strip()

    def on_request(self, request: httpx.Request) -> None:
        if self.store:
            request.headers["cookie"] = "; ".join(f"{k}={v}" for k, v in self.store.items())


def _csrf(flow: dict) -> str:
    for node in flow["ui"]["nodes"]:
        if node["attributes"].get("name") == "csrf_token":
            return str(node["attributes"]["value"])
    raise AssertionError("no csrf")


def _register_and_login(client: httpx.Client) -> tuple[str, dict[str, str]]:
    unique = uuid.uuid4().hex[:10]
    user = {
        "email": f"app-{unique}@example.com",
        "username": f"app{unique}",
        "password": f"Sup3rSecure!{unique}A",
    }
    r = client.get(f"{KRATOS}/self-service/registration/browser")
    flow_id = re.search(r"flow=([a-f0-9-]+)", r.headers["location"]).group(1)
    flow = client.get(
        f"{KRATOS}/self-service/registration/flows",
        params={"id": flow_id},
        headers={"Accept": "application/json"},
    ).json()
    client.post(
        f"{KRATOS}/self-service/registration",
        params={"flow": flow_id},
        headers={"Accept": "application/json"},
        json={
            "csrf_token": _csrf(flow),
            "method": "profile",
            "traits.email": user["email"],
            "traits.username": user["username"],
        },
    )
    r = client.post(
        f"{KRATOS}/self-service/registration",
        params={"flow": flow_id},
        headers={"Accept": "application/json"},
        json={
            "csrf_token": _csrf(flow),
            "method": "password",
            "password": user["password"],
            "traits.email": user["email"],
            "traits.username": user["username"],
        },
    )
    assert r.status_code == 200, r.text
    identity_id = r.json()["session"]["identity"]["id"]
    return identity_id, user


@pytest.fixture(scope="module")
def session_client() -> httpx.Client:
    cookies = _BrowserishCookies()
    with httpx.Client(
        timeout=30.0,
        follow_redirects=False,
        event_hooks={"request": [cookies.on_request], "response": [cookies.on_response]},
    ) as c:
        if c.get(f"{BASE}/.well-known/openid-configuration").status_code != 200:
            pytest.skip("platform stack not running")
        identity_id, _user = _register_and_login(c)
        for app in APPS:
            c.put(
                f"{KETO_WRITE}/admin/relation-tuples",
                json={
                    "namespace": "Resource",
                    "object": app,
                    "relation": "view",
                    "subject_id": identity_id,
                },
            )
        yield c


def _app_running(client: httpx.Client, app: str, path: str) -> bool:
    try:
        r = client.get(f"{BASE}{path}", timeout=5.0)
    except (httpx.ConnectError, httpx.ReadTimeout):
        return False
    return r.status_code != 502


@pytest.mark.parametrize("app", list(APPS.keys()))
def test_application_oidc_login_redirect(session_client: httpx.Client, app: str) -> None:
    cfg = APPS[app]
    if not os.environ.get(cfg["secret_env"]):
        pytest.skip(f"{cfg['secret_env']} not set — run make sync after enabling registry entry")
    if not _app_running(session_client, app, cfg["path"]):
        pytest.skip(f"{app} container not running — use make up-applications")

    r = session_client.get(f"{BASE}{cfg['path']}")
    chain = [str(r.url)]
    for _ in range(15):
        if r.status_code not in (301, 302, 303, 307, 308):
            break
        loc = r.headers.get("location")
        assert loc, r.text
        if loc.startswith("/"):
            loc = f"{BASE}{loc}"
        chain.append(loc)
        if "/oauth2/auth" in loc or "/hydra/login" in loc:
            break
        r = session_client.get(loc)
    assert any("/oauth2/auth" in u or "/hydra/login" in u for u in chain), chain
