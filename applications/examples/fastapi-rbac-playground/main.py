"""FastAPI RBAC Playground — a real OIDC relying party for validating this
platform's authorization layer (Hydra token introspection + Keto ReBAC
checks), not a product. Signs in through the real login flow like every
other sample app, then exercises real Hydra/Keto endpoints using the
session's own access token — nothing pasted in manually, nothing simulated.

Server-side calls (token exchange, userinfo) go to Oathkeeper's internal
Docker network address (OATHKEEPER_INTERNAL_URL); browser-facing redirects
use the public address (OATHKEEPER_PUBLIC_URL) — the same container-vs-browser
distinction already handled correctly in Flask Identity Viewer and Streamlit
Enterprise Portal (see docs/10-reference/ai-handoff.md's token-exchange note).
"""

import base64
import hashlib
import json
import os
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

app = FastAPI(title="FastAPI RBAC Playground")
app.add_middleware(SessionMiddleware, secret_key=os.environ.get("FASTAPI_SESSION_SECRET", "dev-secret-change-me"))

PUBLIC_URL = os.environ.get("OATHKEEPER_PUBLIC_URL", "http://localhost:4455")
INTERNAL_URL = os.environ.get("OATHKEEPER_INTERNAL_URL", "http://oathkeeper:4455")
HYDRA_ADMIN_URL = os.environ.get("HYDRA_ADMIN_URL", "http://hydra:4445")
KETO_READ_URL = os.environ.get("KETO_READ_URL", "http://keto:4466")
CLIENT_ID = os.environ.get("OIDC_CLIENT_ID", "fastapi-rbac-playground")
CLIENT_SECRET = os.environ.get("OIDC_CLIENT_SECRET", "")
SELF_URL = os.environ.get("SELF_URL", "http://localhost:9932")
REDIRECT_URI = f"{SELF_URL}/callback"


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def decode_jwt_payload(token: str) -> dict:
    try:
        parts = token.split(".")
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(padded))
    except Exception as error:  # noqa: BLE001 - display-only decoding, never fatal
        return {"decode_error": str(error)}


async def introspect(token: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(f"{HYDRA_ADMIN_URL}/admin/oauth2/introspect", data={"token": token})
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Hydra introspection request failed")
    return resp.json()


async def keto_check(namespace: str, obj: str, relation: str, subject_id: str) -> bool:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{KETO_READ_URL}/relation-tuples/check",
            json={"namespace": namespace, "object": obj, "relation": relation, "subject_id": subject_id},
        )
    # Keto answers 403 for "denied" and 200 for "allowed" — both carry a real
    # `allowed` boolean body (confirmed live elsewhere in this repo).
    if resp.status_code not in (200, 403):
        raise HTTPException(status_code=502, detail="Keto check request failed")
    return resp.json().get("allowed", False)


async def keto_tuples_for(subject_id: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{KETO_READ_URL}/relation-tuples", params={"subject_id": subject_id, "page_size": 50})
    if resp.status_code != 200:
        return []
    return resp.json().get("relation_tuples", [])


def require_session_token(request: Request) -> str:
    tokens = request.session.get("tokens")
    if not tokens or not tokens.get("access_token"):
        raise HTTPException(status_code=401, detail="Not signed in — go to / and sign in first")
    return tokens["access_token"]


PAGE_STYLE = """
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
  pre { background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 12px; padding: 16px; overflow-x: auto; font-size: 0.8rem; }
  a.button, button.button { display: inline-block; background: #111; color: #fff; padding: 8px 16px; border-radius: 999px; text-decoration: none; font-size: 0.9rem; border: none; cursor: pointer; margin: 4px 4px 4px 0; }
  table { border-collapse: collapse; width: 100%; } td, th { text-align: left; padding: 4px 8px; border-bottom: 1px solid #eee; font-size: 0.85rem; }
</style>
"""


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "healthy", "service": "fastapi-rbac-playground"}


@app.get("/login")
async def login(request: Request) -> RedirectResponse:
    state = secrets.token_urlsafe(16)
    verifier = secrets.token_urlsafe(64)
    challenge = b64url(hashlib.sha256(verifier.encode("ascii")).digest())
    request.session["state"] = state
    request.session["verifier"] = verifier

    params = {
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "scope": "openid profile email offline_access",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return RedirectResponse(f"{PUBLIC_URL}/oauth2/auth?{urlencode(params)}")


@app.get("/callback")
async def callback(request: Request) -> HTMLResponse:
    params = request.query_params
    error = params.get("error")
    if error:
        return HTMLResponse(f"{PAGE_STYLE}<h1>Login failed</h1><pre>{error}: {params.get('error_description', '')}</pre>")

    if params.get("state") != request.session.get("state"):
        return HTMLResponse(f"{PAGE_STYLE}<h1>Login failed</h1><pre>State mismatch — possible CSRF, or an expired session.</pre>")

    code = params["code"]
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{INTERNAL_URL}/oauth2/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": REDIRECT_URI,
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "code_verifier": request.session["verifier"],
            },
        )
    if resp.status_code != 200:
        return HTMLResponse(f"{PAGE_STYLE}<h1>Token exchange failed</h1><pre>HTTP {resp.status_code}\n{resp.text}</pre>")

    tokens = resp.json()
    request.session["tokens"] = tokens

    async with httpx.AsyncClient(timeout=10) as client:
        userinfo_resp = await client.get(
            f"{INTERNAL_URL}/userinfo", headers={"Authorization": f"Bearer {tokens['access_token']}"}
        )
    userinfo = userinfo_resp.json() if userinfo_resp.status_code == 200 else {"error": userinfo_resp.text}
    request.session["userinfo"] = userinfo

    return RedirectResponse("/")


@app.get("/logout")
async def logout(request: Request) -> RedirectResponse:
    request.session.clear()
    return RedirectResponse("/")


@app.get("/api/public")
async def public_endpoint() -> dict:
    """No auth required — always 200. A control case for comparison."""
    return {"message": "This endpoint requires no authentication.", "status": "ok"}


@app.get("/api/protected")
async def protected_endpoint(request: Request) -> dict:
    """Requires the signed-in session's real, active Hydra-issued access token."""
    token = require_session_token(request)
    claims = await introspect(token)
    if not claims.get("active"):
        raise HTTPException(status_code=401, detail="Token is not active (expired, revoked, or invalid)")
    return {"message": "Token is valid and active.", "subject": claims.get("sub"), "scope": claims.get("scope")}


@app.get("/api/admin-only")
async def admin_only_endpoint(request: Request) -> dict:
    """Requires a valid session token AND Organization:platform#admin in Keto — real 403 if denied."""
    token = require_session_token(request)
    claims = await introspect(token)
    if not claims.get("active"):
        raise HTTPException(status_code=401, detail="Token is not active (expired, revoked, or invalid)")
    subject_id = claims.get("sub")
    allowed = await keto_check("Organization", "platform", "admin", subject_id)
    if not allowed:
        raise HTTPException(status_code=403, detail=f"{subject_id} does not hold Organization:platform#admin")
    return {"message": "You are a platform administrator.", "subject": subject_id}


@app.get("/api/organizations/{org_id}/view")
async def org_view_endpoint(org_id: str, request: Request) -> dict:
    """Requires a valid session token AND Organization:{org_id}#member (or admin) in Keto."""
    token = require_session_token(request)
    claims = await introspect(token)
    if not claims.get("active"):
        raise HTTPException(status_code=401, detail="Token is not active (expired, revoked, or invalid)")
    subject_id = claims.get("sub")
    allowed = await keto_check("Organization", org_id, "member", subject_id)
    if not allowed:
        raise HTTPException(status_code=403, detail=f"{subject_id} cannot view Organization:{org_id}")
    return {"message": f"You can view organization {org_id}.", "subject": subject_id}


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> str:
    tokens = request.session.get("tokens")

    if not tokens:
        return f"""{PAGE_STYLE}
        <h1>FastAPI RBAC Playground</h1>
        <p>A real OIDC relying party for exercising this platform's authorization layer — sign
        in, then every button below hits a real endpoint that calls Hydra's introspection API
        and/or Keto's check API using your own session's real access token.</p>
        <a class="button" href="/login">Sign in</a>
        """

    id_claims = decode_jwt_payload(tokens["id_token"]) if tokens.get("id_token") else {}
    userinfo = request.session.get("userinfo", {})
    subject_id = userinfo.get("sub") or id_claims.get("sub", "")
    keto_tuples = await keto_tuples_for(subject_id) if subject_id else []

    tuples_html = "".join(
        f"<tr><td>{t.get('namespace')}</td><td>{t.get('object')}</td><td>{t.get('relation')}</td></tr>"
        for t in keto_tuples
    ) or "<tr><td colspan='3'>No relation tuples for this identity.</td></tr>"

    return f"""{PAGE_STYLE}
    <h1>FastAPI RBAC Playground</h1>
    <p>Signed in as <strong>{userinfo.get('email', id_claims.get('email', '(unknown)'))}</strong>
    &middot; <a href="/logout">Sign out</a></p>

    <h2>Userinfo (real /userinfo response)</h2>
    <pre>{json.dumps(userinfo, indent=2)}</pre>

    <h2>ID token claims (decoded, not verified)</h2>
    <pre>{json.dumps(id_claims, indent=2)}</pre>

    <h2>Real Keto relation tuples for this identity — your groups/roles/permissions</h2>
    <table><tr><th>Namespace</th><th>Object</th><th>Relation</th></tr>{tuples_html}</table>

    <h2>RBAC test buttons (using your real session token — no pasting needed)</h2>
    <div>
      <button class="button" onclick="call('/api/public')">GET /api/public (no auth)</button>
      <button class="button" onclick="call('/api/protected')">GET /api/protected</button>
      <button class="button" onclick="call('/api/admin-only')">GET /api/admin-only</button>
      <button class="button" onclick="call('/api/organizations/platform/view')">GET /api/organizations/platform/view</button>
    </div>
    <pre id="result">Result will appear here.</pre>
    <script>
      async function call(path) {{
        const res = await fetch(path, {{ credentials: 'same-origin' }});
        const body = await res.json().catch(() => ({{}}));
        document.getElementById('result').textContent =
          'HTTP ' + res.status + '\\n' + JSON.stringify(body, null, 2);
      }}
    </script>
    """
