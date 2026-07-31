from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from audit_service.models import AuditEvent
from audit_service.repository import AuditEventRepository


class FakeAuditEventRepository(AuditEventRepository):
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.events: list[AuditEvent] = []

    async def create(
        self,
        actor_id: str | None,
        action: str,
        resource_type: str,
        resource_id: str | None,
        metadata: dict[str, object],
    ) -> AuditEvent:
        if self.fail:
            raise SQLAlchemyError("boom")
        event = AuditEvent(
            id=uuid.uuid4(),
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            metadata_json=metadata,
            created_at=datetime.now(UTC),
        )
        self.events.append(event)
        return event

    async def list_all(
        self,
        resource_type: str | None = None,
        resource_id: str | None = None,
        action: str | None = None,
        limit: int = 200,
    ) -> list[AuditEvent]:
        if self.fail:
            raise SQLAlchemyError("boom")
        events = self.events
        if resource_type:
            events = [e for e in events if e.resource_type == resource_type]
        if resource_id:
            events = [e for e in events if e.resource_id == resource_id]
        if action:
            events = [e for e in events if e.action == action]
        return list(reversed(events))[:limit]


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OTEL_ENABLED", "false")


@pytest.fixture
def client() -> Iterator[TestClient]:
    from audit_service.main import app, get_repository

    fake = FakeAuditEventRepository()

    async def override() -> FakeAuditEventRepository:
        return fake

    app.dependency_overrides[get_repository] = override
    with TestClient(app) as test_client:
        test_client.fake_repository = fake  # type: ignore[attr-defined]
        yield test_client
    app.dependency_overrides.clear()


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "audit-service"}


def test_create_event(client: TestClient) -> None:
    response = client.post(
        "/api/v1/events",
        json={
            "actor_id": "admin-1",
            "action": "identity.disable",
            "resource_type": "identity",
            "resource_id": "user-1",
            "metadata": {"reason": "test"},
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["action"] == "identity.disable"
    assert body["resource_id"] == "user-1"
    assert "id" in body and "created_at" in body


def test_list_events_returns_newest_first(client: TestClient) -> None:
    client.post(
        "/api/v1/events",
        json={"action": "identity.create", "resource_type": "identity", "resource_id": "a"},
    )
    client.post(
        "/api/v1/events",
        json={"action": "identity.disable", "resource_type": "identity", "resource_id": "b"},
    )

    response = client.get("/api/v1/events")
    assert response.status_code == 200
    actions = [e["action"] for e in response.json()]
    assert actions == ["identity.disable", "identity.create"]


def test_list_events_filters_by_resource_type(client: TestClient) -> None:
    client.post(
        "/api/v1/events",
        json={"action": "identity.create", "resource_type": "identity", "resource_id": "a"},
    )
    client.post(
        "/api/v1/events",
        json={"action": "session.revoke", "resource_type": "session", "resource_id": "b"},
    )

    response = client.get("/api/v1/events", params={"resource_type": "session"})
    assert response.status_code == 200
    events = response.json()
    assert len(events) == 1
    assert events[0]["resource_type"] == "session"


def test_list_events_filters_by_resource_id(client: TestClient) -> None:
    client.post(
        "/api/v1/events",
        json={"action": "client.update", "resource_type": "oauth2_client", "resource_id": "a"},
    )
    client.post(
        "/api/v1/events",
        json={"action": "client.update", "resource_type": "oauth2_client", "resource_id": "b"},
    )

    response = client.get("/api/v1/events", params={"resource_id": "a"})
    assert response.status_code == 200
    events = response.json()
    assert len(events) == 1
    assert events[0]["resource_id"] == "a"


def test_list_events_filters_by_action(client: TestClient) -> None:
    client.post(
        "/api/v1/events",
        json={"action": "identity.create", "resource_type": "identity", "resource_id": "a"},
    )
    client.post(
        "/api/v1/events",
        json={"action": "identity.disable", "resource_type": "identity", "resource_id": "a"},
    )

    response = client.get("/api/v1/events", params={"action": "identity.disable"})
    assert response.status_code == 200
    events = response.json()
    assert len(events) == 1
    assert events[0]["action"] == "identity.disable"


def test_create_event_db_failure_returns_500(client: TestClient) -> None:
    client.fake_repository.fail = True  # type: ignore[attr-defined]
    response = client.post(
        "/api/v1/events",
        json={"action": "identity.create", "resource_type": "identity"},
    )
    assert response.status_code == 500


def test_list_events_db_failure_returns_500(client: TestClient) -> None:
    client.fake_repository.fail = True  # type: ignore[attr-defined]
    response = client.get("/api/v1/events")
    assert response.status_code == 500
