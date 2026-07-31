from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from hooks_service.main import app

REGISTRATION_PAYLOAD_BASE: dict[str, Any] = {
    "event": "user.registered",
    "timestamp": "http://kratos:4433/self-service/registration",
    "identity": {
        "id": "11111111-1111-1111-1111-111111111111",
        "schema_id": "enterprise_user",
        "state": "active",
        "traits": {"email": "alice@example.com"},
    },
    "flow": {"id": "flow-1", "type": "browser", "method": "password"},
}

LOGIN_PAYLOAD: dict[str, Any] = {
    "event": "user.login",
    "timestamp": "http://kratos:4433/self-service/login",
    "identity": {
        "id": "11111111-1111-1111-1111-111111111111",
        "schema_id": "enterprise_user",
        "traits": {"email": "alice@example.com"},
    },
    "session": {
        "id": "session-1",
        "active": True,
        "authenticator_assurance_level": "aal1",
        "authentication_methods": [{"method": "password"}],
    },
    "flow": {"id": "flow-2", "type": "browser", "method": "password"},
    "request_headers": {"user_agent": "pytest", "x_real_ip": "127.0.0.1"},
}


class FakeKetoClient:
    def __init__(self, raise_on_grant: bool = False, has_admin: bool = False) -> None:
        self.calls: list[tuple[str, str, str, str]] = []
        self.granted: list[str] = []
        self.revoked: list[str] = []
        self._raise_on_grant = raise_on_grant
        self.has_admin = has_admin

    async def write_organization_membership(
        self, organization_id: str, identity_id: str, role: str
    ) -> None:
        self.calls.append(("Organization", organization_id, role, identity_id))

    async def grant_platform_admin(self, identity_id: str) -> None:
        if self._raise_on_grant:
            raise httpx.ConnectError("boom")
        self.granted.append(identity_id)
        self.has_admin = True

    async def revoke_platform_admin(self, identity_id: str) -> None:
        self.revoked.append(identity_id)

    async def has_any_platform_admin(self, keto_read_url: str) -> bool:
        return self.has_admin

    async def aclose(self) -> None:  # pragma: no cover - not exercised in tests
        pass


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def fake_keto(client: TestClient) -> FakeKetoClient:
    fake = FakeKetoClient()
    app.state.keto = fake
    return fake


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_registration_without_organization_skips_keto(
    client: TestClient, fake_keto: FakeKetoClient
) -> None:
    response = client.post("/webhooks/registration", json=REGISTRATION_PAYLOAD_BASE)
    assert response.status_code == 200
    assert response.json() == {"status": "success"}
    assert fake_keto.calls == []


def test_registration_with_member_role_writes_one_tuple(
    client: TestClient, fake_keto: FakeKetoClient
) -> None:
    payload = {
        **REGISTRATION_PAYLOAD_BASE,
        "identity": {
            **REGISTRATION_PAYLOAD_BASE["identity"],
            "traits": {
                "email": "alice@example.com",
                "organization": {"id": "org-1", "role": "member"},
            },
        },
    }
    response = client.post("/webhooks/registration", json=payload)
    assert response.status_code == 200
    assert fake_keto.calls == [
        ("Organization", "org-1", "member", "11111111-1111-1111-1111-111111111111")
    ]


def test_registration_with_admin_role_writes_admin_and_member_tuples(
    client: TestClient, fake_keto: FakeKetoClient
) -> None:
    payload = {
        **REGISTRATION_PAYLOAD_BASE,
        "identity": {
            **REGISTRATION_PAYLOAD_BASE["identity"],
            "traits": {
                "email": "alice@example.com",
                "organization": {"id": "org-1", "role": "admin"},
            },
        },
    }
    response = client.post("/webhooks/registration", json=payload)
    assert response.status_code == 200
    # write_organization_membership is a single call on the fake; the real
    # KetoWriteClient fans this out into admin+member tuples (see
    # test_keto_client.py) — here we only assert the role passed through.
    assert fake_keto.calls == [
        ("Organization", "org-1", "admin", "11111111-1111-1111-1111-111111111111")
    ]


def test_registration_defaults_role_to_member_when_absent(
    client: TestClient, fake_keto: FakeKetoClient
) -> None:
    payload = {
        **REGISTRATION_PAYLOAD_BASE,
        "identity": {
            **REGISTRATION_PAYLOAD_BASE["identity"],
            "traits": {
                "email": "alice@example.com",
                "organization": {"id": "org-1"},
            },
        },
    }
    response = client.post("/webhooks/registration", json=payload)
    assert response.status_code == 200
    assert fake_keto.calls == [
        ("Organization", "org-1", "member", "11111111-1111-1111-1111-111111111111")
    ]


def test_registration_missing_identity_id_returns_422(client: TestClient) -> None:
    payload = {
        **REGISTRATION_PAYLOAD_BASE,
        "identity": {**REGISTRATION_PAYLOAD_BASE["identity"], "id": None},
    }
    response = client.post("/webhooks/registration", json=payload)
    assert response.status_code == 422


def test_login_webhook_returns_success(client: TestClient) -> None:
    response = client.post("/webhooks/login", json=LOGIN_PAYLOAD)
    assert response.status_code == 200
    assert response.json() == {"status": "success"}


def test_grant_platform_admin(client: TestClient, fake_keto: FakeKetoClient) -> None:
    response = client.post("/admin/platform-admins/user-1")
    assert response.status_code == 200
    assert response.json() == {"identity_id": "user-1", "platform_admin": True}
    assert fake_keto.granted == ["user-1"]


def test_grant_platform_admin_upstream_failure_returns_502(client: TestClient) -> None:
    app.state.keto = FakeKetoClient(raise_on_grant=True)
    response = client.post("/admin/platform-admins/user-1")
    assert response.status_code == 502


def test_revoke_platform_admin(client: TestClient, fake_keto: FakeKetoClient) -> None:
    response = client.delete("/admin/platform-admins/user-1")
    assert response.status_code == 200
    assert response.json() == {"identity_id": "user-1", "platform_admin": False}
    assert fake_keto.revoked == ["user-1"]


def test_bootstrap_status_reports_no_admin(client: TestClient, fake_keto: FakeKetoClient) -> None:
    response = client.get("/admin/bootstrap/status")
    assert response.status_code == 200
    assert response.json() == {"has_admin": False}


def test_bootstrap_status_reports_existing_admin(client: TestClient) -> None:
    app.state.keto = FakeKetoClient(has_admin=True)
    response = client.get("/admin/bootstrap/status")
    assert response.status_code == 200
    assert response.json() == {"has_admin": True}


def test_bootstrap_grants_admin_when_none_exists(
    client: TestClient, fake_keto: FakeKetoClient
) -> None:
    response = client.post("/admin/bootstrap", json={"identity_id": "user-1"})
    assert response.status_code == 201
    assert response.json() == {"identity_id": "user-1", "platform_admin": True}
    assert fake_keto.granted == ["user-1"]


def test_bootstrap_refuses_when_an_admin_already_exists(client: TestClient) -> None:
    fake = FakeKetoClient(has_admin=True)
    app.state.keto = fake
    response = client.post("/admin/bootstrap", json={"identity_id": "user-2"})
    assert response.status_code == 409
    assert "error" in response.json()
    assert fake.granted == []


def test_bootstrap_requires_identity_id(client: TestClient, fake_keto: FakeKetoClient) -> None:
    response = client.post("/admin/bootstrap", json={})
    assert response.status_code == 400


def test_bootstrap_upstream_failure_returns_502(client: TestClient) -> None:
    app.state.keto = FakeKetoClient(raise_on_grant=True)
    response = client.post("/admin/bootstrap", json={"identity_id": "user-1"})
    assert response.status_code == 502
