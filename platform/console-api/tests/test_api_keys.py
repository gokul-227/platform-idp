from __future__ import annotations

from typing import Any

import pytest

from console_api.api_keys import (
    ApiKeyCreateRequest,
    create_api_key,
    disable_api_key,
    enable_api_key,
    is_api_key,
    to_view,
)
from console_api.hydra_admin_client import ClientNotFoundError, HydraAdminClient


class FakeHydraAdminClient(HydraAdminClient):
    def __init__(self) -> None:
        self.clients: dict[str, dict[str, Any]] = {}

    async def create_client(self, payload: dict[str, Any]) -> dict[str, Any]:
        client = {
            **payload,
            "client_secret": "generated-secret",
            "created_at": "2026-01-01T00:00:00Z",
        }
        self.clients[payload["client_id"]] = client
        return client

    async def get_client(self, client_id: str) -> dict[str, Any]:
        if client_id not in self.clients:
            raise ClientNotFoundError(client_id)
        return self.clients[client_id]

    async def update_client(self, client_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        if client_id not in self.clients:
            raise ClientNotFoundError(client_id)
        self.clients[client_id] = payload
        return payload

    async def aclose(self) -> None:
        pass


def test_is_api_key_true_for_api_key_metadata() -> None:
    assert is_api_key({"client_id": "a", "metadata": {"kind": "api_key"}})


def test_is_api_key_false_for_regular_client() -> None:
    assert not is_api_key({"client_id": "a", "metadata": {}})
    assert not is_api_key({"client_id": "a"})


def test_to_view_reads_metadata_fields() -> None:
    view = to_view(
        {
            "client_id": "apikey-1",
            "created_at": "2026-01-01T00:00:00Z",
            "metadata": {
                "enabled": True,
                "expires_at": "2027-01-01",
                "kind": "api_key",
                "name": "CI key",
            },
            "scope": "read write",
        }
    )
    assert view.name == "CI key"
    assert view.enabled is True
    assert view.expires_at == "2027-01-01"
    assert view.scope == "read write"


async def test_create_api_key_returns_view_and_secret() -> None:
    hydra = FakeHydraAdminClient()
    view, secret = await create_api_key(hydra, ApiKeyCreateRequest(name="CI key", scope="read"))
    assert secret == "generated-secret"
    assert view.name == "CI key"
    assert view.enabled is True
    assert view.client_id.startswith("apikey-")


async def test_create_api_key_sets_client_credentials_grant() -> None:
    hydra = FakeHydraAdminClient()
    view, _ = await create_api_key(hydra, ApiKeyCreateRequest(name="CI key"))
    stored = hydra.clients[view.client_id]
    assert stored["grant_types"] == ["client_credentials"]


async def test_disable_api_key_clears_grant_types() -> None:
    hydra = FakeHydraAdminClient()
    view, _ = await create_api_key(hydra, ApiKeyCreateRequest(name="CI key"))

    disabled = await disable_api_key(hydra, view.client_id)
    assert disabled.enabled is False
    assert hydra.clients[view.client_id]["grant_types"] == []


async def test_enable_api_key_restores_grant_types() -> None:
    hydra = FakeHydraAdminClient()
    view, _ = await create_api_key(hydra, ApiKeyCreateRequest(name="CI key"))
    await disable_api_key(hydra, view.client_id)

    enabled = await enable_api_key(hydra, view.client_id)
    assert enabled.enabled is True
    assert hydra.clients[view.client_id]["grant_types"] == ["client_credentials"]


async def test_enable_unknown_api_key_raises() -> None:
    hydra = FakeHydraAdminClient()
    with pytest.raises(ClientNotFoundError):
        await enable_api_key(hydra, "does-not-exist")
