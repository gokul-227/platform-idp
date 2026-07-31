from __future__ import annotations

import json

import httpx
import pytest

from console_api.kratos_admin_client import (
    IdentityNotFoundError,
    KratosAdminClient,
    SessionNotFoundError,
)


def make_client(handler: httpx.MockTransport) -> KratosAdminClient:
    transport_client = httpx.AsyncClient(base_url="http://kratos:4434", transport=handler)
    return KratosAdminClient("http://kratos:4434", client=transport_client)


async def test_create_identity_sends_traits_and_schema() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(201, json={"id": "id-1", "traits": captured["traits"]})

    client = make_client(httpx.MockTransport(handler))
    identity = await client.create_identity({"email": "a@example.com"})
    assert identity["id"] == "id-1"
    assert captured["schema_id"] == "enterprise_user"
    assert "credentials" not in captured
    await client.aclose()


async def test_create_identity_with_password_sets_credentials() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(201, json={"id": "id-1"})

    client = make_client(httpx.MockTransport(handler))
    await client.create_identity({"email": "a@example.com"}, password="Sup3rSecret!")
    assert captured["credentials"] == {"password": {"config": {"password": "Sup3rSecret!"}}}
    await client.aclose()


async def test_set_identity_state_sends_json_patch() -> None:
    captured: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.extend(json.loads(request.content))
        return httpx.Response(200, json={"id": "id-1", "state": "inactive"})

    client = make_client(httpx.MockTransport(handler))
    identity = await client.set_identity_state("id-1", "inactive")
    assert identity["state"] == "inactive"
    assert captured == [{"op": "replace", "path": "/state", "value": "inactive"}]
    await client.aclose()


async def test_set_identity_state_404_raises_not_found() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(IdentityNotFoundError):
        await client.set_identity_state("missing", "active")
    await client.aclose()


async def test_delete_identity_404_raises_not_found() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(IdentityNotFoundError):
        await client.delete_identity("missing")
    await client.aclose()


async def test_delete_identity_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(204)

    client = make_client(httpx.MockTransport(handler))
    await client.delete_identity("id-1")
    await client.aclose()


async def test_revoke_session_success() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        return httpx.Response(204)

    client = make_client(httpx.MockTransport(handler))
    await client.revoke_session("session-1")
    assert calls == ["/admin/sessions/session-1"]
    await client.aclose()


async def test_revoke_session_404_raises_not_found() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(SessionNotFoundError):
        await client.revoke_session("missing")
    await client.aclose()


async def test_revoke_all_sessions_success() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        return httpx.Response(204)

    client = make_client(httpx.MockTransport(handler))
    await client.revoke_all_sessions("id-1")
    assert calls == ["/admin/identities/id-1/sessions"]
    await client.aclose()


async def test_revoke_all_sessions_404_raises_not_found() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(IdentityNotFoundError):
        await client.revoke_all_sessions("missing")
    await client.aclose()


async def test_update_traits_sends_json_patch() -> None:
    captured: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.extend(json.loads(request.content))
        return httpx.Response(200, json={"id": "id-1", "traits": {"email": "new@example.com"}})

    client = make_client(httpx.MockTransport(handler))
    identity = await client.update_traits("id-1", {"email": "new@example.com"})
    assert identity["traits"]["email"] == "new@example.com"
    assert captured == [{"op": "replace", "path": "/traits", "value": {"email": "new@example.com"}}]
    await client.aclose()


async def test_update_traits_404_raises_not_found() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(IdentityNotFoundError):
        await client.update_traits("missing", {"email": "x@example.com"})
    await client.aclose()


async def test_force_verify_patches_every_address() -> None:
    captured: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(
                200,
                json={
                    "id": "id-1",
                    "verifiable_addresses": [
                        {"value": "a@example.com", "verified": False},
                        {"value": "b@example.com", "verified": False},
                    ],
                },
            )
        captured.extend(json.loads(request.content))
        return httpx.Response(200, json={"id": "id-1"})

    client = make_client(httpx.MockTransport(handler))
    await client.force_verify("id-1")
    assert captured == [
        {"op": "replace", "path": "/verifiable_addresses/0/verified", "value": True},
        {"op": "replace", "path": "/verifiable_addresses/0/status", "value": "completed"},
        {"op": "replace", "path": "/verifiable_addresses/1/verified", "value": True},
        {"op": "replace", "path": "/verifiable_addresses/1/status", "value": "completed"},
    ]
    await client.aclose()


async def test_force_verify_no_addresses_is_noop() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        return httpx.Response(200, json={"id": "id-1", "verifiable_addresses": []})

    client = make_client(httpx.MockTransport(handler))
    identity = await client.force_verify("id-1")
    assert identity["id"] == "id-1"
    await client.aclose()


async def test_set_password_fetches_identity_then_puts_full_body() -> None:
    # A JSON Patch on /credentials/password/config/password returns 200
    # but does not actually rehash the credential for real login — this
    # was confirmed live against a real Kratos instance (see
    # kratos_admin_client.py's set_password docstring). Only a full PUT
    # of the identity (preserving schema_id/traits/state) works.
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(
                200,
                json={
                    "id": "id-1",
                    "schema_id": "enterprise_user",
                    "state": "active",
                    "traits": {"email": "a@example.com"},
                },
            )
        assert request.method == "PUT"
        captured.update(json.loads(request.content))
        return httpx.Response(200, json={"id": "id-1"})

    client = make_client(httpx.MockTransport(handler))
    await client.set_password("id-1", "NewPassw0rd!")
    assert captured == {
        "credentials": {"password": {"config": {"password": "NewPassw0rd!"}}},
        "schema_id": "enterprise_user",
        "state": "active",
        "traits": {"email": "a@example.com"},
    }
    await client.aclose()


async def test_set_password_404_raises_not_found() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(IdentityNotFoundError):
        await client.set_password("missing", "NewPassw0rd!")
    await client.aclose()
