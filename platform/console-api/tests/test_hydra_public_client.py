from __future__ import annotations

import httpx
import pytest

from console_api.hydra_public_client import HydraPublicClient, TokenRequestError


def make_client(handler: httpx.MockTransport) -> HydraPublicClient:
    transport_client = httpx.AsyncClient(base_url="http://hydra:4444", transport=handler)
    return HydraPublicClient("http://hydra:4444", client=transport_client)


async def test_client_credentials_token_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"access_token": "tok", "token_type": "bearer"})

    client = make_client(httpx.MockTransport(handler))
    token = await client.client_credentials_token("client-1", "secret", "openid")
    assert token["access_token"] == "tok"
    await client.aclose()


async def test_client_credentials_token_sends_form_body() -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(dict(x.split("=") for x in request.content.decode().split("&")))
        return httpx.Response(200, json={"access_token": "tok"})

    client = make_client(httpx.MockTransport(handler))
    await client.client_credentials_token("client-1", "s3cret", "openid profile")
    assert captured["grant_type"] == "client_credentials"
    assert captured["client_id"] == "client-1"
    await client.aclose()


async def test_client_credentials_token_failure_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "invalid_client"})

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(TokenRequestError) as excinfo:
        await client.client_credentials_token("client-1", "wrong", "openid")
    assert excinfo.value.status_code == 401
    assert excinfo.value.body["error"] == "invalid_client"
    await client.aclose()


async def test_authorization_code_token_sends_pkce_form_body() -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(dict(x.split("=") for x in request.content.decode().split("&")))
        return httpx.Response(200, json={"access_token": "tok", "refresh_token": "rt"})

    client = make_client(httpx.MockTransport(handler))
    token = await client.authorization_code_token(
        "client-1", "auth-code", "http://localhost/callback", "verifier-value"
    )
    assert token["access_token"] == "tok"
    assert captured["grant_type"] == "authorization_code"
    assert captured["code"] == "auth-code"
    assert captured["code_verifier"] == "verifier-value"
    assert "client_secret" not in captured
    await client.aclose()


async def test_authorization_code_token_failure_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "invalid_grant"})

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(TokenRequestError) as excinfo:
        await client.authorization_code_token("client-1", "bad-code", "http://localhost/cb", "v")
    assert excinfo.value.status_code == 400
    await client.aclose()


async def test_refresh_token_sends_form_body() -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(dict(x.split("=") for x in request.content.decode().split("&")))
        return httpx.Response(200, json={"access_token": "new-tok"})

    client = make_client(httpx.MockTransport(handler))
    token = await client.refresh_token("client-1", "refresh-value")
    assert token["access_token"] == "new-tok"
    assert captured["grant_type"] == "refresh_token"
    assert captured["refresh_token"] == "refresh-value"
    await client.aclose()


async def test_refresh_token_failure_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "invalid_grant"})

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(TokenRequestError):
        await client.refresh_token("client-1", "expired")
    await client.aclose()
