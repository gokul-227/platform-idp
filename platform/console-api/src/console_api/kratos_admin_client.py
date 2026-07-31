"""Thin client for the Kratos Admin API identity endpoints this service owns.

Deliberately raw httpx, not an Ory-generated SDK — matches the convention
already used by platform/app-registry/hydra_client.py and
platform/hooks/keto_client.py: a small, hand-written client scoped to
exactly the calls this service makes, not a full API surface.
"""

from __future__ import annotations

from typing import Any, Literal

import httpx

IdentityState = Literal["active", "inactive"]

DEFAULT_SCHEMA_ID = "enterprise_user"


class IdentityNotFoundError(Exception):
    def __init__(self, identity_id: str) -> None:
        super().__init__(f"Identity not found: {identity_id}")
        self.identity_id = identity_id


class SessionNotFoundError(Exception):
    def __init__(self, session_id: str) -> None:
        super().__init__(f"Session not found: {session_id}")
        self.session_id = session_id


class KratosAdminClient:
    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(base_url=base_url, timeout=10.0)

    async def create_identity(
        self,
        traits: dict[str, Any],
        schema_id: str = DEFAULT_SCHEMA_ID,
        password: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"schema_id": schema_id, "traits": traits}
        if password:
            payload["credentials"] = {"password": {"config": {"password": password}}}
        response = await self._client.post("/admin/identities", json=payload)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def get_identity(self, identity_id: str) -> dict[str, Any]:
        response = await self._client.get(f"/admin/identities/{identity_id}")
        if response.status_code == 404:
            raise IdentityNotFoundError(identity_id)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def set_identity_state(self, identity_id: str, state: IdentityState) -> dict[str, Any]:
        response = await self._client.patch(
            f"/admin/identities/{identity_id}",
            json=[{"op": "replace", "path": "/state", "value": state}],
        )
        if response.status_code == 404:
            raise IdentityNotFoundError(identity_id)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def update_traits(self, identity_id: str, traits: dict[str, Any]) -> dict[str, Any]:
        response = await self._client.patch(
            f"/admin/identities/{identity_id}",
            json=[{"op": "replace", "path": "/traits", "value": traits}],
        )
        if response.status_code == 404:
            raise IdentityNotFoundError(identity_id)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def force_verify(self, identity_id: str) -> dict[str, Any]:
        """Marks every one of the identity's verifiable addresses (email)
        as verified, bypassing the normal verification-code flow —
        JSON Patch has no wildcard, so this reads the identity first to
        know how many addresses to patch."""
        identity = await self.get_identity(identity_id)
        addresses = identity.get("verifiable_addresses") or []
        operations = [
            op
            for i in range(len(addresses))
            for op in (
                {
                    "op": "replace",
                    "path": f"/verifiable_addresses/{i}/verified",
                    "value": True,
                },
                {
                    "op": "replace",
                    "path": f"/verifiable_addresses/{i}/status",
                    "value": "completed",
                },
            )
        ]
        if not operations:
            return identity
        response = await self._client.patch(f"/admin/identities/{identity_id}", json=operations)
        if response.status_code == 404:
            raise IdentityNotFoundError(identity_id)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def set_password(self, identity_id: str, password: str) -> dict[str, Any]:
        """A JSON Patch on /credentials/password/config/password returns
        200 but does NOT actually rehash the credential for real login use
        — confirmed live (a password "reset" this way still gets rejected
        at the real login flow). Kratos only picks up a new plaintext
        password through a full PUT of the identity, so this fetches the
        current identity first (to preserve schema_id/traits/state) and
        PUTs it back with the new password attached."""
        identity = await self.get_identity(identity_id)
        payload = {
            "credentials": {"password": {"config": {"password": password}}},
            "schema_id": identity["schema_id"],
            "state": identity.get("state", "active"),
            "traits": identity["traits"],
        }
        response = await self._client.put(f"/admin/identities/{identity_id}", json=payload)
        if response.status_code == 404:
            raise IdentityNotFoundError(identity_id)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data

    async def delete_identity(self, identity_id: str) -> None:
        response = await self._client.delete(f"/admin/identities/{identity_id}")
        if response.status_code == 404:
            raise IdentityNotFoundError(identity_id)
        response.raise_for_status()

    async def revoke_session(self, session_id: str) -> None:
        response = await self._client.delete(f"/admin/sessions/{session_id}")
        if response.status_code == 404:
            raise SessionNotFoundError(session_id)
        response.raise_for_status()

    async def revoke_all_sessions(self, identity_id: str) -> None:
        response = await self._client.delete(f"/admin/identities/{identity_id}/sessions")
        if response.status_code == 404:
            raise IdentityNotFoundError(identity_id)
        response.raise_for_status()

    async def aclose(self) -> None:
        await self._client.aclose()
