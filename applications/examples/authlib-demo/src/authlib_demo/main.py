"""Reference OIDC client for the Enterprise Identity Platform, built on
Authlib (https://github.com/lepture/authlib) — a widely-used, actively
maintained OAuth/OIDC library for Python. This is a thin adapter, not a
fork: all OIDC/PKCE logic comes from the library's Starlette/FastAPI
integration (authlib.integrations.starlette_client).

Demonstrates: authorization code + PKCE, ID token claims (org/role,
injected by auth-service's login context), a protected-API call through
Oathkeeper's oauth2_introspection + remote_json (Keto) chain, and
RP-initiated logout.
"""

from __future__ import annotations

import os

import httpx
from authlib.integrations.starlette_client import OAuth
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

ISSUER_URL = os.environ.get("OIDC_ISSUER_URL", "http://localhost:4455")
CLIENT_ID = os.environ.get("OIDC_CLIENT_ID", "authlib-demo")
CLIENT_SECRET = os.environ.get("OIDC_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("OIDC_REDIRECT_URI", "http://localhost:3200/callback")
PLATFORM_API_URL = os.environ.get("PLATFORM_API_URL", "http://localhost:4455/api/v1/apps/")
SESSION_SECRET = os.environ.get("SESSION_SECRET", "dev-only-change-me")

app = FastAPI(title="authlib-demo")
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET)

oauth = OAuth()
oauth.register(
    name="platform",
    client_id=CLIENT_ID,
    client_secret=CLIENT_SECRET,
    server_metadata_url=f"{ISSUER_URL}/.well-known/openid-configuration",
    # - scope: org/role membership arrives as an ID token CLAIM (via
    #   auth-service's login context), not a separate OAuth scope — there
    #   is no "organization" scope registered on any Hydra client.
    # - code_challenge_method: this platform's Hydra enforces PKCE for ALL
    #   clients (oauth2.pkce.enforced: true in ory/hydra/config/
    #   hydra.yaml.tmpl); Authlib only sends a code_challenge when this is
    #   set — without it, every authorize request 303s back with
    #   invalid_request ("Clients must include a code_challenge").
    # - token_endpoint_auth_method: must match how the Hydra client was
    #   registered (this repo's registry/app-registry convention is
    #   client_secret_post); Authlib defaults to client_secret_basic,
    #   which Hydra rejects with invalid_client.
    client_kwargs={
        "scope": "openid profile email",
        "code_challenge_method": "S256",
        "token_endpoint_auth_method": "client_secret_post",
    },
)


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> str:
    claims = request.session.get("claims")
    if claims:
        return (
            f"<h1>Logged in</h1><pre>{claims}</pre>"
            '<a href="/api-call">Call protected platform API</a> | <a href="/logout">Logout</a>'
        )
    return '<a href="/login">Login</a>'


@app.get("/login")
async def login(request: Request) -> RedirectResponse:
    return await oauth.platform.authorize_redirect(request, REDIRECT_URI)


@app.get("/callback")
async def callback(request: Request) -> RedirectResponse:
    token = await oauth.platform.authorize_access_token(request)
    request.session["access_token"] = token["access_token"]
    request.session["id_token"] = token.get("id_token")
    request.session["claims"] = token.get("userinfo") or {}
    return RedirectResponse("/")


@app.get("/api-call", response_model=None)
async def api_call(request: Request) -> HTMLResponse | RedirectResponse:
    access_token = request.session.get("access_token")
    if not access_token:
        return RedirectResponse("/login")
    async with httpx.AsyncClient() as client:
        # A 403 here is the CORRECT outcome for a client with no Keto
        # grant on the resource — see Oathkeeper's platform-api-rules
        # (oauth2_introspection + remote_json) in
        # ory/oathkeeper/rules/access-rules.json.
        response = await client.get(
            PLATFORM_API_URL, headers={"Authorization": f"Bearer {access_token}"}
        )
    return HTMLResponse(
        f"<h1>Platform API response</h1><p>Status: {response.status_code}</p>"
        f"<pre>{response.text}</pre><a href='/'>Back</a>"
    )


@app.get("/logout")
async def logout(request: Request) -> RedirectResponse:
    id_token = request.session.get("id_token")
    request.session.clear()
    if id_token:
        end_session_url = (
            f"{ISSUER_URL}/oauth2/sessions/logout"
            f"?id_token_hint={id_token}&post_logout_redirect_uri=http://localhost:3200/"
        )
        return RedirectResponse(end_session_url)
    return RedirectResponse("/")
