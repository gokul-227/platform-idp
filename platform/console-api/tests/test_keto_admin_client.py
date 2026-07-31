from __future__ import annotations

import json

import httpx

from console_api.keto_admin_client import KetoAdminClient


def make_client(handler: httpx.MockTransport) -> KetoAdminClient:
    transport_client = httpx.AsyncClient(base_url="http://keto:4467", transport=handler)
    return KetoAdminClient("http://keto:4467", client=transport_client)


async def test_create_relationship_with_subject_id() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(201)

    client = make_client(httpx.MockTransport(handler))
    await client.create_relationship("Organization", "org-1", "member", subject_id="user-1")
    assert captured == {
        "namespace": "Organization",
        "object": "org-1",
        "relation": "member",
        "subject_id": "user-1",
    }
    await client.aclose()


async def test_create_relationship_with_subject_set() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(201)

    client = make_client(httpx.MockTransport(handler))
    await client.create_relationship(
        "Project",
        "proj-1",
        "viewer",
        subject_set={"namespace": "Team", "object": "team-1", "relation": "member"},
    )
    assert captured["subject_set"] == {
        "namespace": "Team",
        "object": "team-1",
        "relation": "member",
    }
    assert "subject_id" not in captured
    await client.aclose()


async def test_delete_relationship_sends_query_params() -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(dict(request.url.params))
        return httpx.Response(204)

    client = make_client(httpx.MockTransport(handler))
    await client.delete_relationship("Organization", "org-1", "member", "user-1")
    assert captured == {
        "namespace": "Organization",
        "object": "org-1",
        "relation": "member",
        "subject_id": "user-1",
    }
    await client.aclose()


async def test_delete_relationship_with_subject_set_sends_flattened_query_params() -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(dict(request.url.params))
        return httpx.Response(204)

    client = make_client(httpx.MockTransport(handler))
    await client.delete_relationship(
        "Team",
        "team-1",
        "parent",
        subject_set={"namespace": "Organization", "object": "org-1", "relation": ""},
    )
    assert captured == {
        "namespace": "Team",
        "object": "team-1",
        "relation": "parent",
        "subject_set.namespace": "Organization",
        "subject_set.object": "org-1",
        "subject_set.relation": "",
    }
    await client.aclose()


async def test_delete_relationship_treats_404_as_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    client = make_client(httpx.MockTransport(handler))
    await client.delete_relationship("Organization", "org-1", "member", "user-1")
    await client.aclose()
