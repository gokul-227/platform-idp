"""Flask Identity Viewer — a real relying party for validating this platform's
identity flow end to end. Shows exactly what a real login produces: ID token,
access token, refresh token, decoded JWT claims, Kratos session info, and
this identity's real Keto groups/roles/permissions — nothing fabricated.

Server-side calls (token exchange, userinfo, refresh) go to Oathkeeper's
internal Docker network address (OATHKEEPER_INTERNAL_URL); browser-facing
redirects use the public address (OATHKEEPER_PUBLIC_URL) — the same
container-vs-browser distinction documented elsewhere in this repo (see
docs/10-reference/ai-handoff.md's neobim-ui/Mealie token-exchange note) and
deliberately handled correctly here rather than repeating that bug.
"""

import base64
import hashlib
import json
import os
import secrets

import requests
from flask import Flask, redirect, request, session, url_for

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")

PUBLIC_URL = os.environ.get("OATHKEEPER_PUBLIC_URL", "http://localhost:4455")
INTERNAL_URL = os.environ.get("OATHKEEPER_INTERNAL_URL", "http://oathkeeper:4455")
CLIENT_ID = os.environ.get("OIDC_CLIENT_ID", "flask-identity-viewer")
CLIENT_SECRET = os.environ.get("OIDC_CLIENT_SECRET", "")
SELF_URL = os.environ.get("SELF_URL", "http://localhost:9931")
REDIRECT_URI = f"{SELF_URL}/callback"
KETO_READ_URL = os.environ.get("KETO_READ_URL", "http://keto:4466")


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def decode_jwt_payload(token: str) -> dict:
    try:
        parts = token.split(".")
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(padded))
    except Exception as error:  # noqa: BLE001 - display-only decoding, never fatal
        return {"decode_error": str(error)}


PAGE_STYLE = """
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
  pre { background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 12px; padding: 16px; overflow-x: auto; font-size: 0.8rem; }
  a.button { display: inline-block; background: #111; color: #fff; padding: 8px 16px; border-radius: 999px; text-decoration: none; font-size: 0.9rem; }
  .badge { display: inline-block; background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 999px; padding: 2px 10px; font-size: 0.75rem; margin: 2px; }
  table { border-collapse: collapse; width: 100%; } td, th { text-align: left; padding: 4px 8px; border-bottom: 1px solid #eee; font-size: 0.85rem; }
</style>
"""


@app.route("/")
def index() -> str:
    if "tokens" not in session:
        return f"""{PAGE_STYLE}
        <h1>Flask Identity Viewer</h1>
        <p>A real OIDC relying party used to validate this platform's identity flow —
        not a product, a test harness. Sign in to see the exact tokens and claims
        a successful login produces.</p>
        <a class="button" href="{url_for('login')}">Sign in</a>
        """

    tokens = session["tokens"]
    id_claims = decode_jwt_payload(tokens["id_token"]) if tokens.get("id_token") else {}
    access_claims = decode_jwt_payload(tokens["access_token"]) if tokens.get("access_token") else {}
    userinfo = session.get("userinfo", {})
    keto_tuples = session.get("keto_tuples", [])

    tuples_html = "".join(
        f"<tr><td>{t.get('namespace')}</td><td>{t.get('object')}</td><td>{t.get('relation')}</td></tr>"
        for t in keto_tuples
    ) or "<tr><td colspan='3'>No relation tuples for this identity.</td></tr>"

    return f"""{PAGE_STYLE}
    <h1>Flask Identity Viewer</h1>
    <p>Signed in as <strong>{userinfo.get('email', id_claims.get('email', '(unknown)'))}</strong>
    &middot; <a href="{url_for('refresh')}">Refresh token</a>
    &middot; <a href="{url_for('logout')}">Sign out</a></p>

    <h2>Userinfo (real /userinfo response)</h2>
    <pre>{json.dumps(userinfo, indent=2)}</pre>

    <h2>ID token claims (decoded, not verified — see Developer Portal for a
    signature-verifying decoder)</h2>
    <pre>{json.dumps(id_claims, indent=2)}</pre>

    <h2>Access token claims</h2>
    <pre>{json.dumps(access_claims, indent=2) if access_claims else "(access token is opaque, not a JWT, or has no claims to decode)"}</pre>

    <h2>Raw tokens</h2>
    <pre>ID token:      {tokens.get('id_token', '(none)')}
Access token:  {tokens.get('access_token', '(none)')}
Refresh token: {tokens.get('refresh_token', '(none, offline_access scope was not granted)')}
Token type:    {tokens.get('token_type')}
Expires in:    {tokens.get('expires_in')}s</pre>

    <h2>Real Keto relation tuples for this identity (subject_id lookup, live)</h2>
    <table><tr><th>Namespace</th><th>Object</th><th>Relation</th></tr>{tuples_html}</table>
    """


@app.route("/login")
def login() -> "redirect":
    state = secrets.token_urlsafe(16)
    verifier = secrets.token_urlsafe(64)
    challenge = b64url(hashlib.sha256(verifier.encode("ascii")).digest())
    session["state"] = state
    session["verifier"] = verifier

    params = {
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "scope": "openid profile email offline_access",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    query = "&".join(f"{k}={requests.utils.quote(v)}" for k, v in params.items())
    return redirect(f"{PUBLIC_URL}/oauth2/auth?{query}")


@app.route("/callback")
def callback() -> str:
    error = request.args.get("error")
    if error:
        return f"{PAGE_STYLE}<h1>Login failed</h1><pre>{error}: {request.args.get('error_description', '')}</pre>"

    if request.args.get("state") != session.get("state"):
        return f"{PAGE_STYLE}<h1>Login failed</h1><pre>State mismatch — possible CSRF, or an expired session.</pre>"

    code = request.args["code"]
    resp = requests.post(
        f"{INTERNAL_URL}/oauth2/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "code_verifier": session["verifier"],
        },
        timeout=10,
    )
    if not resp.ok:
        return f"{PAGE_STYLE}<h1>Token exchange failed</h1><pre>HTTP {resp.status_code}\n{resp.text}</pre>"

    tokens = resp.json()
    session["tokens"] = tokens

    userinfo_resp = requests.get(
        f"{INTERNAL_URL}/userinfo",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
        timeout=10,
    )
    userinfo = userinfo_resp.json() if userinfo_resp.ok else {"error": userinfo_resp.text}
    session["userinfo"] = userinfo

    subject_id = userinfo.get("sub")
    keto_tuples = []
    if subject_id:
        try:
            keto_resp = requests.get(
                f"{KETO_READ_URL}/relation-tuples",
                params={"subject_id": subject_id, "page_size": 50},
                timeout=5,
            )
            if keto_resp.ok:
                keto_tuples = keto_resp.json().get("relation_tuples", [])
        except requests.RequestException:
            pass
    session["keto_tuples"] = keto_tuples

    return redirect(url_for("index"))


@app.route("/refresh")
def refresh() -> str:
    tokens = session.get("tokens", {})
    if not tokens.get("refresh_token"):
        return f"{PAGE_STYLE}<p>No refresh token available (offline_access scope wasn't granted, or you're not signed in).</p><a href='/'>Back</a>"

    resp = requests.post(
        f"{INTERNAL_URL}/oauth2/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": tokens["refresh_token"],
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        },
        timeout=10,
    )
    if not resp.ok:
        return f"{PAGE_STYLE}<h1>Refresh failed</h1><pre>HTTP {resp.status_code}\n{resp.text}</pre>"

    session["tokens"] = resp.json()
    return redirect(url_for("index"))


@app.route("/logout")
def logout() -> "redirect":
    session.clear()
    return redirect(url_for("index"))


@app.route("/healthz")
def healthz() -> dict:
    return {"status": "healthy", "service": "flask-identity-viewer"}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=9931)
