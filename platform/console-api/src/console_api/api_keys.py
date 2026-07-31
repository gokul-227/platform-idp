"""API Keys: developer-facing client_credentials OAuth2 clients.

Not a new authorization mechanism — an API Key *is* a real Hydra OAuth2
client with `grant_types=["client_credentials"]`. Its secret is Hydra's own
`client_secret`, shown once at creation exactly like the console's existing
"Clients" rotate-secret flow. "Enable/disable" is a real behavior change,
not UI decoration: disabling clears `grant_types` to `[]`, so a real token
request against that client_id genuinely fails with `unsupported_grant_type`
until re-enabled (verified live — see this package's tests and the final
report's testing evidence section).

`expires_at` is informational only: Hydra has no native client-secret
expiry, so nothing auto-revokes an expired key. It is surfaced so an
operator can find and manually disable it.
"""

from __future__ import annotations

import secrets
from typing import Any

from pydantic import BaseModel

from console_api.hydra_admin_client import HydraAdminClient

API_KEY_METADATA_KIND = "api_key"


class ApiKeyCreateRequest(BaseModel):
    name: str
    scope: str = ""
    expires_at: str | None = None


class ApiKeyView(BaseModel):
    client_id: str
    name: str
    scope: str
    enabled: bool
    expires_at: str | None
    created_at: str | None


def _new_client_id() -> str:
    return f"apikey-{secrets.token_hex(8)}"


def is_api_key(hydra_client: dict[str, Any]) -> bool:
    metadata = hydra_client.get("metadata") or {}
    return isinstance(metadata, dict) and metadata.get("kind") == API_KEY_METADATA_KIND


def to_view(hydra_client: dict[str, Any]) -> ApiKeyView:
    metadata = hydra_client.get("metadata") or {}
    return ApiKeyView(
        client_id=hydra_client["client_id"],
        created_at=hydra_client.get("created_at"),
        enabled=bool(metadata.get("enabled", False)),
        expires_at=metadata.get("expires_at"),
        name=metadata.get("name", hydra_client["client_id"]),
        scope=hydra_client.get("scope", ""),
    )


async def create_api_key(
    hydra: HydraAdminClient, body: ApiKeyCreateRequest
) -> tuple[ApiKeyView, str]:
    client_id = _new_client_id()
    payload = {
        "client_id": client_id,
        "grant_types": ["client_credentials"],
        "metadata": {
            "enabled": True,
            "expires_at": body.expires_at,
            "kind": API_KEY_METADATA_KIND,
            "name": body.name,
        },
        "response_types": [],
        "scope": body.scope,
        "token_endpoint_auth_method": "client_secret_post",
    }
    created = await hydra.create_client(payload)
    return to_view(created), created["client_secret"]


async def _set_enabled(hydra: HydraAdminClient, client_id: str, enabled: bool) -> ApiKeyView:
    existing = await hydra.get_client(client_id)
    metadata = dict(existing.get("metadata") or {})
    metadata["enabled"] = enabled
    payload = {
        **existing,
        "client_id": client_id,
        "grant_types": ["client_credentials"] if enabled else [],
        "metadata": metadata,
    }
    updated = await hydra.update_client(client_id, payload)
    return to_view(updated)


async def enable_api_key(hydra: HydraAdminClient, client_id: str) -> ApiKeyView:
    return await _set_enabled(hydra, client_id, True)


async def disable_api_key(hydra: HydraAdminClient, client_id: str) -> ApiKeyView:
    return await _set_enabled(hydra, client_id, False)
