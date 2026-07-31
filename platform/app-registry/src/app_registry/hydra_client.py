"""Thin client for the Ory Hydra Admin API OAuth2 client endpoints."""

from __future__ import annotations

from typing import Any

import httpx


class HydraAdminClient:
    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(base_url=base_url, timeout=10.0)

    async def get_oauth2_client(self, client_id: str) -> dict[str, Any] | None:
        response = await self._client.get(f"/admin/clients/{client_id}")
        if response.status_code == 404:
            return None
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def create_oauth2_client(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self._client.post("/admin/clients", json=payload)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def set_oauth2_client(self, client_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self._client.put(f"/admin/clients/{client_id}", json=payload)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def list_oauth2_clients(self) -> list[dict[str, Any]]:
        response = await self._client.get("/admin/clients")
        response.raise_for_status()
        data: list[dict[str, Any]] = response.json()
        return data

    async def delete_oauth2_client(self, client_id: str) -> None:
        response = await self._client.delete(f"/admin/clients/{client_id}")
        if response.status_code == 404:
            return
        response.raise_for_status()

    async def aclose(self) -> None:
        await self._client.aclose()
