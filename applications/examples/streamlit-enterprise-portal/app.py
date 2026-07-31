"""Streamlit Enterprise Portal — a real relying party used to validate this
platform's identity + authorization layers with a business-app-shaped UI
(dashboard + per-department pages), not a product of its own. Every
department page's visibility is gated by a real, live Keto permission check
for the signed-in identity — nothing here is a static mock of "what RBAC
would look like."
"""

import base64
import hashlib
import json
import os
import secrets

import httpx
import streamlit as st

PUBLIC_URL = os.environ.get("OATHKEEPER_PUBLIC_URL", "http://localhost:4455")
INTERNAL_URL = os.environ.get("OATHKEEPER_INTERNAL_URL", "http://oathkeeper:4455")
CLIENT_ID = os.environ.get("OIDC_CLIENT_ID", "streamlit-enterprise-portal")
CLIENT_SECRET = os.environ.get("OIDC_CLIENT_SECRET", "")
SELF_URL = os.environ.get("SELF_URL", "http://localhost:9933")
KETO_READ_URL = os.environ.get("KETO_READ_URL", "http://keto:4466")

st.set_page_config(page_title="NeoBIM Enterprise Portal", layout="wide")


def decode_jwt_payload(token: str) -> dict:
    try:
        parts = token.split(".")
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(padded))
    except Exception:  # noqa: BLE001 - display-only
        return {}


def keto_check(namespace: str, obj: str, relation: str, subject_id: str) -> bool:
    try:
        resp = httpx.post(
            f"{KETO_READ_URL}/relation-tuples/check",
            json={"namespace": namespace, "object": obj, "relation": relation, "subject_id": subject_id},
            timeout=5,
        )
        if resp.status_code in (200, 403):
            return resp.json().get("allowed", False)
    except httpx.RequestError:
        pass
    return False


def exchange_code(code: str, verifier: str) -> dict | None:
    resp = httpx.post(
        f"{INTERNAL_URL}/oauth2/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": f"{SELF_URL}/",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "code_verifier": verifier,
        },
        timeout=10,
    )
    if resp.status_code != 200:
        st.error(f"Token exchange failed: HTTP {resp.status_code} — {resp.text}")
        return None
    return resp.json()


# --- Handle the OIDC callback (Hydra redirects back with ?code=&state=...) ---
# The sign-in link opens in a new browser tab (Streamlit's own st.link_button
# behavior), which gets a fresh server-side session with no access to the
# original tab's st.session_state — so the PKCE verifier can't be stashed
# there. Confirmed live: Hydra also enforces PKCE for this client regardless
# of it being confidential (code_challenge is mandatory, not optional, on
# this platform's Hydra config). Round-tripping the verifier AS the `state`
# value itself solves both problems at once — Hydra returns `state` verbatim
# on the callback, and a random ≥43-char token satisfies both Hydra's
# state-length requirement and PKCE's verifier-length requirement.
if "tokens" not in st.session_state:
    params = st.query_params
    if "code" in params and "state" in params:
        tokens = exchange_code(params["code"], params["state"])
        if tokens:
            st.session_state["tokens"] = tokens
            st.session_state["claims"] = decode_jwt_payload(tokens.get("id_token", ""))
            st.query_params.clear()
            st.rerun()
    elif "error" in params:
        st.error(f"Login failed: {params.get('error')} — {params.get('error_description', '')}")

# --- Not signed in: show a real sign-in link ---
if "tokens" not in st.session_state:
    st.title("NeoBIM Enterprise Portal")
    st.write(
        "A real OIDC relying party used to validate this platform's login and "
        "authorization layers — every department page below is gated by a real, "
        "live Keto permission check, not a static mock."
    )
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
    authorize_url = (
        f"{PUBLIC_URL}/oauth2/auth?response_type=code&client_id={CLIENT_ID}"
        f"&redirect_uri={SELF_URL}/&scope=openid+profile+email&state={verifier}"
        f"&code_challenge={challenge}&code_challenge_method=S256"
    )
    st.link_button("Sign in", authorize_url)
    st.stop()

# --- Signed in: real claims + real permission-gated navigation ---
claims = st.session_state["claims"]
subject_id = claims.get("sub", "")
email = claims.get("email", "(unknown)")

st.sidebar.title("NeoBIM")
st.sidebar.caption(f"Signed in as {email}")
if st.sidebar.button("Sign out"):
    st.session_state.clear()
    st.rerun()

PAGES = {
    "Dashboard": ("Organization", "platform", "view"),
    "Engineering": ("Team", "engineering", "member"),
    "Finance": ("Team", "finance", "member"),
    "HR": ("Team", "hr", "member"),
    "Platform Admin": ("Organization", "platform", "admin"),
}

visible_pages = {}
for name, (namespace, obj, relation) in PAGES.items():
    allowed = name == "Dashboard" or keto_check(namespace, obj, relation, subject_id)
    visible_pages[name] = allowed

page = st.sidebar.radio(
    "Pages",
    [name for name in PAGES if visible_pages[name]],
)

st.sidebar.divider()
st.sidebar.caption("Pages hidden below require a real Keto tuple you don't hold:")
for name, allowed in visible_pages.items():
    if not allowed:
        st.sidebar.caption(f"🔒 {name}")

st.title(page)

if page == "Dashboard":
    st.write(f"Welcome, **{email}**. This dashboard is visible to anyone with a valid session.")
    cols = st.columns(3)
    cols[0].metric("Your subject ID", subject_id[:8] + "…")
    cols[1].metric("Pages you can access", sum(visible_pages.values()))
    cols[2].metric("Pages restricted", len(visible_pages) - sum(visible_pages.values()))
    st.subheader("Real ID token claims")
    st.json(claims)

elif page == "Engineering":
    st.write("Engineering department view — visible because you hold `Team:engineering#member`.")
    st.metric("Open sprints", "—")
    st.info("This is a real permission-gated page, not a static demo — Streamlit re-checks Keto on every load.")

elif page == "Finance":
    st.write("Finance department view — visible because you hold `Team:finance#member`.")
    st.metric("Budget widgets", "—")

elif page == "HR":
    st.write("HR department view — visible because you hold `Team:hr#member`.")
    st.metric("Headcount widgets", "—")

elif page == "Platform Admin":
    st.write("Platform administration view — visible because you hold `Organization:platform#admin`.")
    st.warning("This mirrors the real Admin Console's own gate (`identity-ui/middleware.ts`) — "
               "same tuple, same check, different application.")
