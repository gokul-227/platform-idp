"""Thin client for the Hydra Admin API OAuth2 client endpoints this service owns.

Raw httpx, matching the convention already used by
platform/app-registry/hydra_client.py and this service's own
kratos_admin_client.py — a small, hand-written client scoped to exactly the
calls this service makes. Unlike app-registry (which only ever creates
clients that come from integrations/applications/*.yaml), this one is the direct write
path for ad-hoc OAuth2 clients managed from the console's Clients page —
Hydra is the source of truth here, not a YAML file.
"""

from __future__ import annotations

from typing import Any

import httpx


class ClientNotFoundError(Exception):
    def __init__(self, client_id: str) -> None:
        super().__init__(f"OAuth2 client not found: {client_id}")
        self.client_id = client_id


class HydraAdminClient:
    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(base_url=base_url, timeout=10.0)

    async def create_client(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self._client.post("/admin/clients", json=payload)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def list_clients(self, page_size: int = 200) -> list[dict[str, Any]]:
        response = await self._client.get("/admin/clients", params={"page_size": page_size})
        response.raise_for_status()
        data: list[dict[str, Any]] = response.json()
        return data

    async def get_client(self, client_id: str) -> dict[str, Any]:
        response = await self._client.get(f"/admin/clients/{client_id}")
        if response.status_code == 404:
            raise ClientNotFoundError(client_id)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def update_client(self, client_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self._client.put(f"/admin/clients/{client_id}", json=payload)
        if response.status_code == 404:
            raise ClientNotFoundError(client_id)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def patch_client(
        self, client_id: str, operations: list[dict[str, Any]]
    ) -> dict[str, Any]:
        response = await self._client.patch(f"/admin/clients/{client_id}", json=operations)
        if response.status_code == 404:
            raise ClientNotFoundError(client_id)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def delete_client(self, client_id: str) -> None:
        response = await self._client.delete(f"/admin/clients/{client_id}")
        if response.status_code == 404:
            raise ClientNotFoundError(client_id)
        response.raise_for_status()

    async def aclose(self) -> None:
        await self._client.aclose()
