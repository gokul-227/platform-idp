from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from app_registry.config import Settings
from app_registry.hydra_client import HydraAdminClient
from app_registry.logging_config import configure_logging
from app_registry.sync import HydraRegistrySync

logger = configure_logging("test")


class FakeHydraAdminClient(HydraAdminClient):
    def __init__(self, existing_client_ids: set[str] | None = None) -> None:
        self.existing_client_ids = existing_client_ids or set()
        self.created: list[dict[str, Any]] = []
        self.updated: list[tuple[str, dict[str, Any]]] = []
        self.deleted: list[str] = []

    async def get_oauth2_client(self, client_id: str) -> dict[str, Any] | None:
        if client_id in self.existing_client_ids:
            return {"client_id": client_id}
        return None

    async def create_oauth2_client(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.created.append(payload)
        return payload

    async def set_oauth2_client(self, client_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.updated.append((client_id, payload))
        return payload

    async def list_oauth2_clients(self) -> list[dict[str, Any]]:
        return [{"client_id": cid} for cid in sorted(self.existing_client_ids)]

    async def delete_oauth2_client(self, client_id: str) -> None:
        self.existing_client_ids.discard(client_id)
        self.deleted.append(client_id)

    async def aclose(self) -> None:
        pass


def make_settings(registry_dir: Path, schema_path: Path, **overrides: Any) -> Settings:
    return Settings(
        registry_path=registry_dir,
        schema_path=schema_path,
        platform_env=overrides.pop("platform_env", "local"),
        **overrides,
    )


async def test_sync_skips_disabled_definitions(registry_dir: Path, schema_path: Path) -> None:
    settings = make_settings(registry_dir, schema_path)
    hydra = FakeHydraAdminClient()
    sync_engine = HydraRegistrySync(settings, hydra, logger)

    summary = await sync_engine.sync(dry_run=False)

    disabled = next(r for r in summary.results if r.client_id == "disabled-app")
    assert disabled.action == "skipped"
    assert all(client["client_id"] != "disabled-app" for client in hydra.created)


async def test_sync_deletes_existing_client_when_disabled(
    registry_dir: Path, schema_path: Path
) -> None:
    settings = make_settings(registry_dir, schema_path)
    hydra = FakeHydraAdminClient(existing_client_ids={"disabled-app"})
    sync_engine = HydraRegistrySync(settings, hydra, logger)

    summary = await sync_engine.sync(dry_run=False)

    disabled = next(r for r in summary.results if r.client_id == "disabled-app")
    assert disabled.action == "deleted"
    assert hydra.deleted == ["disabled-app"]


async def test_sync_dry_run_does_not_delete_disabled_client(
    registry_dir: Path, schema_path: Path
) -> None:
    settings = make_settings(registry_dir, schema_path)
    hydra = FakeHydraAdminClient(existing_client_ids={"disabled-app"})
    sync_engine = HydraRegistrySync(settings, hydra, logger)

    summary = await sync_engine.sync(dry_run=True)

    disabled = next(r for r in summary.results if r.client_id == "disabled-app")
    assert disabled.action == "deleted"
    assert "[dry-run]" in (disabled.message or "")
    assert hydra.deleted == []


async def test_sync_creates_new_client(registry_dir: Path, schema_path: Path) -> None:
    settings = make_settings(registry_dir, schema_path)
    hydra = FakeHydraAdminClient()
    sync_engine = HydraRegistrySync(settings, hydra, logger)

    summary = await sync_engine.sync(dry_run=False)

    created = next(r for r in summary.results if r.client_id == "test-app")
    assert created.action == "created"
    assert len(hydra.created) == 1
    assert hydra.created[0]["client_secret"] == "default_client_secret_do_not_use_in_production"


async def test_sync_updates_existing_client(registry_dir: Path, schema_path: Path) -> None:
    settings = make_settings(registry_dir, schema_path)
    hydra = FakeHydraAdminClient(existing_client_ids={"test-app"})
    sync_engine = HydraRegistrySync(settings, hydra, logger)

    summary = await sync_engine.sync(dry_run=False)

    updated = next(r for r in summary.results if r.client_id == "test-app")
    assert updated.action == "updated"
    assert len(hydra.updated) == 1


async def test_sync_dry_run_makes_no_calls(registry_dir: Path, schema_path: Path) -> None:
    settings = make_settings(registry_dir, schema_path)
    hydra = FakeHydraAdminClient()
    sync_engine = HydraRegistrySync(settings, hydra, logger)

    summary = await sync_engine.sync(dry_run=True)

    created = next(r for r in summary.results if r.client_id == "test-app")
    assert created.action == "created"
    assert "[dry-run]" in (created.message or "")
    assert hydra.created == []


async def test_sync_missing_secret_without_default_allowed_fails(
    registry_dir: Path, schema_path: Path
) -> None:
    settings = make_settings(registry_dir, schema_path, platform_env="production")
    hydra = FakeHydraAdminClient()
    sync_engine = HydraRegistrySync(settings, hydra, logger)

    summary = await sync_engine.sync(dry_run=False)

    failed = next(r for r in summary.results if r.client_id == "test-app")
    assert failed.action == "failed"
    assert "Missing client secret" in (failed.message or "")


async def test_describe_registry_excludes_templates(registry_dir: Path, schema_path: Path) -> None:
    settings = make_settings(registry_dir, schema_path)
    hydra = FakeHydraAdminClient()
    sync_engine = HydraRegistrySync(settings, hydra, logger)

    info = sync_engine.describe_registry()
    assert info.count == 2
    assert "_template.yaml" not in info.files


async def test_list_hydra_clients(registry_dir: Path, schema_path: Path) -> None:
    settings = make_settings(registry_dir, schema_path)
    hydra = FakeHydraAdminClient(existing_client_ids={"other-app"})
    sync_engine = HydraRegistrySync(settings, hydra, logger)

    clients = await sync_engine.list_hydra_clients()
    assert [c.client_id for c in clients] == ["other-app"]


@pytest.fixture(autouse=True)
def _no_env_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TEST_APP_OIDC_CLIENT_SECRET", raising=False)
