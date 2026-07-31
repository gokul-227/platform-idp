from __future__ import annotations

import json

import httpx
import pytest

from console_api.hydra_admin_client import ClientNotFoundError, HydraAdminClient


def make_client(handler: httpx.MockTransport) -> HydraAdminClient:
    transport_client = httpx.AsyncClient(base_url="http://hydra:4445", transport=handler)
    return HydraAdminClient("http://hydra:4445", client=transport_client)


async def test_create_client_posts_payload() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(201, json={"client_id": "generated-id", **captured})

    client = make_client(httpx.MockTransport(handler))
    result = await client.create_client({"client_name": "Demo"})
    assert result["client_id"] == "generated-id"
    assert captured["client_name"] == "Demo"
    await client.aclose()


async def test_get_client_404_raises_not_found() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(ClientNotFoundError):
        await client.get_client("missing")
    await client.aclose()


async def test_update_client_puts_full_payload() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "PUT"
        return httpx.Response(200, json=json.loads(request.content))

    client = make_client(httpx.MockTransport(handler))
    result = await client.update_client("id-1", {"client_id": "id-1", "client_name": "Renamed"})
    assert result["client_name"] == "Renamed"
    await client.aclose()


async def test_update_client_404_raises_not_found() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(ClientNotFoundError):
        await client.update_client("missing", {"client_id": "missing"})
    await client.aclose()


async def test_patch_client_sends_json_patch_ops() -> None:
    captured: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.extend(json.loads(request.content))
        return httpx.Response(200, json={"client_id": "id-1"})

    client = make_client(httpx.MockTransport(handler))
    await client.patch_client(
        "id-1", [{"op": "replace", "path": "/client_secret", "value": "new-secret"}]
    )
    assert captured == [{"op": "replace", "path": "/client_secret", "value": "new-secret"}]
    await client.aclose()


async def test_delete_client_404_raises_not_found() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(ClientNotFoundError):
        await client.delete_client("missing")
    await client.aclose()


async def test_delete_client_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(204)

    client = make_client(httpx.MockTransport(handler))
    await client.delete_client("id-1")
    await client.aclose()
