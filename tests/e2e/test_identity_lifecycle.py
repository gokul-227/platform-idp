"""End-to-end identity lifecycle against a RUNNING platform stack.

Automates the manual curl-driven verification recorded in
docs/10-reference/ai-handoff.md §1.7/§1.9/§1.11: registration (two-step profile →
password), verification-email delivery, login, session whoami, and
logout — all through the Oathkeeper zero-trust proxy, exactly as a
browser would (cookie jar, real form fields).

Requires a running stack (`make up`, or any overlay/Helm install with
port-forwards). Configure via env:
  EIP_BASE_URL     (default http://localhost:4455)  — Oathkeeper proxy
  EIP_MAILHOG_URL  (default http://localhost:8025)  — Mailhog API

Run containerized (ADR-0013):
  make test-e2e
"""

from __future__ import annotations

import os
import re
import time
import uuid

import httpx
import pytest


class _BrowserishCookies:
    """A deliberately dumb cookie store wired via httpx event hooks.

    Python's http.cookiejar cannot be used against a local stack: it
    refuses to STORE cookies for dot-less domains (localhost) and refuses
    to RETURN `Secure` cookies over plain HTTP — but Kratos pins
    Domain=localhost and marks its CSRF cookie Secure, and real browsers
    accept both on localhost (RFC 6265bis trustworthy-origin exception).
    Both limitations were hit live while writing this suite (every flow
    fetch 403'd with security_csrf_violation; curl "worked" in the manual
    sessions only because curl ignores Secure). For a single-host test
    run, a name->value dict with hook injection is exactly browser-enough.
    """

    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    def on_response(self, response: httpx.Response) -> None:
        for value in response.headers.get_list("set-cookie"):
            pair = value.split(";", 1)[0]
            name, _, val = pair.partition("=")
            if val:
                self.store[name.strip()] = val.strip()
            else:
                self.store.pop(name.strip(), None)

    def on_request(self, request: httpx.Request) -> None:
        if self.store:
            request.headers["cookie"] = "; ".join(
                f"{k}={v}" for k, v in self.store.items()
            )

BASE = os.environ.get("EIP_BASE_URL", "http://localhost:4455").rstrip("/")
MAILHOG = os.environ.get("EIP_MAILHOG_URL", "http://localhost:8025").rstrip("/")
KRATOS = f"{BASE}/.ory/kratos/public"


def _csrf_from_nodes(flow: dict) -> str:
    for node in flow["ui"]["nodes"]:
        if node["attributes"].get("name") == "csrf_token":
            return str(node["attributes"]["value"])
    raise AssertionError("no csrf_token node in flow")


@pytest.fixture(scope="module")
def client() -> httpx.Client:
    cookies = _BrowserishCookies()
    with httpx.Client(
        timeout=15.0,
        follow_redirects=False,
        event_hooks={"request": [cookies.on_request], "response": [cookies.on_response]},
    ) as c:
        yield c


@pytest.fixture(scope="module")
def user() -> dict[str, str]:
    unique = uuid.uuid4().hex[:10]
    return {
        "email": f"e2e-{unique}@example.com",
        "username": f"e2e{unique}",
        "password": f"Sup3rSecure!{unique}A",
    }


def test_stack_is_up(client: httpx.Client) -> None:
    assert client.get(f"{KRATOS}/health/alive").status_code == 200
    assert client.get(f"{BASE}/.well-known/openid-configuration").status_code == 200


def test_registration_two_step(client: httpx.Client, user: dict[str, str]) -> None:
    # Browser flow init -> 303 with flow id + CSRF cookie
    r = client.get(f"{KRATOS}/self-service/registration/browser")
    assert r.status_code == 303
    flow_id = re.search(r"flow=([a-f0-9-]+)", r.headers["location"]).group(1)

    flow = client.get(
        f"{KRATOS}/self-service/registration/flows",
        params={"id": flow_id},
        headers={"Accept": "application/json"},
    ).json()

    # Step 1: profile (this Kratos version's two-step UX). Kratos answers
    # the profile->credential TRANSITION with HTTP 400 + state
    # "choose_method" (an info message, not an error) — that's the normal
    # intermediate response in JSON mode, discovered while automating this
    # (the manual curl sessions never checked this step's status code).
    r = client.post(
        f"{KRATOS}/self-service/registration",
        params={"flow": flow_id},
        headers={"Accept": "application/json"},
        json={
            "csrf_token": _csrf_from_nodes(flow),
            "method": "profile",
            "traits.email": user["email"],
            "traits.username": user["username"],
        },
    )
    assert r.status_code in (200, 400), r.text
    assert r.json().get("state") == "choose_method", r.text

    # Step 2: password credential
    r = client.post(
        f"{KRATOS}/self-service/registration",
        params={"flow": flow_id},
        headers={"Accept": "application/json"},
        json={
            "csrf_token": _csrf_from_nodes(r.json()),
            "method": "password",
            "password": user["password"],
            "traits.email": user["email"],
            "traits.username": user["username"],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["session"]["identity"]["traits"]["email"] == user["email"]
    assert any(c["action"] == "show_verification_ui" for c in body.get("continue_with", []))


def _newest_code_for(client: httpx.Client, email: str) -> str | None:
    """Newest 6-digit verification code emailed to `email`, via Mailhog.

    Mailhog returns items newest-first, but a naive "overwrite in a loop"
    read ends on the OLDEST match — so a fresh verification flow would pick
    a stale code from the registration email and never reach
    passed_challenge (hit live writing this suite). Sort by Created and
    take the newest.
    """
    for _ in range(20):
        msgs = client.get(f"{MAILHOG}/api/v2/messages").json()
        candidates = [
            m for m in msgs.get("items", []) if email in str(m["Content"]["Headers"].get("To"))
        ]
        candidates.sort(key=lambda m: m.get("Created", ""), reverse=True)
        for m in candidates:
            match = re.search(r"following code:\s*=?\s*(\d{6})", m["Content"]["Body"])
            if match:
                return match.group(1)
        time.sleep(2)
    return None


def test_verification_email_and_login(client: httpx.Client, user: dict[str, str]) -> None:
    # Fresh verification flow — submitting the email triggers the flow-bound code email.
    r = client.get(f"{KRATOS}/self-service/verification/browser")
    vflow_id = re.search(r"flow=([a-f0-9-]+)", r.headers["location"]).group(1)
    vflow = client.get(
        f"{KRATOS}/self-service/verification/flows",
        params={"id": vflow_id},
        headers={"Accept": "application/json"},
    ).json()
    r = client.post(
        f"{KRATOS}/self-service/verification",
        params={"flow": vflow_id},
        headers={"Accept": "application/json"},
        json={
            "csrf_token": _csrf_from_nodes(vflow),
            "method": "code",
            "email": user["email"],
        },
    )
    assert r.status_code == 200, r.text

    code = _newest_code_for(client, user["email"])
    assert code, "verification email never arrived in Mailhog"
    r = client.post(
        f"{KRATOS}/self-service/verification",
        params={"flow": vflow_id},
        headers={"Accept": "application/json"},
        json={"csrf_token": _csrf_from_nodes(r.json()), "method": "code", "code": code},
    )
    assert r.status_code == 200, r.text
    assert r.json().get("state") == "passed_challenge"

    # Registration ran `hook: session` (see kratos.yaml), so the client is
    # ALREADY authenticated here — whoami confirms it. Log that session out
    # before exercising a fresh login (otherwise /self-service/login/browser
    # short-circuits to the return URL with no flow, since a session already
    # exists — hit live automating this).
    assert client.get(f"{KRATOS}/sessions/whoami").status_code == 200
    token = client.get(
        f"{KRATOS}/self-service/logout/browser", headers={"Accept": "application/json"}
    ).json()["logout_token"]
    assert client.get(f"{KRATOS}/self-service/logout", params={"token": token}).status_code == 303
    assert client.get(f"{KRATOS}/sessions/whoami").status_code == 401

    # Fresh login, then whoami, then logout invalidates the session again.
    r = client.get(f"{KRATOS}/self-service/login/browser")
    lflow_id = re.search(r"flow=([a-f0-9-]+)", r.headers["location"]).group(1)
    lflow = client.get(
        f"{KRATOS}/self-service/login/flows",
        params={"id": lflow_id},
        headers={"Accept": "application/json"},
    ).json()
    r = client.post(
        f"{KRATOS}/self-service/login",
        params={"flow": lflow_id},
        headers={"Accept": "application/json"},
        json={
            "csrf_token": _csrf_from_nodes(lflow),
            "method": "password",
            "identifier": user["email"],
            "password": user["password"],
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["session"]["authenticator_assurance_level"] == "aal1"

    assert client.get(f"{KRATOS}/sessions/whoami").status_code == 200

    token = client.get(
        f"{KRATOS}/self-service/logout/browser", headers={"Accept": "application/json"}
    ).json()["logout_token"]
    r = client.get(f"{KRATOS}/self-service/logout", params={"token": token})
    assert r.status_code == 303
    assert client.get(f"{KRATOS}/sessions/whoami").status_code == 401
