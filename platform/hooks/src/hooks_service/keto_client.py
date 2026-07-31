"""Minimal client for the Ory Keto write API used by this service."""

from __future__ import annotations

import httpx

# Relation names must match the `related` keys declared on the Organization
# namespace in ory/keto/namespaces/namespaces.ts: admin | member | billing_admin.
DEFAULT_ORGANIZATION_ROLE = "member"
ADMIN_ROLE = "admin"
MEMBER_ROLE = "member"

# Platform-wide "super admin" reuses the exact same Organization.admin
# relation the tenant registration flow already writes — just against one
# reserved Organization id, rather than inventing a new namespace/relation
# for a platform role. Console access (Ory_IDP's own admin portal) checks
# this same tuple; see applications/neobim-identity-ui/adapters/admin.ts.
PLATFORM_ORGANIZATION_ID = "platform"


class KetoWriteClient:
    """Writes relation tuples via Keto's admin relation-tuples API."""

    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None) -> None:
        self._base_url = base_url.rstrip("/")
        self._client = client or httpx.AsyncClient(base_url=self._base_url, timeout=5.0)

    async def create_relationship(
        self, namespace: str, object_id: str, relation: str, subject_id: str
    ) -> None:
        response = await self._client.put(
            "/admin/relation-tuples",
            json={
                "namespace": namespace,
                "object": object_id,
                "relation": relation,
                "subject_id": subject_id,
            },
        )
        response.raise_for_status()

    async def delete_relationship(
        self, namespace: str, object_id: str, relation: str, subject_id: str
    ) -> None:
        response = await self._client.delete(
            "/admin/relation-tuples",
            params={
                "namespace": namespace,
                "object": object_id,
                "relation": relation,
                "subject_id": subject_id,
            },
        )
        if response.status_code == 404:
            return
        response.raise_for_status()

    async def write_organization_membership(
        self, organization_id: str, identity_id: str, role: str
    ) -> None:
        await self.create_relationship("Organization", organization_id, role, identity_id)
        # Organization.permits.view() checks `member` OR `admin`; an admin-only
        # tuple would fail a plain membership check, so admins also get `member`.
        if role == ADMIN_ROLE:
            await self.create_relationship(
                "Organization", organization_id, MEMBER_ROLE, identity_id
            )

    async def grant_platform_admin(self, identity_id: str) -> None:
        await self.write_organization_membership(PLATFORM_ORGANIZATION_ID, identity_id, ADMIN_ROLE)

    async def revoke_platform_admin(self, identity_id: str) -> None:
        await self.delete_relationship(
            "Organization", PLATFORM_ORGANIZATION_ID, ADMIN_ROLE, identity_id
        )
        await self.delete_relationship(
            "Organization", PLATFORM_ORGANIZATION_ID, MEMBER_ROLE, identity_id
        )

    async def is_platform_admin(self, identity_id: str, keto_read_url: str) -> bool:
        async with httpx.AsyncClient(base_url=keto_read_url, timeout=5.0) as read_client:
            response = await read_client.post(
                "/relation-tuples/check",
                json={
                    "namespace": "Organization",
                    "object": PLATFORM_ORGANIZATION_ID,
                    "relation": ADMIN_ROLE,
                    "subject_id": identity_id,
                },
            )
        if response.status_code not in (200, 403):
            response.raise_for_status()
        body: dict[str, object] = response.json()
        return bool(body.get("allowed"))

    async def has_any_platform_admin(self, keto_read_url: str) -> bool:
        """Whether Organization:platform#admin has at least one subject.

        Used by the first-run admin bootstrap (`POST /admin/bootstrap`) to
        decide whether the platform still has zero admins — the only state
        in which that endpoint is allowed to grant admin to an arbitrary
        caller-supplied identity.
        """
        async with httpx.AsyncClient(base_url=keto_read_url, timeout=5.0) as read_client:
            response = await read_client.get(
                "/relation-tuples",
                params={
                    "namespace": "Organization",
                    "object": PLATFORM_ORGANIZATION_ID,
                    "relation": ADMIN_ROLE,
                },
            )
        response.raise_for_status()
        body: dict[str, object] = response.json()
        tuples = body.get("relation_tuples")
        return bool(tuples)

    async def aclose(self) -> None:
        await self._client.aclose()
