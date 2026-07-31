"""Thin client for the Ory Hydra Admin API's login/consent/logout request endpoints."""

from __future__ import annotations

from typing import Any

import httpx


class HydraAdminClient:
    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(base_url=base_url, timeout=10.0)

    async def get_login_request(self, challenge: str) -> dict[str, Any]:
        response = await self._client.get(
            "/admin/oauth2/auth/requests/login", params={"login_challenge": challenge}
        )
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def accept_login_request(self, challenge: str, body: dict[str, Any]) -> dict[str, Any]:
        response = await self._client.put(
            "/admin/oauth2/auth/requests/login/accept",
            params={"login_challenge": challenge},
            json=body,
        )
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def get_consent_request(self, challenge: str) -> dict[str, Any]:
        response = await self._client.get(
            "/admin/oauth2/auth/requests/consent", params={"consent_challenge": challenge}
        )
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def accept_consent_request(self, challenge: str, body: dict[str, Any]) -> dict[str, Any]:
        response = await self._client.put(
            "/admin/oauth2/auth/requests/consent/accept",
            params={"consent_challenge": challenge},
            json=body,
        )
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def accept_logout_request(self, challenge: str) -> dict[str, Any]:
        response = await self._client.put(
            "/admin/oauth2/auth/requests/logout/accept",
            params={"logout_challenge": challenge},
        )
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def aclose(self) -> None:
        await self._client.aclose()
