from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from tenant_service.models import Invitation, Tenant
from tenant_service.repository import (
    InvitationAlreadyResolvedError,
    InvitationExpiredError,
    InvitationNotFoundError,
    InvitationRepository,
    TenantRepository,
)


class FakeTenantRepository(TenantRepository):
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.tenants: list[Tenant] = []

    async def create(self, name: str, domain: str | None) -> Tenant:
        if self.fail:
            raise SQLAlchemyError("boom")
        tenant = Tenant(
            id=uuid.uuid4(), name=name, domain=domain, status="active", created_at=datetime.now(UTC)
        )
        self.tenants.append(tenant)
        return tenant

    async def list_all(self) -> list[Tenant]:
        if self.fail:
            raise SQLAlchemyError("boom")
        return list(self.tenants)

    async def get_by_id(self, tenant_id: uuid.UUID) -> Tenant | None:
        if self.fail:
            raise SQLAlchemyError("boom")
        return next((t for t in self.tenants if t.id == tenant_id), None)

    async def update(
        self, tenant_id: uuid.UUID, name: str | None, domain: str | None, status: str | None
    ) -> Tenant | None:
        if self.fail:
            raise SQLAlchemyError("boom")
        tenant = next((t for t in self.tenants if t.id == tenant_id), None)
        if tenant is None:
            return None
        if name is not None:
            tenant.name = name
        if domain is not None:
            tenant.domain = domain
        if status is not None:
            tenant.status = status
        return tenant

    async def delete(self, tenant_id: uuid.UUID) -> bool:
        if self.fail:
            raise SQLAlchemyError("boom")
        tenant = next((t for t in self.tenants if t.id == tenant_id), None)
        if tenant is None:
            return False
        self.tenants.remove(tenant)
        return True


class FakeInvitationRepository(InvitationRepository):
    def __init__(self) -> None:
        self.invitations: list[Invitation] = []
        self._next = 1

    async def create(
        self, tenant_id: uuid.UUID, email: str, role: str, expires_in_hours: int
    ) -> Invitation:
        from datetime import timedelta

        invitation = Invitation(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            email=email,
            role=role,
            token=f"token-{self._next}",
            status="pending",
            created_at=datetime.now(UTC),
            expires_at=datetime.now(UTC) + timedelta(hours=expires_in_hours),
            accepted_at=None,
        )
        self._next += 1
        self.invitations.append(invitation)
        return invitation

    async def list_for_tenant(self, tenant_id: uuid.UUID) -> list[Invitation]:
        return [i for i in self.invitations if i.tenant_id == tenant_id]

    async def get_by_id(self, invitation_id: uuid.UUID) -> Invitation | None:
        return next((i for i in self.invitations if i.id == invitation_id), None)

    async def get_by_token(self, token: str) -> Invitation | None:
        return next((i for i in self.invitations if i.token == token), None)

    async def revoke(self, invitation_id: uuid.UUID) -> Invitation:
        invitation = await self.get_by_id(invitation_id)
        if invitation is None:
            raise InvitationNotFoundError(invitation_id)
        invitation.status = "revoked"
        return invitation

    async def accept(self, token: str) -> Invitation:
        invitation = await self.get_by_token(token)
        if invitation is None:
            raise InvitationNotFoundError(token)
        if invitation.status != "pending":
            raise InvitationAlreadyResolvedError
        if invitation.expires_at < datetime.now(UTC):
            invitation.status = "expired"
            raise InvitationExpiredError
        invitation.status = "accepted"
        invitation.accepted_at = datetime.now(UTC)
        return invitation


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OTEL_ENABLED", "false")


@pytest.fixture
def client() -> Iterator[TestClient]:
    from tenant_service.main import app, get_invitation_repository, get_repository

    fake = FakeTenantRepository()
    fake_invitations = FakeInvitationRepository()

    async def override() -> FakeTenantRepository:
        return fake

    async def override_invitations() -> FakeInvitationRepository:
        return fake_invitations

    app.dependency_overrides[get_repository] = override
    app.dependency_overrides[get_invitation_repository] = override_invitations
    with TestClient(app) as test_client:
        test_client.fake_repository = fake  # type: ignore[attr-defined]
        test_client.fake_invitations = fake_invitations  # type: ignore[attr-defined]
        yield test_client
    app.dependency_overrides.clear()


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "tenant-service"}


def test_create_tenant_requires_name(client: TestClient) -> None:
    response = client.post("/tenants", json={"domain": "example.com"})
    assert response.status_code == 400
    assert response.json() == {"error": "Tenant name is required"}


def test_create_tenant_returns_created_record(client: TestClient) -> None:
    response = client.post("/tenants", json={"name": "Acme Corp", "domain": "acme.example.com"})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Acme Corp"
    assert body["domain"] == "acme.example.com"
    assert body["status"] == "active"
    assert "id" in body and "created_at" in body


def test_list_tenants_returns_created_records(client: TestClient) -> None:
    client.post("/tenants", json={"name": "Acme Corp"})
    client.post("/tenants", json={"name": "Globex Corp"})

    response = client.get("/tenants")
    assert response.status_code == 200
    names = {t["name"] for t in response.json()}
    assert names == {"Acme Corp", "Globex Corp"}


def test_create_tenant_db_failure_returns_500(client: TestClient) -> None:
    client.fake_repository.fail = True  # type: ignore[attr-defined]
    response = client.post("/tenants", json={"name": "Acme Corp"})
    assert response.status_code == 500
    assert response.json() == {"error": "Database transaction failed"}


def test_list_tenants_db_failure_returns_500(client: TestClient) -> None:
    client.fake_repository.fail = True  # type: ignore[attr-defined]
    response = client.get("/tenants")
    assert response.status_code == 500
    assert response.json() == {"error": "Database read failed"}


def test_get_tenant_returns_created_record(client: TestClient) -> None:
    created = client.post("/tenants", json={"name": "Acme Corp"}).json()

    response = client.get(f"/tenants/{created['id']}")
    assert response.status_code == 200
    assert response.json()["name"] == "Acme Corp"


def test_get_tenant_unknown_id_404s(client: TestClient) -> None:
    response = client.get(f"/tenants/{uuid.uuid4()}")
    assert response.status_code == 404


def test_get_tenant_invalid_id_422s(client: TestClient) -> None:
    response = client.get("/tenants/not-a-uuid")
    assert response.status_code == 422


def test_update_tenant_changes_fields(client: TestClient) -> None:
    created = client.post("/tenants", json={"name": "Acme Corp"}).json()

    response = client.patch(f"/tenants/{created['id']}", json={"name": "Acme Renamed"})
    assert response.status_code == 200
    assert response.json()["name"] == "Acme Renamed"


def test_update_tenant_unknown_id_404s(client: TestClient) -> None:
    response = client.patch(f"/tenants/{uuid.uuid4()}", json={"name": "X"})
    assert response.status_code == 404


def test_update_tenant_invalid_id_422s(client: TestClient) -> None:
    response = client.patch("/tenants/not-a-uuid", json={"name": "X"})
    assert response.status_code == 422


def test_delete_tenant_removes_it(client: TestClient) -> None:
    created = client.post("/tenants", json={"name": "Acme Corp"}).json()

    response = client.delete(f"/tenants/{created['id']}")
    assert response.status_code == 204

    assert client.get(f"/tenants/{created['id']}").status_code == 404


def test_delete_tenant_unknown_id_404s(client: TestClient) -> None:
    response = client.delete(f"/tenants/{uuid.uuid4()}")
    assert response.status_code == 404


def test_create_invitation(client: TestClient) -> None:
    tenant = client.post("/tenants", json={"name": "Acme Corp"}).json()
    response = client.post(
        f"/tenants/{tenant['id']}/invitations",
        json={"email": "invitee@example.com", "role": "member"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["email"] == "invitee@example.com"
    assert "token" in body


def test_create_invitation_unknown_tenant_404s(client: TestClient) -> None:
    response = client.post(
        f"/tenants/{uuid.uuid4()}/invitations",
        json={"email": "invitee@example.com", "role": "member"},
    )
    assert response.status_code == 404


def test_list_invitations(client: TestClient) -> None:
    tenant = client.post("/tenants", json={"name": "Acme Corp"}).json()
    client.post(
        f"/tenants/{tenant['id']}/invitations",
        json={"email": "invitee@example.com", "role": "member"},
    )
    response = client.get(f"/tenants/{tenant['id']}/invitations")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_revoke_invitation(client: TestClient) -> None:
    tenant = client.post("/tenants", json={"name": "Acme Corp"}).json()
    invitation = client.post(
        f"/tenants/{tenant['id']}/invitations",
        json={"email": "invitee@example.com", "role": "member"},
    ).json()

    response = client.delete(f"/tenants/{tenant['id']}/invitations/{invitation['id']}")
    assert response.status_code == 204

    listed = client.get(f"/tenants/{tenant['id']}/invitations").json()
    assert listed[0]["status"] == "revoked"


def test_revoke_unknown_invitation_404s(client: TestClient) -> None:
    response = client.delete(f"/tenants/{uuid.uuid4()}/invitations/{uuid.uuid4()}")
    assert response.status_code == 404


def test_accept_invitation(client: TestClient) -> None:
    tenant = client.post("/tenants", json={"name": "Acme Corp"}).json()
    invitation = client.post(
        f"/tenants/{tenant['id']}/invitations",
        json={"email": "invitee@example.com", "role": "member"},
    ).json()

    response = client.post(f"/invitations/{invitation['token']}/accept")
    assert response.status_code == 200
    body = response.json()
    assert body["tenant_id"] == tenant["id"]
    assert body["role"] == "member"


def test_accept_unknown_invitation_404s(client: TestClient) -> None:
    response = client.post("/invitations/not-a-real-token/accept")
    assert response.status_code == 404


def test_accept_already_accepted_invitation_409s(client: TestClient) -> None:
    tenant = client.post("/tenants", json={"name": "Acme Corp"}).json()
    invitation = client.post(
        f"/tenants/{tenant['id']}/invitations",
        json={"email": "invitee@example.com", "role": "member"},
    ).json()
    client.post(f"/invitations/{invitation['token']}/accept")

    response = client.post(f"/invitations/{invitation['token']}/accept")
    assert response.status_code == 409


def test_accept_revoked_invitation_409s(client: TestClient) -> None:
    tenant = client.post("/tenants", json={"name": "Acme Corp"}).json()
    invitation = client.post(
        f"/tenants/{tenant['id']}/invitations",
        json={"email": "invitee@example.com", "role": "member"},
    ).json()
    client.delete(f"/tenants/{tenant['id']}/invitations/{invitation['id']}")

    response = client.post(f"/invitations/{invitation['token']}/accept")
    assert response.status_code == 409
