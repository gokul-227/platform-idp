from __future__ import annotations

import json

import httpx
import pytest

from hooks_service.keto_client import KetoWriteClient


def make_client(handler: httpx.MockTransport) -> KetoWriteClient:
    transport_client = httpx.AsyncClient(base_url="http://keto:4467", transport=handler)
    return KetoWriteClient("http://keto:4467", client=transport_client)


async def test_write_organization_membership_member_role_writes_one_tuple() -> None:
    calls: list[bytes] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.content)
        return httpx.Response(201)

    client = make_client(httpx.MockTransport(handler))
    await client.write_organization_membership("org-1", "user-1", "member")
    assert len(calls) == 1
    await client.aclose()


async def test_write_organization_membership_admin_role_writes_admin_and_member_tuples() -> None:
    relations: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        relations.append(body["relation"])
        return httpx.Response(201)

    client = make_client(httpx.MockTransport(handler))
    await client.write_organization_membership("org-1", "user-1", "admin")
    assert relations == ["admin", "member"]
    await client.aclose()


async def test_create_relationship_raises_on_http_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(httpx.HTTPStatusError):
        await client.create_relationship("Organization", "org-1", "member", "user-1")
    await client.aclose()


async def test_grant_platform_admin_writes_admin_and_member_tuples() -> None:
    calls: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        calls.append((body["object"], body["relation"]))
        return httpx.Response(201)

    client = make_client(httpx.MockTransport(handler))
    await client.grant_platform_admin("user-1")
    assert calls == [("platform", "admin"), ("platform", "member")]
    await client.aclose()


async def test_revoke_platform_admin_deletes_admin_and_member_tuples() -> None:
    deleted: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        deleted.append(dict(request.url.params)["relation"])
        return httpx.Response(204)

    client = make_client(httpx.MockTransport(handler))
    await client.revoke_platform_admin("user-1")
    assert deleted == ["admin", "member"]
    await client.aclose()


async def test_delete_relationship_treats_404_as_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    client = make_client(httpx.MockTransport(handler))
    await client.delete_relationship("Organization", "platform", "admin", "user-1")
    await client.aclose()


def _patch_read_client(monkeypatch: pytest.MonkeyPatch, handler: object) -> None:
    real_async_client = httpx.AsyncClient

    def factory(*args: object, **kwargs: object) -> httpx.AsyncClient:
        kwargs["transport"] = httpx.MockTransport(handler)  # type: ignore[arg-type]
        return real_async_client(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr("hooks_service.keto_client.httpx.AsyncClient", factory)


async def test_has_any_platform_admin_true_when_tuples_exist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"relation_tuples": [{"subject_id": "user-1"}]})

    _patch_read_client(monkeypatch, handler)
    client = make_client(httpx.MockTransport(lambda r: httpx.Response(200)))
    assert await client.has_any_platform_admin("http://keto:4466") is True
    await client.aclose()


async def test_has_any_platform_admin_false_when_no_tuples(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"relation_tuples": []})

    _patch_read_client(monkeypatch, handler)
    client = make_client(httpx.MockTransport(lambda r: httpx.Response(200)))
    assert await client.has_any_platform_admin("http://keto:4466") is False
    await client.aclose()
