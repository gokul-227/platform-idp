"""Thin clients for Keto's read (list/check) and admin/write (create/delete
relation-tuple) APIs. Same shape as console_api.keto_admin_client's write
side and identity-ui/adapters/admin.ts's read side — duplicated rather than
shared, per this repo's independently-deployable-services convention.

This service never stores relation tuples itself: Policies (see policies.py)
are read live from Keto and mutated directly against it. Keto remains the
one authorization engine; this client is the only thing that talks to it.
"""

from __future__ import annotations

from typing import Any

import httpx


class RelationTuple:
    def __init__(
        self,
        namespace: str,
        object: str,  # noqa: A002 - matches Keto's own field name
        relation: str,
        subject_id: str | None = None,
        subject_set: dict[str, Any] | None = None,
    ) -> None:
        self.namespace = namespace
        self.object = object
        self.relation = relation
        self.subject_id = subject_id
        self.subject_set = subject_set


class KetoReadClient:
    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(base_url=base_url, timeout=5.0)

    async def list_relation_tuples(
        self,
        namespace: str,
        relation: str | None = None,
        object_id: str | None = None,
    ) -> list[RelationTuple]:
        """`object_id` (added for group_authz.py's parent-tree traversal and
        standing lookups) filters to tuples on one exact object, e.g.
        `list_relation_tuples("Group", relation="parent", object_id="acme-mep")`
        to find what a group's parent is.
        """
        params: dict[str, str] = {"namespace": namespace, "page_size": "200"}
        if relation:
            params["relation"] = relation
        if object_id:
            params["object"] = object_id
        response = await self._client.get("/relation-tuples", params=params)
        response.raise_for_status()
        body = response.json()
        return [
            RelationTuple(
                namespace=tuple_["namespace"],
                object=tuple_["object"],
                relation=tuple_["relation"],
                subject_id=tuple_.get("subject_id"),
                subject_set=tuple_.get("subject_set"),
            )
            for tuple_ in body.get("relation_tuples", [])
        ]

    async def check(self, namespace: str, object_id: str, relation: str, subject_id: str) -> bool:
        """Real Keto ReBAC check via `/relation-tuples/check`.

        Keto's own contract (confirmed live): HTTP 200 with `{"allowed":
        true}` when the tuple holds, HTTP 403 with `{"allowed": false}`
        otherwise — never any other status for a well-formed request. This
        client mirrors that exactly so callers (e.g. the `/api/v1/authorize`
        endpoint in main.py) can be a byte-for-byte drop-in target for
        Oathkeeper's `remote_json` authorizer, which already speaks this
        same contract against Keto directly for the other protected routes.
        """
        response = await self._client.post(
            "/relation-tuples/check",
            json={
                "namespace": namespace,
                "object": object_id,
                "relation": relation,
                "subject_id": subject_id,
            },
        )
        if response.status_code not in (200, 403):
            response.raise_for_status()
        body: dict[str, object] = response.json()
        return bool(body.get("allowed"))

    async def aclose(self) -> None:
        await self._client.aclose()


class KetoAdminClient:
    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(base_url=base_url, timeout=5.0)

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

    async def aclose(self) -> None:
        await self._client.aclose()
