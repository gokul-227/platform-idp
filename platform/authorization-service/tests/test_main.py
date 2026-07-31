from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from authorization_service.audit_client import AuditClient
from authorization_service.keto_client import KetoAdminClient, KetoReadClient, RelationTuple


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


class FakeKetoReadClient(KetoReadClient):
    def __init__(self) -> None:
        self.tuples: list[RelationTuple] = []

    async def list_relation_tuples(
        self,
        namespace: str,
        relation: str | None = None,
        object_id: str | None = None,
    ) -> list[RelationTuple]:
        return [
            t
            for t in self.tuples
            if t.namespace == namespace
            and (relation is None or t.relation == relation)
            and (object_id is None or t.object == object_id)
        ]

    async def check(self, namespace: str, object_id: str, relation: str, subject_id: str) -> bool:
        return any(
            t.namespace == namespace
            and t.object == object_id
            and t.relation == relation
            and t.subject_id == subject_id
            for t in self.tuples
        )

    async def aclose(self) -> None:
        pass


class FakeKetoAdminClient(KetoAdminClient):
    def __init__(self, read: FakeKetoReadClient) -> None:
        self._read = read

    async def create_relationship(
        self, namespace: str, object_id: str, relation: str, subject_id: str
    ) -> None:
        self._read.tuples.append(
            RelationTuple(
                namespace=namespace, object=object_id, relation=relation, subject_id=subject_id
            )
        )

    async def delete_relationship(
        self, namespace: str, object_id: str, relation: str, subject_id: str
    ) -> None:
        self._read.tuples = [
            t
            for t in self._read.tuples
            if not (
                t.namespace == namespace
                and t.object == object_id
                and t.relation == relation
                and t.subject_id == subject_id
            )
        ]

    async def aclose(self) -> None:
        pass


@pytest.fixture(autouse=True)
def _env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ROLES_CONFIG_PATH", str(tmp_path / "roles"))


@pytest.fixture
def client() -> Iterator[TestClient]:
    from authorization_service.main import app

    with TestClient(app) as test_client:
        app.state.audit = FakeAuditClient()
        fake_read = FakeKetoReadClient()
        app.state.keto_read = fake_read
        app.state.keto_admin = FakeKetoAdminClient(fake_read)
        yield test_client


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "authorization-service"}


def test_roles_seeded_on_startup(client: TestClient) -> None:
    response = client.get("/api/v1/roles")
    assert response.status_code == 200
    ids = {r["id"] for r in response.json()["roles"]}
    assert "org-admin" in ids
    assert "resource-viewer" in ids


def test_get_role_namespaces(client: TestClient) -> None:
    response = client.get("/api/v1/roles/namespaces")
    assert response.status_code == 200
    assert "admin" in response.json()["Organization"]


def test_create_role(client: TestClient) -> None:
    response = client.post(
        "/api/v1/roles",
        json={"id": "custom-role", "name": "Custom", "namespace": "Team", "relation": "member"},
    )
    assert response.status_code == 201
    ids = {r["id"] for r in client.get("/api/v1/roles").json()["roles"]}
    assert "custom-role" in ids


def test_create_role_invalid_target_422s(client: TestClient) -> None:
    response = client.post(
        "/api/v1/roles",
        json={"id": "bad", "name": "Bad", "namespace": "Team", "relation": "does-not-exist"},
    )
    assert response.status_code == 422


def test_create_role_duplicate_id_409s(client: TestClient) -> None:
    client.post(
        "/api/v1/roles", json={"id": "a", "name": "A", "namespace": "Team", "relation": "member"}
    )
    response = client.post(
        "/api/v1/roles", json={"id": "a", "name": "A2", "namespace": "Team", "relation": "member"}
    )
    assert response.status_code == 409


def test_update_role(client: TestClient) -> None:
    client.post(
        "/api/v1/roles", json={"id": "a", "name": "A", "namespace": "Team", "relation": "member"}
    )
    response = client.put(
        "/api/v1/roles/a",
        json={"id": "a", "name": "Renamed", "namespace": "Team", "relation": "member"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"


def test_update_unknown_role_404s(client: TestClient) -> None:
    response = client.put(
        "/api/v1/roles/does-not-exist",
        json={"id": "does-not-exist", "name": "X", "namespace": "Team", "relation": "member"},
    )
    assert response.status_code == 404


def test_delete_role(client: TestClient) -> None:
    client.post(
        "/api/v1/roles", json={"id": "a", "name": "A", "namespace": "Team", "relation": "member"}
    )
    response = client.delete("/api/v1/roles/a")
    assert response.status_code == 204
    ids = {r["id"] for r in client.get("/api/v1/roles").json()["roles"]}
    assert "a" not in ids


def test_delete_unknown_role_404s(client: TestClient) -> None:
    response = client.delete("/api/v1/roles/does-not-exist")
    assert response.status_code == 404


def test_create_role_records_audit_event(client: TestClient) -> None:
    from authorization_service.main import app

    client.post(
        "/api/v1/roles", json={"id": "a", "name": "A", "namespace": "Team", "relation": "member"}
    )
    fake_audit: FakeAuditClient = app.state.audit
    assert {
        "action": "role.create",
        "resource_type": "role",
        "resource_id": "a",
    } in fake_audit.events


def test_create_and_list_policy_writes_real_keto_tuple(client: TestClient) -> None:
    response = client.post(
        "/api/v1/policies",
        json={"role_id": "org-admin", "object_id": "acme", "subject_id": "user-1"},
    )
    assert response.status_code == 201
    policy_id = response.json()["id"]

    listed = client.get("/api/v1/policies?role_id=org-admin").json()["policies"]
    assert len(listed) == 1
    assert listed[0]["id"] == policy_id
    assert listed[0]["object"] == "acme"
    assert listed[0]["subject_id"] == "user-1"


def test_create_policy_unknown_role_404s(client: TestClient) -> None:
    response = client.post(
        "/api/v1/policies",
        json={"role_id": "does-not-exist", "object_id": "acme", "subject_id": "user-1"},
    )
    assert response.status_code == 404


def test_delete_policy_removes_real_keto_tuple(client: TestClient) -> None:
    created = client.post(
        "/api/v1/policies",
        json={"role_id": "org-admin", "object_id": "acme", "subject_id": "user-1"},
    ).json()

    response = client.delete(f"/api/v1/policies/{created['id']}")
    assert response.status_code == 204
    assert client.get("/api/v1/policies?role_id=org-admin").json()["policies"] == []


def test_delete_unknown_policy_404s(client: TestClient) -> None:
    response = client.delete("/api/v1/policies/not-a-real-encoded-id!!")
    assert response.status_code == 404


def test_update_policy_moves_subject(client: TestClient) -> None:
    created = client.post(
        "/api/v1/policies",
        json={"role_id": "org-admin", "object_id": "acme", "subject_id": "user-1"},
    ).json()

    response = client.put(
        f"/api/v1/policies/{created['id']}",
        json={"object_id": "acme", "subject_id": "user-2"},
    )
    assert response.status_code == 200
    listed = client.get("/api/v1/policies?role_id=org-admin").json()["policies"]
    assert len(listed) == 1
    assert listed[0]["subject_id"] == "user-2"


def test_authorize_allowed_returns_200(client: TestClient) -> None:
    from authorization_service.main import app

    fake_read: FakeKetoReadClient = app.state.keto_read
    fake_read.tuples.append(
        RelationTuple(
            namespace="Organization", object="platform", relation="admin", subject_id="user-1"
        )
    )
    response = client.post(
        "/api/v1/authorize",
        json={"subject_id": "user-1", "organization_id": "platform", "relation": "admin"},
    )
    assert response.status_code == 200
    assert response.json() == {"allowed": True}


def test_authorize_denied_returns_403(client: TestClient) -> None:
    response = client.post(
        "/api/v1/authorize",
        json={"subject_id": "user-2", "organization_id": "platform", "relation": "admin"},
    )
    assert response.status_code == 403
    assert response.json() == {"allowed": False}


def test_create_policy_records_audit_event(client: TestClient) -> None:
    from authorization_service.main import app

    client.post(
        "/api/v1/policies",
        json={"role_id": "org-admin", "object_id": "acme", "subject_id": "user-1"},
    )
    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events[-1] == {
        "action": "policy.create",
        "resource_type": "Organization",
        "resource_id": "acme",
    }


def test_authorize_group_allowed(client: TestClient) -> None:
    from authorization_service.main import app

    fake_read: FakeKetoReadClient = app.state.keto_read
    fake_read.tuples.append(RelationTuple("Group", "acme-mep", "owners", subject_id="weber"))
    response = client.post(
        "/api/v1/groups/acme-mep/authorize", json={"subject_id": "weber", "permit": "admin"}
    )
    assert response.status_code == 200
    assert response.json() == {"allowed": True}


def test_authorize_group_denied(client: TestClient) -> None:
    response = client.post(
        "/api/v1/groups/acme-mep/authorize", json={"subject_id": "nobody", "permit": "read"}
    )
    assert response.status_code == 403
    assert response.json() == {"allowed": False}


def test_authorize_group_invalid_permit_422s(client: TestClient) -> None:
    response = client.post(
        "/api/v1/groups/acme-mep/authorize", json={"subject_id": "weber", "permit": "delete"}
    )
    assert response.status_code == 422


def test_owner_can_grant_manager(client: TestClient) -> None:
    from authorization_service.main import app

    fake_read: FakeKetoReadClient = app.state.keto_read
    fake_read.tuples.append(RelationTuple("Group", "acme-mep", "owners", subject_id="marius"))

    response = client.post(
        "/api/v1/groups/acme-mep/grants",
        json={"granter_subject_id": "marius", "target_subject_id": "weber", "relation": "managers"},
    )
    assert response.status_code == 201

    check = client.post(
        "/api/v1/groups/acme-mep/authorize", json={"subject_id": "weber", "permit": "manage"}
    )
    assert check.json() == {"allowed": True}

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events[-1]["action"] == "group.grant"


def test_manager_cannot_grant_manager_403s(client: TestClient) -> None:
    from authorization_service.main import app

    fake_read: FakeKetoReadClient = app.state.keto_read
    fake_read.tuples.append(RelationTuple("Group", "acme-mep", "managers", subject_id="weber"))

    response = client.post(
        "/api/v1/groups/acme-mep/grants",
        json={
            "granter_subject_id": "weber",
            "target_subject_id": "fischer",
            "relation": "managers",
        },
    )
    assert response.status_code == 403


def test_manager_can_grant_editor(client: TestClient) -> None:
    from authorization_service.main import app

    fake_read: FakeKetoReadClient = app.state.keto_read
    fake_read.tuples.append(RelationTuple("Group", "acme-mep", "managers", subject_id="weber"))

    response = client.post(
        "/api/v1/groups/acme-mep/grants",
        json={"granter_subject_id": "weber", "target_subject_id": "fischer", "relation": "editors"},
    )
    assert response.status_code == 201


def test_revoke_runs_the_same_escalation_guard(client: TestClient) -> None:
    from authorization_service.main import app

    fake_read: FakeKetoReadClient = app.state.keto_read
    fake_read.tuples.append(RelationTuple("Group", "acme-mep", "managers", subject_id="weber"))
    fake_read.tuples.append(RelationTuple("Group", "acme-mep", "managers", subject_id="other-lead"))

    response = client.request(
        "DELETE",
        "/api/v1/groups/acme-mep/grants",
        json={
            "granter_subject_id": "weber",
            "target_subject_id": "other-lead",
            "relation": "managers",
        },
    )
    assert response.status_code == 403
