from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from auth_service.hydra_client import HydraAdminClient
from auth_service.kratos_client import KratosAdminClient, KratosFrontendClient


class FakeHydraAdminClient(HydraAdminClient):
    def __init__(self) -> None:
        self.login_requests: dict[str, dict[str, Any]] = {}
        self.consent_requests: dict[str, dict[str, Any]] = {}
        self.accepted_logins: list[tuple[str, dict[str, Any]]] = []
        self.accepted_consents: list[tuple[str, dict[str, Any]]] = []
        self.accepted_logouts: list[str] = []

    async def get_login_request(self, challenge: str) -> dict[str, Any]:
        return self.login_requests[challenge]

    async def accept_login_request(self, challenge: str, body: dict[str, Any]) -> dict[str, Any]:
        self.accepted_logins.append((challenge, body))
        return {"redirect_to": "https://app.example.com/callback"}

    async def get_consent_request(self, challenge: str) -> dict[str, Any]:
        return self.consent_requests[challenge]

    async def accept_consent_request(self, challenge: str, body: dict[str, Any]) -> dict[str, Any]:
        self.accepted_consents.append((challenge, body))
        return {"redirect_to": "https://app.example.com/callback"}

    async def accept_logout_request(self, challenge: str) -> dict[str, Any]:
        self.accepted_logouts.append(challenge)
        return {"redirect_to": "https://app.example.com/logged-out"}

    async def aclose(self) -> None:
        pass


class FakeKratosFrontendClient(KratosFrontendClient):
    def __init__(self, session: dict[str, Any] | None = None) -> None:
        self.session = session

    async def to_session(self, cookie: str) -> dict[str, Any] | None:
        return self.session

    async def aclose(self) -> None:
        pass


class FakeKratosAdminClient(KratosAdminClient):
    def __init__(self, identities: dict[str, dict[str, Any]] | None = None) -> None:
        self.identities = identities or {}

    async def get_identity(self, identity_id: str) -> dict[str, Any] | None:
        return self.identities.get(identity_id)

    async def aclose(self) -> None:
        pass


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OTEL_ENABLED", "false")


@pytest.fixture
def client() -> Iterator[TestClient]:
    from auth_service.main import app

    with TestClient(app, follow_redirects=False) as test_client:
        yield test_client


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "auth-service"}


def test_login_without_challenge_returns_400(client: TestClient) -> None:
    response = client.get("/hydra/login")
    assert response.status_code == 400


def test_login_skip_accepts_immediately(client: TestClient) -> None:
    from auth_service.main import app

    hydra = FakeHydraAdminClient()
    hydra.login_requests["chal-1"] = {"skip": True, "subject": "user-1"}
    app.state.hydra = hydra

    response = client.get("/hydra/login", params={"login_challenge": "chal-1"})
    assert response.status_code == 302
    assert response.headers["location"] == "https://app.example.com/callback"
    assert hydra.accepted_logins == [("chal-1", {"subject": "user-1"})]


def test_login_with_kratos_session_accepts(client: TestClient) -> None:
    from auth_service.main import app

    hydra = FakeHydraAdminClient()
    hydra.login_requests["chal-2"] = {"skip": False}
    app.state.hydra = hydra
    app.state.kratos = FakeKratosFrontendClient(
        session={"identity": {"id": "user-2", "traits": {"email": "user-2@example.com"}}}
    )

    response = client.get(
        "/hydra/login", params={"login_challenge": "chal-2"}, cookies={"ory_kratos_session": "x"}
    )
    assert response.status_code == 302
    assert hydra.accepted_logins == [
        (
            "chal-2",
            {
                "subject": "user-2",
                "remember": True,
                "remember_for": 3600,
                # _display_name falls back to the email local-part rather than
                # None — a real RP (Mealie) rejects a missing OIDC `name` claim.
                "context": {"email": "user-2@example.com", "name": "user-2"},
            },
        )
    ]


def test_login_flattens_nested_name_trait_to_a_string(client: TestClient) -> None:
    """The OIDC `name` claim must be a string (OpenID Connect Core 5.1) —
    the identity schema stores it as {"first": ..., "last": ...}. Passing
    the raw dict through broke real RPs (Mealie/Authlib rejected it as an
    empty claim); confirmed live against the running platform.
    """
    from auth_service.main import app

    hydra = FakeHydraAdminClient()
    hydra.login_requests["chal-name"] = {"skip": False}
    app.state.hydra = hydra
    app.state.kratos = FakeKratosFrontendClient(
        session={
            "identity": {
                "id": "user-3",
                "traits": {
                    "email": "user-3@example.com",
                    "name": {"first": "Meal", "last": "Tester"},
                },
            }
        }
    )

    response = client.get(
        "/hydra/login",
        params={"login_challenge": "chal-name"},
        cookies={"ory_kratos_session": "x"},
    )
    assert response.status_code == 302
    assert hydra.accepted_logins == [
        (
            "chal-name",
            {
                "subject": "user-3",
                "remember": True,
                "remember_for": 3600,
                "context": {"email": "user-3@example.com", "name": "Meal Tester"},
            },
        )
    ]


def test_login_without_session_redirects_to_kratos(client: TestClient) -> None:
    from auth_service.main import app

    hydra = FakeHydraAdminClient()
    hydra.login_requests["chal-3"] = {"skip": False}
    app.state.hydra = hydra
    app.state.kratos = FakeKratosFrontendClient(session=None)

    response = client.get("/hydra/login", params={"login_challenge": "chal-3"})
    assert response.status_code == 302
    assert "self-service/login/browser" in response.headers["location"]
    assert hydra.accepted_logins == []


def test_consent_without_challenge_returns_400(client: TestClient) -> None:
    response = client.get("/hydra/consent")
    assert response.status_code == 400


def test_consent_auto_accepts_requested_scope(client: TestClient) -> None:
    from auth_service.main import app

    hydra = FakeHydraAdminClient()
    hydra.consent_requests["consent-1"] = {
        "requested_scope": ["openid", "profile"],
        "requested_access_token_audience": [],
        "context": {"email": "alice@example.com", "name": "Alice"},
        "client": {"client_id": "demo-app"},
    }
    app.state.hydra = hydra

    response = client.get("/hydra/consent", params={"consent_challenge": "consent-1"})
    assert response.status_code == 302
    challenge, body = hydra.accepted_consents[0]
    assert challenge == "consent-1"
    assert body["grant_scope"] == ["openid", "profile"]
    assert body["session"]["id_token"]["email"] == "alice@example.com"


def test_consent_falls_back_to_admin_identity_lookup_when_context_missing(
    client: TestClient,
) -> None:
    """Kratos's own oauth2_provider integration completes a fresh login's
    Hydra challenge directly (needed so /self-service/login/browser?
    login_challenge=... doesn't 500 — see kratos.yaml.tmpl's oauth2_provider
    comment), bypassing /hydra/login's context-building entirely. Confirmed
    live: a real Open WebUI login produced an ID token with email=None/
    name=None until this fallback was added.
    """
    from auth_service.main import app

    hydra = FakeHydraAdminClient()
    hydra.consent_requests["consent-2"] = {
        "requested_scope": ["openid", "email", "profile"],
        "requested_access_token_audience": [],
        "context": {},
        "subject": "user-4",
        "client": {"client_id": "open-webui-demo"},
    }
    app.state.hydra = hydra
    app.state.kratos_admin = FakeKratosAdminClient(
        identities={
            "user-4": {
                "id": "user-4",
                "traits": {
                    "email": "user-4@example.com",
                    "name": {"first": "Web", "last": "Ui"},
                },
            }
        }
    )

    response = client.get("/hydra/consent", params={"consent_challenge": "consent-2"})
    assert response.status_code == 302
    challenge, body = hydra.accepted_consents[0]
    assert challenge == "consent-2"
    assert body["session"]["id_token"]["email"] == "user-4@example.com"
    assert body["session"]["id_token"]["name"] == "Web Ui"


def test_logout_without_challenge_returns_400(client: TestClient) -> None:
    response = client.get("/hydra/logout")
    assert response.status_code == 400


def test_logout_accepts_and_redirects(client: TestClient) -> None:
    from auth_service.main import app

    hydra = FakeHydraAdminClient()
    app.state.hydra = hydra

    response = client.get("/hydra/logout", params={"logout_challenge": "logout-1"})
    assert response.status_code == 302
    assert response.headers["location"] == "https://app.example.com/logged-out"
    assert hydra.accepted_logouts == ["logout-1"]


def test_auth_error_page(client: TestClient) -> None:
    response = client.get("/hydra/error", params={"error": "login_failed"})
    assert response.status_code == 500
    assert "login_failed" in response.text
