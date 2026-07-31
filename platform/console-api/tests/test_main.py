from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from console_api.audit_client import AuditClient
from console_api.hydra_admin_client import ClientNotFoundError, HydraAdminClient
from console_api.hydra_public_client import HydraPublicClient, TokenRequestError
from console_api.keto_admin_client import KetoAdminClient
from console_api.kratos_admin_client import (
    IdentityNotFoundError,
    KratosAdminClient,
    SessionNotFoundError,
)


class FakeKratosAdminClient(KratosAdminClient):
    def __init__(self) -> None:
        self.identities: dict[str, dict[str, Any]] = {}
        self.sessions: set[str] = {"session-1", "session-2"}
        self.revoked_all_for: list[str] = []
        self._next_id = 1

    async def create_identity(
        self,
        traits: dict[str, Any],
        schema_id: str = "enterprise_user",
        password: str | None = None,
    ) -> dict[str, Any]:
        identity_id = f"id-{self._next_id}"
        self._next_id += 1
        identity = {
            "id": identity_id,
            "schema_id": schema_id,
            "state": "active",
            "traits": traits,
        }
        self.identities[identity_id] = identity
        return identity

    async def set_identity_state(self, identity_id: str, state: str) -> dict[str, Any]:
        if identity_id not in self.identities:
            raise IdentityNotFoundError(identity_id)
        self.identities[identity_id]["state"] = state
        return self.identities[identity_id]

    async def update_traits(self, identity_id: str, traits: dict[str, Any]) -> dict[str, Any]:
        if identity_id not in self.identities:
            raise IdentityNotFoundError(identity_id)
        self.identities[identity_id]["traits"] = traits
        return self.identities[identity_id]

    async def force_verify(self, identity_id: str) -> dict[str, Any]:
        if identity_id not in self.identities:
            raise IdentityNotFoundError(identity_id)
        self.identities[identity_id]["force_verified"] = True
        return self.identities[identity_id]

    async def set_password(self, identity_id: str, password: str) -> dict[str, Any]:
        if identity_id not in self.identities:
            raise IdentityNotFoundError(identity_id)
        self.identities[identity_id]["password_reset"] = True
        return self.identities[identity_id]

    async def delete_identity(self, identity_id: str) -> None:
        if identity_id not in self.identities:
            raise IdentityNotFoundError(identity_id)
        del self.identities[identity_id]

    async def revoke_session(self, session_id: str) -> None:
        if session_id not in self.sessions:
            raise SessionNotFoundError(session_id)
        self.sessions.discard(session_id)

    async def revoke_all_sessions(self, identity_id: str) -> None:
        if identity_id not in self.identities:
            raise IdentityNotFoundError(identity_id)
        self.revoked_all_for.append(identity_id)

    async def aclose(self) -> None:
        pass


class FakeHydraPublicClient(HydraPublicClient):
    def __init__(self, valid_secrets: dict[str, str] | None = None) -> None:
        self.valid_secrets = valid_secrets or {}

    async def client_credentials_token(
        self, client_id: str, client_secret: str, scope: str
    ) -> dict[str, Any]:
        if self.valid_secrets.get(client_id) != client_secret:
            raise TokenRequestError(401, {"error": "invalid_client"})
        return {"access_token": "fake-token", "scope": scope, "token_type": "bearer"}

    async def authorization_code_token(
        self, client_id: str, code: str, redirect_uri: str, code_verifier: str
    ) -> dict[str, Any]:
        if code != "valid-code":
            raise TokenRequestError(400, {"error": "invalid_grant"})
        return {
            "access_token": "fake-access-token",
            "refresh_token": "fake-refresh-token",
            "token_type": "bearer",
        }

    async def refresh_token(self, client_id: str, refresh_token: str) -> dict[str, Any]:
        if refresh_token != "fake-refresh-token":
            raise TokenRequestError(400, {"error": "invalid_grant"})
        return {"access_token": "refreshed-access-token", "token_type": "bearer"}

    async def aclose(self) -> None:
        pass


class FakeHydraAdminClient(HydraAdminClient):
    def __init__(self) -> None:
        self.clients: dict[str, dict[str, Any]] = {}
        self._next_id = 1

    async def create_client(self, payload: dict[str, Any]) -> dict[str, Any]:
        client_id = payload.get("client_id") or f"client-{self._next_id}"
        self._next_id += 1
        client = {"client_secret": "generated-secret", **payload, "client_id": client_id}
        self.clients[client_id] = client
        return client

    async def get_client(self, client_id: str) -> dict[str, Any]:
        if client_id not in self.clients:
            raise ClientNotFoundError(client_id)
        return self.clients[client_id]

    async def update_client(self, client_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        if client_id not in self.clients:
            raise ClientNotFoundError(client_id)
        self.clients[client_id] = {**self.clients[client_id], **payload}
        return self.clients[client_id]

    async def patch_client(
        self, client_id: str, operations: list[dict[str, Any]]
    ) -> dict[str, Any]:
        if client_id not in self.clients:
            raise ClientNotFoundError(client_id)
        for op in operations:
            key = str(op["path"]).lstrip("/")
            self.clients[client_id][key] = op["value"]
        return self.clients[client_id]

    async def delete_client(self, client_id: str) -> None:
        if client_id not in self.clients:
            raise ClientNotFoundError(client_id)
        del self.clients[client_id]

    async def list_clients(self, page_size: int = 200) -> list[dict[str, Any]]:
        return list(self.clients.values())

    async def aclose(self) -> None:
        pass


class FakeKetoAdminClient(KetoAdminClient):
    def __init__(self) -> None:
        self.tuples: list[dict[str, Any]] = []

    async def create_relationship(
        self,
        namespace: str,
        object_id: str,
        relation: str,
        subject_id: str | None = None,
        subject_set: dict[str, Any] | None = None,
    ) -> None:
        self.tuples.append(
            {
                "namespace": namespace,
                "object": object_id,
                "relation": relation,
                "subject_id": subject_id,
                "subject_set": subject_set,
            }
        )

    async def delete_relationship(
        self,
        namespace: str,
        object_id: str,
        relation: str,
        subject_id: str | None = None,
        subject_set: dict[str, Any] | None = None,
    ) -> None:
        self.tuples = [
            t
            for t in self.tuples
            if not (
                t["namespace"] == namespace
                and t["object"] == object_id
                and t["relation"] == relation
                and t["subject_id"] == subject_id
                and t["subject_set"] == subject_set
            )
        ]

    async def aclose(self) -> None:
        pass


class FakeAuditClient(AuditClient):
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []

    async def record(
        self,
        logger: Any,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        actor_id: str | None = None,
    ) -> None:
        self.events.append(
            {"action": action, "resource_type": resource_type, "resource_id": resource_id}
        )

    async def aclose(self) -> None:
        pass


@pytest.fixture
def fake_kratos() -> FakeKratosAdminClient:
    return FakeKratosAdminClient()


@pytest.fixture
def fake_hydra() -> FakeHydraAdminClient:
    return FakeHydraAdminClient()


@pytest.fixture
def fake_keto() -> FakeKetoAdminClient:
    return FakeKetoAdminClient()


@pytest.fixture
def client(
    fake_kratos: FakeKratosAdminClient,
    fake_hydra: FakeHydraAdminClient,
    fake_keto: FakeKetoAdminClient,
) -> Iterator[TestClient]:
    from console_api.main import app

    with TestClient(app) as test_client:
        app.state.kratos = fake_kratos
        app.state.hydra = fake_hydra
        app.state.hydra_public = FakeHydraPublicClient(
            valid_secrets={"test-client": "correct-secret"}
        )
        app.state.keto = fake_keto
        app.state.audit = FakeAuditClient()
        yield test_client


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "console-api"}


def test_create_identity(client: TestClient) -> None:
    response = client.post("/api/v1/identities", json={"email": "sampleuser3@example.com"})
    assert response.status_code == 201
    body = response.json()
    assert body["traits"]["email"] == "sampleuser3@example.com"
    assert body["state"] == "active"


def test_update_identity_traits(client: TestClient) -> None:
    created = client.post("/api/v1/identities", json={"email": "a@example.com"}).json()
    response = client.put(
        f"/api/v1/identities/{created['id']}/traits",
        json={"traits": {"email": "changed@example.com"}},
    )
    assert response.status_code == 200
    assert response.json()["traits"]["email"] == "changed@example.com"


def test_update_traits_unknown_identity_404s(client: TestClient) -> None:
    response = client.put(
        "/api/v1/identities/does-not-exist/traits", json={"traits": {"email": "x@example.com"}}
    )
    assert response.status_code == 404


def test_force_verify_identity(client: TestClient) -> None:
    created = client.post("/api/v1/identities", json={"email": "a@example.com"}).json()
    response = client.post(f"/api/v1/identities/{created['id']}/force-verify")
    assert response.status_code == 200
    assert response.json()["force_verified"] is True


def test_force_verify_unknown_identity_404s(client: TestClient) -> None:
    response = client.post("/api/v1/identities/does-not-exist/force-verify")
    assert response.status_code == 404


def test_reset_identity_password(client: TestClient) -> None:
    created = client.post("/api/v1/identities", json={"email": "a@example.com"}).json()
    response = client.post(
        f"/api/v1/identities/{created['id']}/reset-password", json={"password": "NewPassw0rd!"}
    )
    assert response.status_code == 200
    assert response.json()["password_reset"] is True


def test_reset_password_unknown_identity_404s(client: TestClient) -> None:
    response = client.post(
        "/api/v1/identities/does-not-exist/reset-password", json={"password": "NewPassw0rd!"}
    )
    assert response.status_code == 404


def test_update_traits_records_audit_event(client: TestClient) -> None:
    from console_api.main import app

    created = client.post("/api/v1/identities", json={"email": "a@example.com"}).json()
    client.put(
        f"/api/v1/identities/{created['id']}/traits",
        json={"traits": {"email": "b@example.com"}},
    )

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events[-1] == {
        "action": "identity.update",
        "resource_type": "identity",
        "resource_id": created["id"],
    }


def test_force_verify_records_audit_event(client: TestClient) -> None:
    from console_api.main import app

    created = client.post("/api/v1/identities", json={"email": "a@example.com"}).json()
    client.post(f"/api/v1/identities/{created['id']}/force-verify")

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events[-1] == {
        "action": "identity.verify",
        "resource_type": "identity",
        "resource_id": created["id"],
    }


def test_reset_password_records_audit_event(client: TestClient) -> None:
    from console_api.main import app

    created = client.post("/api/v1/identities", json={"email": "a@example.com"}).json()
    client.post(
        f"/api/v1/identities/{created['id']}/reset-password", json={"password": "NewPassw0rd!"}
    )

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events[-1] == {
        "action": "identity.password_reset",
        "resource_type": "identity",
        "resource_id": created["id"],
    }


def test_create_identity_records_audit_event(client: TestClient) -> None:
    from console_api.main import app

    response = client.post("/api/v1/identities", json={"email": "audited@example.com"})
    identity_id = response.json()["id"]

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events == [
        {"action": "identity.create", "resource_type": "identity", "resource_id": identity_id}
    ]


def test_revoke_session_records_audit_event(client: TestClient) -> None:
    from console_api.main import app

    client.delete("/api/v1/sessions/session-1")

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events == [
        {"action": "session.revoke", "resource_type": "session", "resource_id": "session-1"}
    ]


def test_create_client_records_audit_event(client: TestClient) -> None:
    from console_api.main import app

    response = client.post("/api/v1/clients", json={"client_name": "Demo"})
    client_id = response.json()["client_id"]

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events == [
        {"action": "client.create", "resource_type": "oauth2_client", "resource_id": client_id}
    ]


def test_create_client_with_jwks_uri_and_audience(client: TestClient) -> None:
    response = client.post(
        "/api/v1/clients",
        json={
            "client_name": "Demo",
            "jwks_uri": "https://example.com/.well-known/jwks.json",
            "audience": ["https://api.example.com"],
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["jwks_uri"] == "https://example.com/.well-known/jwks.json"
    assert body["audience"] == ["https://api.example.com"]


def test_create_client_without_jwks_uri_omits_it(client: TestClient) -> None:
    response = client.post("/api/v1/clients", json={"client_name": "Demo"})
    assert "jwks_uri" not in response.json()


def test_delete_client_records_audit_event(client: TestClient) -> None:
    from console_api.main import app

    created = client.post("/api/v1/clients", json={"client_name": "Demo"}).json()
    client.delete(f"/api/v1/clients/{created['client_id']}")

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events[-1] == {
        "action": "client.delete",
        "resource_type": "oauth2_client",
        "resource_id": created["client_id"],
    }


def test_create_relation_tuple_records_audit_event(client: TestClient) -> None:
    from console_api.main import app

    client.post(
        "/api/v1/relation-tuples",
        json={
            "namespace": "Organization",
            "object": "org-1",
            "relation": "member",
            "subject_id": "user-1",
        },
    )

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events == [
        {"action": "permission.grant", "resource_type": "Organization", "resource_id": "org-1"}
    ]


def test_set_identity_provider_enabled_records_audit_event(
    client: TestClient, identity_providers_path: Path
) -> None:
    from console_api.main import app

    client.post("/api/v1/identity-providers/github/enabled", json={"enabled": True})

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events == [
        {
            "action": "identity_provider.enable",
            "resource_type": "identity_provider",
            "resource_id": "github",
        }
    ]


def test_enable_disable_roundtrip(client: TestClient) -> None:
    created = client.post("/api/v1/identities", json={"email": "x@example.com"}).json()
    identity_id = created["id"]

    disabled = client.post(f"/api/v1/identities/{identity_id}/disable")
    assert disabled.status_code == 200
    assert disabled.json()["state"] == "inactive"

    enabled = client.post(f"/api/v1/identities/{identity_id}/enable")
    assert enabled.status_code == 200
    assert enabled.json()["state"] == "active"


def test_disable_unknown_identity_404s(client: TestClient) -> None:
    response = client.post("/api/v1/identities/does-not-exist/disable")
    assert response.status_code == 404


def test_delete_identity(client: TestClient, fake_kratos: FakeKratosAdminClient) -> None:
    created = client.post("/api/v1/identities", json={"email": "y@example.com"}).json()
    identity_id = created["id"]

    response = client.delete(f"/api/v1/identities/{identity_id}")
    assert response.status_code == 204
    assert identity_id not in fake_kratos.identities


def test_delete_unknown_identity_404s(client: TestClient) -> None:
    response = client.delete("/api/v1/identities/does-not-exist")
    assert response.status_code == 404


def test_revoke_session(client: TestClient, fake_kratos: FakeKratosAdminClient) -> None:
    response = client.delete("/api/v1/sessions/session-1")
    assert response.status_code == 204
    assert "session-1" not in fake_kratos.sessions


def test_revoke_unknown_session_404s(client: TestClient) -> None:
    response = client.delete("/api/v1/sessions/does-not-exist")
    assert response.status_code == 404


def test_revoke_all_sessions(client: TestClient, fake_kratos: FakeKratosAdminClient) -> None:
    created = client.post("/api/v1/identities", json={"email": "z@example.com"}).json()
    identity_id = created["id"]

    response = client.delete(f"/api/v1/identities/{identity_id}/sessions")
    assert response.status_code == 204
    assert fake_kratos.revoked_all_for == [identity_id]


def test_revoke_all_sessions_unknown_identity_404s(client: TestClient) -> None:
    response = client.delete("/api/v1/identities/does-not-exist/sessions")
    assert response.status_code == 404


def test_create_client(client: TestClient) -> None:
    response = client.post(
        "/api/v1/clients",
        json={"client_name": "Demo App", "redirect_uris": ["http://localhost:3200/callback"]},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["client_name"] == "Demo App"
    assert "client_secret" in body


def test_update_client(client: TestClient, fake_hydra: FakeHydraAdminClient) -> None:
    created = client.post("/api/v1/clients", json={"client_name": "Original"}).json()
    client_id = created["client_id"]

    response = client.put(
        f"/api/v1/clients/{client_id}",
        json={"client_name": "Renamed", "scope": "openid"},
    )
    assert response.status_code == 200
    assert response.json()["client_name"] == "Renamed"
    assert fake_hydra.clients[client_id]["client_name"] == "Renamed"


def test_update_unknown_client_404s(client: TestClient) -> None:
    response = client.put("/api/v1/clients/does-not-exist", json={"client_name": "X"})
    assert response.status_code == 404


def test_rotate_client_secret_returns_new_secret_once(
    client: TestClient, fake_hydra: FakeHydraAdminClient
) -> None:
    created = client.post("/api/v1/clients", json={"client_name": "Rotates"}).json()
    client_id = created["client_id"]
    old_secret = created["client_secret"]

    response = client.post(f"/api/v1/clients/{client_id}/rotate-secret")
    assert response.status_code == 200
    new_secret = response.json()["client_secret"]
    assert new_secret != old_secret
    assert fake_hydra.clients[client_id]["client_secret"] == new_secret


def test_rotate_secret_unknown_client_404s(client: TestClient) -> None:
    response = client.post("/api/v1/clients/does-not-exist/rotate-secret")
    assert response.status_code == 404


def test_delete_client(client: TestClient, fake_hydra: FakeHydraAdminClient) -> None:
    created = client.post("/api/v1/clients", json={"client_name": "ToDelete"}).json()
    client_id = created["client_id"]

    response = client.delete(f"/api/v1/clients/{client_id}")
    assert response.status_code == 204
    assert client_id not in fake_hydra.clients


def test_delete_unknown_client_404s(client: TestClient) -> None:
    response = client.delete("/api/v1/clients/does-not-exist")
    assert response.status_code == 404


def test_create_api_key_returns_secret_once(client: TestClient) -> None:
    response = client.post("/api/v1/api-keys", json={"name": "CI key", "scope": "read"})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "CI key"
    assert body["enabled"] is True
    assert "client_secret" in body


def test_list_api_keys_excludes_regular_clients(client: TestClient) -> None:
    client.post("/api/v1/clients", json={"client_name": "Regular app"})
    client.post("/api/v1/api-keys", json={"name": "CI key"})

    listed = client.get("/api/v1/api-keys").json()["api_keys"]
    assert len(listed) == 1
    assert listed[0]["name"] == "CI key"


def test_disable_api_key_clears_grant_types(
    client: TestClient, fake_hydra: FakeHydraAdminClient
) -> None:
    created = client.post("/api/v1/api-keys", json={"name": "CI key"}).json()

    response = client.post(f"/api/v1/api-keys/{created['client_id']}/disable")
    assert response.status_code == 200
    assert response.json()["enabled"] is False
    assert fake_hydra.clients[created["client_id"]]["grant_types"] == []


def test_enable_api_key_restores_grant_types(
    client: TestClient, fake_hydra: FakeHydraAdminClient
) -> None:
    created = client.post("/api/v1/api-keys", json={"name": "CI key"}).json()
    client.post(f"/api/v1/api-keys/{created['client_id']}/disable")

    response = client.post(f"/api/v1/api-keys/{created['client_id']}/enable")
    assert response.status_code == 200
    assert response.json()["enabled"] is True
    assert fake_hydra.clients[created["client_id"]]["grant_types"] == ["client_credentials"]


def test_disable_unknown_api_key_404s(client: TestClient) -> None:
    response = client.post("/api/v1/api-keys/does-not-exist/disable")
    assert response.status_code == 404


def test_delete_api_key(client: TestClient, fake_hydra: FakeHydraAdminClient) -> None:
    created = client.post("/api/v1/api-keys", json={"name": "CI key"}).json()

    response = client.delete(f"/api/v1/api-keys/{created['client_id']}")
    assert response.status_code == 204
    assert created["client_id"] not in fake_hydra.clients


def test_create_api_key_records_audit_event(client: TestClient) -> None:
    from console_api.main import app

    created = client.post("/api/v1/api-keys", json={"name": "CI key", "scope": "read"}).json()

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events[-1] == {
        "action": "api_key.create",
        "resource_type": "api_key",
        "resource_id": created["client_id"],
    }


def test_create_relation_tuple_with_subject_id(
    client: TestClient, fake_keto: FakeKetoAdminClient
) -> None:
    response = client.post(
        "/api/v1/relation-tuples",
        json={
            "namespace": "Organization",
            "object": "org-1",
            "relation": "member",
            "subject_id": "user-1",
        },
    )
    assert response.status_code == 201
    assert fake_keto.tuples == [
        {
            "namespace": "Organization",
            "object": "org-1",
            "relation": "member",
            "subject_id": "user-1",
            "subject_set": None,
        }
    ]


def test_create_relation_tuple_requires_subject(client: TestClient) -> None:
    response = client.post(
        "/api/v1/relation-tuples",
        json={"namespace": "Organization", "object": "org-1", "relation": "member"},
    )
    assert response.status_code == 422


def test_delete_relation_tuple(client: TestClient, fake_keto: FakeKetoAdminClient) -> None:
    client.post(
        "/api/v1/relation-tuples",
        json={
            "namespace": "Organization",
            "object": "org-1",
            "relation": "member",
            "subject_id": "user-1",
        },
    )
    response = client.request(
        "DELETE",
        "/api/v1/relation-tuples",
        params={
            "namespace": "Organization",
            "object": "org-1",
            "relation": "member",
            "subject_id": "user-1",
        },
    )
    assert response.status_code == 204
    assert fake_keto.tuples == []


def test_delete_relation_tuple_with_subject_set(
    client: TestClient, fake_keto: FakeKetoAdminClient
) -> None:
    client.post(
        "/api/v1/relation-tuples",
        json={
            "namespace": "Team",
            "object": "team-1",
            "relation": "parent",
            "subject_set": {"namespace": "Organization", "object": "org-1", "relation": ""},
        },
    )
    response = client.request(
        "DELETE",
        "/api/v1/relation-tuples",
        params={
            "namespace": "Team",
            "object": "team-1",
            "relation": "parent",
            "subject_set_namespace": "Organization",
            "subject_set_object": "org-1",
            "subject_set_relation": "",
        },
    )
    assert response.status_code == 204
    assert fake_keto.tuples == []


@pytest.fixture
def identity_providers_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "identity-providers.yaml"
    path.write_text(
        "providers:\n  - id: google\n    enabled: true\n  - id: github\n    enabled: false\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("IDENTITY_PROVIDERS_PATH", str(path))
    return path


def test_get_identity_providers(client: TestClient, identity_providers_path: Path) -> None:
    response = client.get("/api/v1/identity-providers")
    assert response.status_code == 200
    providers = response.json()["providers"]
    assert {p["id"]: p["enabled"] for p in providers} == {"google": True, "github": False}


def test_set_identity_provider_enabled(client: TestClient, identity_providers_path: Path) -> None:
    response = client.post("/api/v1/identity-providers/github/enabled", json={"enabled": True})
    assert response.status_code == 200
    assert response.json() == {"provider_id": "github", "enabled": True}

    providers = client.get("/api/v1/identity-providers").json()["providers"]
    github = next(p for p in providers if p["id"] == "github")
    assert github["enabled"] is True


def test_set_identity_provider_enabled_unknown_id_404s(
    client: TestClient, identity_providers_path: Path
) -> None:
    response = client.post(
        "/api/v1/identity-providers/does-not-exist/enabled", json={"enabled": True}
    )
    assert response.status_code == 404


THEME_YAML = """\
productName: NeoBIM Identity
companyName: NeoBIM
logo:
  src: /neobim-mark.svg
  alt: NeoBIM
favicon: /favicon.ico
colors:
  background: var(--background)
  foreground: var(--foreground)
  accent: var(--primary)
  accentForeground: var(--primary-foreground)
  border: var(--border)
typography:
  fontFamily: var(--font-sans)
footer:
  text: "© NeoBIM"
  links: []
"""


@pytest.fixture
def theme_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "neobim.yaml"
    path.write_text(THEME_YAML, encoding="utf-8")
    monkeypatch.setenv("THEME_CONFIG_PATH", str(path))
    return path


def test_get_theme(client: TestClient, theme_path: Path) -> None:
    response = client.get("/api/v1/theme")
    assert response.status_code == 200
    body = response.json()
    assert body["productName"] == "NeoBIM Identity"
    assert body["colors"]["accent"] == "var(--primary)"


def test_update_theme(client: TestClient, theme_path: Path) -> None:
    response = client.put(
        "/api/v1/theme",
        json={
            "productName": "Acme Identity",
            "companyName": "Acme",
            "logo": {"src": "/acme-mark.svg", "alt": "Acme"},
            "favicon": "/favicon.ico",
            "colors": {
                "background": "var(--background)",
                "foreground": "var(--foreground)",
                "accent": "#ff0000",
                "accentForeground": "var(--primary-foreground)",
                "border": "var(--border)",
            },
            "typography": {"fontFamily": "var(--font-sans)"},
            "footer": {"text": "© Acme", "links": []},
        },
    )
    assert response.status_code == 200
    assert response.json()["productName"] == "Acme Identity"

    reloaded = client.get("/api/v1/theme").json()
    assert reloaded["productName"] == "Acme Identity"
    assert reloaded["colors"]["accent"] == "#ff0000"


def test_update_theme_records_audit_event(client: TestClient, theme_path: Path) -> None:
    from console_api.main import app

    client.put(
        "/api/v1/theme",
        json={
            "productName": "Acme Identity",
            "companyName": "Acme",
            "logo": {"src": "/acme-mark.svg", "alt": "Acme"},
            "favicon": "/favicon.ico",
            "colors": {
                "background": "var(--background)",
                "foreground": "var(--foreground)",
                "accent": "var(--primary)",
                "accentForeground": "var(--primary-foreground)",
                "border": "var(--border)",
            },
            "typography": {"fontFamily": "var(--font-sans)"},
            "footer": {"text": "© Acme", "links": []},
        },
    )

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events == [
        {"action": "theme.update", "resource_type": "theme", "resource_id": "neobim"}
    ]


def _acme_theme_body() -> dict[str, Any]:
    return {
        "productName": "Acme Identity",
        "companyName": "Acme",
        "logo": {"src": "/acme-mark.svg", "alt": "Acme"},
        "favicon": "/favicon.ico",
        "colors": {
            "background": "var(--background)",
            "foreground": "var(--foreground)",
            "accent": "#ff0000",
            "accentForeground": "var(--primary-foreground)",
            "border": "var(--border)",
        },
        "typography": {"fontFamily": "var(--font-sans)"},
        "footer": {"text": "© Acme", "links": []},
    }


def test_update_theme_creates_a_history_version(client: TestClient, theme_path: Path) -> None:
    client.put("/api/v1/theme", json=_acme_theme_body())
    history = client.get("/api/v1/theme/history").json()["versions"]
    assert len(history) == 1


def test_get_theme_history_version(client: TestClient, theme_path: Path) -> None:
    client.put("/api/v1/theme", json=_acme_theme_body())
    version_id = client.get("/api/v1/theme/history").json()["versions"][0]["id"]

    response = client.get(f"/api/v1/theme/history/{version_id}")
    assert response.status_code == 200
    assert response.json()["productName"] == "NeoBIM Identity"


def test_get_unknown_theme_history_version_404s(client: TestClient, theme_path: Path) -> None:
    response = client.get("/api/v1/theme/history/does-not-exist")
    assert response.status_code == 404


def test_rollback_theme_restores_previous_version(client: TestClient, theme_path: Path) -> None:
    client.put("/api/v1/theme", json=_acme_theme_body())
    version_id = client.get("/api/v1/theme/history").json()["versions"][0]["id"]

    response = client.post(f"/api/v1/theme/history/{version_id}/rollback")
    assert response.status_code == 200
    assert response.json()["productName"] == "NeoBIM Identity"

    reloaded = client.get("/api/v1/theme").json()
    assert reloaded["productName"] == "NeoBIM Identity"


def test_rollback_unknown_theme_version_404s(client: TestClient, theme_path: Path) -> None:
    response = client.post("/api/v1/theme/history/does-not-exist/rollback")
    assert response.status_code == 404


def test_rollback_theme_records_audit_event(client: TestClient, theme_path: Path) -> None:
    from console_api.main import app

    client.put("/api/v1/theme", json=_acme_theme_body())
    version_id = client.get("/api/v1/theme/history").json()["versions"][0]["id"]
    client.post(f"/api/v1/theme/history/{version_id}/rollback")

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events[-1] == {
        "action": "theme.rollback",
        "resource_type": "theme",
        "resource_id": "neobim",
    }


def test_test_token_success(client: TestClient) -> None:
    response = client.post(
        "/api/v1/developer/test-token",
        json={"client_id": "test-client", "client_secret": "correct-secret", "scope": "openid"},
    )
    assert response.status_code == 200
    assert response.json()["access_token"] == "fake-token"


def test_test_token_wrong_secret_passes_through_hydras_error(client: TestClient) -> None:
    response = client.post(
        "/api/v1/developer/test-token",
        json={"client_id": "test-client", "client_secret": "wrong", "scope": "openid"},
    )
    assert response.status_code == 401
    assert response.json()["error"] == "invalid_client"


def test_exchange_code_success(client: TestClient) -> None:
    response = client.post(
        "/api/v1/developer/exchange-code",
        json={
            "client_id": "test-client",
            "code": "valid-code",
            "redirect_uri": "http://localhost/callback",
            "code_verifier": "verifier",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"] == "fake-access-token"
    assert body["refresh_token"] == "fake-refresh-token"


def test_exchange_code_invalid_code_passes_through_hydras_error(client: TestClient) -> None:
    response = client.post(
        "/api/v1/developer/exchange-code",
        json={
            "client_id": "test-client",
            "code": "bad-code",
            "redirect_uri": "http://localhost/callback",
            "code_verifier": "verifier",
        },
    )
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_grant"


def test_refresh_token_success(client: TestClient) -> None:
    response = client.post(
        "/api/v1/developer/refresh-token",
        json={"client_id": "test-client", "refresh_token": "fake-refresh-token"},
    )
    assert response.status_code == 200
    assert response.json()["access_token"] == "refreshed-access-token"


def test_refresh_token_invalid_passes_through_hydras_error(client: TestClient) -> None:
    response = client.post(
        "/api/v1/developer/refresh-token",
        json={"client_id": "test-client", "refresh_token": "expired"},
    )
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_grant"
