from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from plugin_service.audit_client import AuditClient


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
    monkeypatch.setenv("PLUGINS_CONFIG_PATH", str(tmp_path / "plugins"))
    monkeypatch.setenv("CODE_PLUGINS_PATH", str(tmp_path / "code-plugins"))


@pytest.fixture
def client() -> Iterator[TestClient]:
    from plugin_service.main import app

    with TestClient(app) as test_client:
        app.state.audit = FakeAuditClient()
        yield test_client


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "plugin-service"}


def test_list_plugins_empty(client: TestClient) -> None:
    response = client.get("/api/v1/plugins")
    assert response.status_code == 200
    assert response.json() == {"plugins": []}


def test_create_plugin(client: TestClient) -> None:
    response = client.post(
        "/api/v1/plugins",
        json={"id": "test-plugin", "name": "Test Plugin", "type": "notification"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["enabled"] is True

    listed = client.get("/api/v1/plugins").json()["plugins"]
    assert listed[0]["id"] == "test-plugin"
    assert listed[0]["source"] == "config"


def test_create_plugin_duplicate_id_409s(client: TestClient) -> None:
    client.post("/api/v1/plugins", json={"id": "a", "name": "A", "type": "theme"})
    response = client.post("/api/v1/plugins", json={"id": "a", "name": "A2", "type": "theme"})
    assert response.status_code == 409


def test_update_plugin(client: TestClient) -> None:
    client.post("/api/v1/plugins", json={"id": "a", "name": "A", "type": "theme"})
    response = client.put("/api/v1/plugins/a", json={"id": "a", "name": "Renamed", "type": "theme"})
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"


def test_update_unknown_plugin_404s(client: TestClient) -> None:
    response = client.put(
        "/api/v1/plugins/does-not-exist",
        json={"id": "does-not-exist", "name": "X", "type": "theme"},
    )
    assert response.status_code == 404


def test_enable_disable_roundtrip(client: TestClient) -> None:
    client.post("/api/v1/plugins", json={"id": "a", "name": "A", "type": "policy"})

    disabled = client.post("/api/v1/plugins/a/disable")
    assert disabled.status_code == 200
    assert disabled.json()["enabled"] is False

    enabled = client.post("/api/v1/plugins/a/enable")
    assert enabled.status_code == 200
    assert enabled.json()["enabled"] is True


def test_disable_unknown_plugin_404s(client: TestClient) -> None:
    response = client.post("/api/v1/plugins/does-not-exist/disable")
    assert response.status_code == 404


def test_delete_plugin(client: TestClient) -> None:
    client.post("/api/v1/plugins", json={"id": "a", "name": "A", "type": "workflow"})
    response = client.delete("/api/v1/plugins/a")
    assert response.status_code == 204
    assert client.get("/api/v1/plugins").json()["plugins"] == []


def test_delete_unknown_plugin_404s(client: TestClient) -> None:
    response = client.delete("/api/v1/plugins/does-not-exist")
    assert response.status_code == 404


def test_create_plugin_records_audit_event(client: TestClient) -> None:
    from plugin_service.main import app

    client.post("/api/v1/plugins", json={"id": "a", "name": "A", "type": "application"})

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events == [
        {"action": "plugin.create", "resource_type": "plugin", "resource_id": "a"}
    ]


def test_disable_plugin_records_audit_event(client: TestClient) -> None:
    from plugin_service.main import app

    client.post("/api/v1/plugins", json={"id": "a", "name": "A", "type": "application"})
    client.post("/api/v1/plugins/a/disable")

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events[-1] == {
        "action": "plugin.disable",
        "resource_type": "plugin",
        "resource_id": "a",
    }


def test_create_plugin_with_unknown_dependency_422s(client: TestClient) -> None:
    response = client.post(
        "/api/v1/plugins",
        json={"id": "a", "name": "A", "type": "theme", "dependencies": ["does-not-exist"]},
    )
    assert response.status_code == 422


def test_create_plugin_with_known_dependency(client: TestClient) -> None:
    client.post("/api/v1/plugins", json={"id": "base", "name": "Base", "type": "theme"})
    response = client.post(
        "/api/v1/plugins",
        json={"id": "a", "name": "A", "type": "theme", "dependencies": ["base"]},
    )
    assert response.status_code == 201


def test_plugin_history_populated_after_update(client: TestClient) -> None:
    client.post("/api/v1/plugins", json={"id": "a", "name": "A", "type": "theme"})
    client.put("/api/v1/plugins/a", json={"id": "a", "name": "Renamed", "type": "theme"})

    response = client.get("/api/v1/plugins/a/history")
    assert len(response.json()["versions"]) == 1


def test_rollback_plugin_restores_previous_version(client: TestClient) -> None:
    client.post("/api/v1/plugins", json={"id": "a", "name": "A", "type": "theme"})
    client.put("/api/v1/plugins/a", json={"id": "a", "name": "Renamed", "type": "theme"})
    version_id = client.get("/api/v1/plugins/a/history").json()["versions"][0]["id"]

    response = client.post(f"/api/v1/plugins/a/history/{version_id}/rollback")
    assert response.status_code == 200
    assert response.json()["name"] == "A"


def test_rollback_unknown_plugin_version_404s(client: TestClient) -> None:
    client.post("/api/v1/plugins", json={"id": "a", "name": "A", "type": "theme"})
    response = client.post("/api/v1/plugins/a/history/does-not-exist/rollback")
    assert response.status_code == 404


def test_rollback_plugin_records_audit_event(client: TestClient) -> None:
    from plugin_service.main import app

    client.post("/api/v1/plugins", json={"id": "a", "name": "A", "type": "theme"})
    client.put("/api/v1/plugins/a", json={"id": "a", "name": "Renamed", "type": "theme"})
    version_id = client.get("/api/v1/plugins/a/history").json()["versions"][0]["id"]
    client.post(f"/api/v1/plugins/a/history/{version_id}/rollback")

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events[-1] == {
        "action": "plugin.rollback",
        "resource_type": "plugin",
        "resource_id": "a",
    }
