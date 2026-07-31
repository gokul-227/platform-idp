"""Thin client for Hydra's PUBLIC OAuth2 endpoints (token issuance) — a
separate base URL and a separate concern from hydra_admin_client.py's
/admin/clients management. Used by the Developer Portal's token tester:
the console never stores a client secret, it just forwards one submitted
in the test form straight through to Hydra, exactly what an external
developer's own app would do.
"""

from __future__ import annotations

from typing import Any

import httpx


class TokenRequestError(Exception):
    def __init__(self, status_code: int, body: dict[str, Any]) -> None:
        super().__init__(f"Token request failed ({status_code}): {body}")
        self.status_code = status_code
        self.body = body


class HydraPublicClient:
    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(base_url=base_url, timeout=10.0)

    async def client_credentials_token(
        self, client_id: str, client_secret: str, scope: str
    ) -> dict[str, Any]:
        response = await self._client.post(
            "/oauth2/token",
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": scope,
            },
        )
        if response.status_code != 200:
            raise TokenRequestError(response.status_code, response.json())
        data: dict[str, Any] = response.json()
        return data

    async def authorization_code_token(
        self, client_id: str, code: str, redirect_uri: str, code_verifier: str
    ) -> dict[str, Any]:
        """PKCE-only (public client) authorization_code exchange — no
        client_secret, matching a `token_endpoint_auth_method: none` client.
        This is the real Hydra token endpoint; Hydra itself validates the
        PKCE code_verifier against the code_challenge sent to /oauth2/auth."""
        response = await self._client.post(
            "/oauth2/token",
            data={
                "grant_type": "authorization_code",
                "client_id": client_id,
                "code": code,
                "redirect_uri": redirect_uri,
                "code_verifier": code_verifier,
            },
        )
        if response.status_code != 200:
            raise TokenRequestError(response.status_code, response.json())
        data: dict[str, Any] = response.json()
        return data

    async def refresh_token(self, client_id: str, refresh_token: str) -> dict[str, Any]:
        response = await self._client.post(
            "/oauth2/token",
            data={
                "grant_type": "refresh_token",
                "client_id": client_id,
                "refresh_token": refresh_token,
            },
        )
        if response.status_code != 200:
            raise TokenRequestError(response.status_code, response.json())
        data: dict[str, Any] = response.json()
        return data

    async def aclose(self) -> None:
        await self._client.aclose()
