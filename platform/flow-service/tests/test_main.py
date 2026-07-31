from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
import yaml
from fastapi.testclient import TestClient

from flow_service.audit_client import AuditClient


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


@pytest.fixture(autouse=True)
def _env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FLOWS_CONFIG_PATH", str(tmp_path / "flows"))
    rendered = tmp_path / "kratos.yaml"
    rendered.write_text(
        "selfservice:\n  methods:\n    password:\n      enabled: true\n", encoding="utf-8"
    )
    monkeypatch.setenv("RENDERED_KRATOS_CONFIG_PATH", str(rendered))


@pytest.fixture
def client() -> Iterator[TestClient]:
    from flow_service.main import app

    with TestClient(app) as test_client:
        app.state.audit = FakeAuditClient()
        yield test_client


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "flow-service"}


def test_create_flow(client: TestClient) -> None:
    response = client.post(
        "/api/v1/flows",
        json={
            "id": "standard-login",
            "name": "Standard Login",
            "type": "login",
            "steps": ["password"],
        },
    )
    assert response.status_code == 201
    assert response.json()["enabled"] is True


def test_create_flow_rejects_unknown_method(client: TestClient) -> None:
    response = client.post(
        "/api/v1/flows",
        json={"id": "a", "name": "A", "type": "login", "steps": ["not-a-real-method"]},
    )
    assert response.status_code == 422


def test_create_flow_duplicate_id_409s(client: TestClient) -> None:
    client.post("/api/v1/flows", json={"id": "a", "name": "A", "type": "login"})
    response = client.post("/api/v1/flows", json={"id": "a", "name": "A2", "type": "login"})
    assert response.status_code == 409


def test_get_one_flow(client: TestClient) -> None:
    client.post("/api/v1/flows", json={"id": "a", "name": "A", "type": "login"})
    response = client.get("/api/v1/flows/a")
    assert response.status_code == 200
    assert response.json()["name"] == "A"


def test_get_one_flow_unknown_404s(client: TestClient) -> None:
    response = client.get("/api/v1/flows/does-not-exist")
    assert response.status_code == 404


def test_update_flow(client: TestClient) -> None:
    client.post("/api/v1/flows", json={"id": "a", "name": "A", "type": "login"})
    response = client.put("/api/v1/flows/a", json={"id": "a", "name": "Renamed", "type": "login"})
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"


def test_enable_disable_roundtrip(client: TestClient) -> None:
    client.post("/api/v1/flows", json={"id": "a", "name": "A", "type": "login"})

    disabled = client.post("/api/v1/flows/a/disable")
    assert disabled.json()["enabled"] is False

    enabled = client.post("/api/v1/flows/a/enable")
    assert enabled.json()["enabled"] is True


def test_delete_flow(client: TestClient) -> None:
    client.post("/api/v1/flows", json={"id": "a", "name": "A", "type": "login"})
    response = client.delete("/api/v1/flows/a")
    assert response.status_code == 204
    assert client.get("/api/v1/flows").json()["flows"] == []


def test_publish_flow_applies_to_rendered_config(client: TestClient, tmp_path: Path) -> None:
    client.post(
        "/api/v1/flows",
        json={"id": "a", "name": "A", "type": "login", "steps": ["totp"]},
    )
    response = client.post("/api/v1/flows/a/publish")
    assert response.status_code == 200
    assert response.json()["enabled_methods"] == ["totp"]

    rendered_path = Path(__import__("os").environ["RENDERED_KRATOS_CONFIG_PATH"])
    document = yaml.safe_load(rendered_path.read_text(encoding="utf-8"))
    assert document["selfservice"]["methods"]["totp"]["enabled"] is True
    # Enable-only: password, already true, is untouched, not disabled.
    assert document["selfservice"]["methods"]["password"]["enabled"] is True


def test_publish_unknown_flow_404s(client: TestClient) -> None:
    response = client.post("/api/v1/flows/does-not-exist/publish")
    assert response.status_code == 404


def test_create_flow_records_audit_event(client: TestClient) -> None:
    from flow_service.main import app

    client.post("/api/v1/flows", json={"id": "a", "name": "A", "type": "login"})

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events == [
        {"action": "flow.create", "resource_type": "flow", "resource_id": "a"}
    ]


def test_publish_flow_records_audit_event(client: TestClient) -> None:
    from flow_service.main import app

    client.post("/api/v1/flows", json={"id": "a", "name": "A", "type": "login"})
    client.post("/api/v1/flows/a/publish")

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events[-1] == {
        "action": "flow.publish",
        "resource_type": "flow",
        "resource_id": "a",
    }


def test_flow_history_empty_for_new_flow(client: TestClient) -> None:
    client.post("/api/v1/flows", json={"id": "a", "name": "A", "type": "login"})
    response = client.get("/api/v1/flows/a/history")
    assert response.status_code == 200
    assert response.json()["versions"] == []


def test_flow_history_populated_after_update(client: TestClient) -> None:
    client.post("/api/v1/flows", json={"id": "a", "name": "A", "type": "login"})
    client.put("/api/v1/flows/a", json={"id": "a", "name": "Renamed", "type": "login"})

    response = client.get("/api/v1/flows/a/history")
    assert len(response.json()["versions"]) == 1


def test_rollback_flow_restores_previous_version(client: TestClient) -> None:
    client.post("/api/v1/flows", json={"id": "a", "name": "A", "type": "login"})
    client.put("/api/v1/flows/a", json={"id": "a", "name": "Renamed", "type": "login"})
    version_id = client.get("/api/v1/flows/a/history").json()["versions"][0]["id"]

    response = client.post(f"/api/v1/flows/a/history/{version_id}/rollback")
    assert response.status_code == 200
    assert response.json()["name"] == "A"


def test_rollback_unknown_flow_version_404s(client: TestClient) -> None:
    client.post("/api/v1/flows", json={"id": "a", "name": "A", "type": "login"})
    response = client.post("/api/v1/flows/a/history/does-not-exist/rollback")
    assert response.status_code == 404


def test_rollback_flow_records_audit_event(client: TestClient) -> None:
    from flow_service.main import app

    client.post("/api/v1/flows", json={"id": "a", "name": "A", "type": "login"})
    client.put("/api/v1/flows/a", json={"id": "a", "name": "Renamed", "type": "login"})
    version_id = client.get("/api/v1/flows/a/history").json()["versions"][0]["id"]
    client.post(f"/api/v1/flows/a/history/{version_id}/rollback")

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events[-1] == {
        "action": "flow.rollback",
        "resource_type": "flow",
        "resource_id": "a",
    }
