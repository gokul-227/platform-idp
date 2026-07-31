"""Thin client for the Ory Kratos Frontend API's session check."""

from __future__ import annotations

from typing import Any

import httpx


class KratosFrontendClient:
    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(base_url=base_url, timeout=10.0)

    async def to_session(self, cookie: str) -> dict[str, Any] | None:
        """Return the active session for a browser cookie, or None if unauthenticated."""
        response = await self._client.get("/sessions/whoami", headers={"Cookie": cookie})
        if response.status_code == 401:
            return None
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def aclose(self) -> None:
        await self._client.aclose()


class KratosAdminClient:
    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(base_url=base_url, timeout=10.0)

    async def get_identity(self, identity_id: str) -> dict[str, Any] | None:
        """Return an identity's traits by ID, or None if it doesn't exist."""
        response = await self._client.get(f"/admin/identities/{identity_id}")
        if response.status_code == 404:
            return None
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def aclose(self) -> None:
        await self._client.aclose()
