"""Thin client for the Keto Admin (write) API relation-tuple endpoints.

Same shape as platform/hooks/keto_client.py's create_relationship/
delete_relationship — duplicated rather than shared, per this repo's
independently-deployable-services convention (each platform/* package has
no runtime dependency on another). This is the write path for the
console's Permissions page; console/permissions/page.tsx's read side
(list/check) still calls Keto's read API directly.
"""

from __future__ import annotations

from typing import Any

import httpx


class KetoAdminClient:
    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(base_url=base_url, timeout=5.0)

    async def create_relationship(
        self,
        namespace: str,
        object_id: str,
        relation: str,
        subject_id: str | None = None,
        subject_set: dict[str, Any] | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "namespace": namespace,
            "object": object_id,
            "relation": relation,
        }
        if subject_set is not None:
            payload["subject_set"] = subject_set
        else:
            payload["subject_id"] = subject_id
        response = await self._client.put("/admin/relation-tuples", json=payload)
        response.raise_for_status()

    async def delete_relationship(
        self,
        namespace: str,
        object_id: str,
        relation: str,
        subject_id: str | None = None,
        subject_set: dict[str, Any] | None = None,
    ) -> None:
        params: dict[str, str] = {"namespace": namespace, "object": object_id, "relation": relation}
        if subject_set is not None:
            params["subject_set.namespace"] = subject_set["namespace"]
            params["subject_set.object"] = subject_set["object"]
            params["subject_set.relation"] = subject_set["relation"]
        elif subject_id is not None:
            params["subject_id"] = subject_id
        response = await self._client.delete("/admin/relation-tuples", params=params)
        if response.status_code == 404:
            return
        response.raise_for_status()

    async def aclose(self) -> None:
        await self._client.aclose()
