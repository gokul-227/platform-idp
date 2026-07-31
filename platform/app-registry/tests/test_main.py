from __future__ import annotations

import os
import shutil
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app_registry.audit_client import AuditClient
from app_registry.hydra_client import HydraAdminClient

REGISTRY_DIR = Path(__file__).resolve().parent / "fixtures" / "registry"
SCHEMA_PATH = (
    Path(__file__).resolve().parents[3] / "configuration" / "schemas" / "app-registry.schema.json"
)


class FakeHydraAdminClient(HydraAdminClient):
    def __init__(self, existing_client_ids: set[str] | None = None) -> None:
        self.existing_client_ids = existing_client_ids or set()

    async def get_oauth2_client(self, client_id: str) -> dict[str, Any] | None:
        if client_id in self.existing_client_ids:
            return {"client_id": client_id}
        return None

    async def create_oauth2_client(self, payload: dict[str, Any]) -> dict[str, Any]:
        return payload

    async def set_oauth2_client(self, client_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return payload

    async def list_oauth2_clients(self) -> list[dict[str, Any]]:
        return [{"client_id": cid} for cid in sorted(self.existing_client_ids)]

    async def delete_oauth2_client(self, client_id: str) -> None:
        self.existing_client_ids.discard(client_id)

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


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REGISTRY_PATH", str(REGISTRY_DIR))
    monkeypatch.setenv("APP_REGISTRY_SCHEMA_PATH", str(SCHEMA_PATH))
    monkeypatch.setenv("PLATFORM_ENV", "local")
    monkeypatch.setenv("OTEL_ENABLED", "false")
    os.environ.pop("HYDRA_ADMIN_URL", None)


@pytest.fixture
def client() -> Iterator[TestClient]:
    from app_registry.config import get_settings
    from app_registry.main import app
    from app_registry.sync import HydraRegistrySync

    get_settings.cache_clear()
    with TestClient(app) as test_client:
        # Swap in a fake Hydra client so tests never hit the network — the
        # real client is only created once, in main.py's lifespan.
        app.state.sync_engine = HydraRegistrySync(
            get_settings(), FakeHydraAdminClient(), app.state.sync_engine._logger
        )
        app.state.audit = FakeAuditClient()
        yield test_client
    get_settings.cache_clear()


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "app-registry"}


def test_ready(client: TestClient) -> None:
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready", "hydra": "reachable"}


def test_registry_listing_excludes_template(client: TestClient) -> None:
    response = client.get("/api/v1/registry")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    filenames = [d["filename"] for d in body["definitions"]]
    assert filenames == ["sample-app.yaml"]


def test_sync_dry_run_reports_created(client: TestClient) -> None:
    response = client.post("/api/v1/sync?dry_run=true")
    assert response.status_code == 200
    body = response.json()
    assert body["dry_run"] is True
    result = next(r for r in body["results"] if r["client_id"] == "sample-app")
    assert result["action"] == "created"


def test_get_clients(client: TestClient) -> None:
    response = client.get("/api/v1/clients")
    assert response.status_code == 200
    assert response.json() == {"count": 0, "clients": []}


def test_set_enabled_unknown_client_id_404s(client: TestClient) -> None:
    response = client.post("/api/v1/registry/does-not-exist/enabled", json={"enabled": False})
    assert response.status_code == 404


@pytest.fixture
def writable_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """A `client`-equivalent whose registry lives in tmp_path, not the
    checked-in tests/fixtures/registry — the enable/disable endpoint writes
    to disk, and mutating a real fixture file would leak between test runs."""
    from app_registry.config import get_settings
    from app_registry.main import app
    from app_registry.sync import HydraRegistrySync

    registry_copy = tmp_path / "registry"
    shutil.copytree(REGISTRY_DIR, registry_copy)
    monkeypatch.setenv("REGISTRY_PATH", str(registry_copy))

    get_settings.cache_clear()
    with TestClient(app) as test_client:
        app.state.sync_engine = HydraRegistrySync(
            get_settings(), FakeHydraAdminClient(), app.state.sync_engine._logger
        )
        app.state.audit = FakeAuditClient()
        yield test_client
    get_settings.cache_clear()


def test_set_enabled_disables_and_syncs(writable_client: TestClient, tmp_path: Path) -> None:
    response = writable_client.post("/api/v1/registry/sample-app/enabled", json={"enabled": False})
    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert body["sync_result"]["action"] == "skipped"

    rewritten = (tmp_path / "registry" / "sample-app.yaml").read_text(encoding="utf-8")
    assert "enabled: false" in rewritten

    registry = writable_client.get("/api/v1/registry").json()
    definition = next(d for d in registry["definitions"] if d["client_id"] == "sample-app")
    assert definition["enabled"] is False


def test_set_enabled_re_enable_deletes_then_recreates(
    writable_client: TestClient, tmp_path: Path
) -> None:
    writable_client.post("/api/v1/registry/sample-app/enabled", json={"enabled": False})

    response = writable_client.post("/api/v1/registry/sample-app/enabled", json={"enabled": True})
    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["sync_result"]["action"] == "created"

    rewritten = (tmp_path / "registry" / "sample-app.yaml").read_text(encoding="utf-8")
    assert "enabled: true" in rewritten


def test_create_registry_app(writable_client: TestClient, tmp_path: Path) -> None:
    response = writable_client.post(
        "/api/v1/registry",
        json={
            "client_id": "new-app",
            "client_name": "New Application",
            "redirect_uris": ["http://localhost:9999/callback"],
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["filename"] == "new-app.yaml"
    assert body["sync_result"]["action"] == "created"
    assert (tmp_path / "registry" / "new-app.yaml").exists()


def test_create_registry_app_duplicate_client_id_409s(writable_client: TestClient) -> None:
    response = writable_client.post(
        "/api/v1/registry",
        json={
            "client_id": "sample-app",
            "client_name": "Duplicate",
            "redirect_uris": ["http://localhost:9999/callback"],
        },
    )
    assert response.status_code == 409


def test_update_registry_app(writable_client: TestClient, tmp_path: Path) -> None:
    response = writable_client.put(
        "/api/v1/registry/sample-app",
        json={
            "client_id": "sample-app",
            "client_name": "Renamed Sample",
            "redirect_uris": ["http://localhost:4455/auth/callback"],
        },
    )
    assert response.status_code == 200
    assert response.json()["sync_result"]["action"] in ("created", "updated")

    registry = writable_client.get("/api/v1/registry").json()
    definition = next(d for d in registry["definitions"] if d["client_id"] == "sample-app")
    assert definition["client_name"] == "Renamed Sample"


def test_update_unknown_registry_app_404s(writable_client: TestClient) -> None:
    response = writable_client.put(
        "/api/v1/registry/does-not-exist",
        json={
            "client_id": "does-not-exist",
            "client_name": "X",
            "redirect_uris": ["http://localhost:9999/callback"],
        },
    )
    assert response.status_code == 404


def test_delete_registry_app(writable_client: TestClient, tmp_path: Path) -> None:
    response = writable_client.delete("/api/v1/registry/sample-app")
    assert response.status_code == 200
    assert not (tmp_path / "registry" / "sample-app.yaml").exists()

    registry = writable_client.get("/api/v1/registry").json()
    assert registry["count"] == 0


def test_delete_unknown_registry_app_404s(writable_client: TestClient) -> None:
    response = writable_client.delete("/api/v1/registry/does-not-exist")
    assert response.status_code == 404


def test_create_registry_app_records_audit_event(writable_client: TestClient) -> None:
    from app_registry.main import app

    writable_client.post(
        "/api/v1/registry",
        json={
            "client_id": "new-app",
            "client_name": "New Application",
            "redirect_uris": ["http://localhost:9999/callback"],
        },
    )

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events == [
        {"action": "application.create", "resource_type": "application", "resource_id": "new-app"}
    ]


def test_delete_registry_app_records_audit_event(writable_client: TestClient) -> None:
    from app_registry.main import app

    writable_client.delete("/api/v1/registry/sample-app")

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events == [
        {
            "action": "application.delete",
            "resource_type": "application",
            "resource_id": "sample-app",
        }
    ]


def test_set_enabled_records_audit_event(writable_client: TestClient) -> None:
    from app_registry.main import app

    writable_client.post("/api/v1/registry/sample-app/enabled", json={"enabled": False})

    fake_audit: FakeAuditClient = app.state.audit
    assert fake_audit.events == [
        {
            "action": "application.disable",
            "resource_type": "application",
            "resource_id": "sample-app",
        }
    ]
