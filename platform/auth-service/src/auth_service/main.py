"""OAuth2/OIDC orchestrator bridging Hydra login/consent/logout with Kratos sessions.

Ports platform/auth-service's former TypeScript implementation, with one
deliberate contract change: routes moved from /auth/* to /hydra/* to resolve
a routing collision with auth-ui's self-service UI (also on /auth/*) — see
ory/hydra/config/hydra.yaml's oauth2.urls comment and this service's README.

Known, intentionally-preserved gap: consent is auto-accepted for every
client with every requested scope/audience, with no per-client policy — see
docs/10-reference/repository-audit.md's security section. Fixing that is a Hydra
client-policy design decision for the security-hardening phase, not part of
this port.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse, Response
from prometheus_fastapi_instrumentator import Instrumentator

from auth_service.config import get_settings
from auth_service.hydra_client import HydraAdminClient
from auth_service.kratos_client import KratosAdminClient, KratosFrontendClient
from auth_service.logging_config import configure_logging
from auth_service.telemetry import configure_tracing

settings = get_settings()
logger = configure_logging("auth-service", settings.log_level)


def _display_name(traits: dict[str, object]) -> str | None:
    """Flatten the identity schema's `name` trait into a non-empty string.

    The OIDC `name` claim MUST be a string (OpenID Connect Core 5.1); this
    platform's identity schema stores it as `{"first": ..., "last": ...}`.
    Passing the raw dict straight through as a claim value produced a claim
    an RP could see but not use — Mealie's authlib client treats a non-string
    `name` as empty and refuses to complete login ("[OIDC] Required claim
    'name' is empty", confirmed live). Every consumer of this context
    (Node's openid-client, Python's Authlib, Mealie) expects a flat string,
    so build one here rather than at each RP.

    First/last name are NOT required on the registration form — most real
    signups skip them — so this must never return None/empty in that case
    either: confirmed live that a real signup with no name at all hit the
    exact same "[OIDC] Required claim 'name' is empty" failure in Mealie.
    Falls back to the email's local-part (before the @) as a display name.
    """
    name = traits.get("name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    if isinstance(name, dict):
        parts = [str(name[k]) for k in ("first", "last") if name.get(k)]
        joined = " ".join(parts).strip()
        if joined:
            return joined
    email = traits.get("email")
    if isinstance(email, str) and email:
        return email.split("@")[0]
    return None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.hydra = HydraAdminClient(settings.hydra_admin_url)
    app.state.kratos = KratosFrontendClient(settings.kratos_public_url)
    app.state.kratos_admin = KratosAdminClient(settings.kratos_admin_url)
    try:
        yield
    finally:
        await app.state.hydra.aclose()
        await app.state.kratos.aclose()
        await app.state.kratos_admin.aclose()


app = FastAPI(title="auth-service", lifespan=lifespan)
Instrumentator().instrument(app).expose(app)
configure_tracing(app, settings)


@app.get("/hydra/login")
async def login(request: Request, login_challenge: str | None = None) -> Response:
    if not login_challenge:
        logger.warning("Login flow triggered without challenge parameter")
        return PlainTextResponse("Missing login challenge", status_code=400)

    hydra: HydraAdminClient = request.app.state.hydra
    kratos: KratosFrontendClient = request.app.state.kratos

    try:
        challenge_info = await hydra.get_login_request(login_challenge)

        if challenge_info.get("skip"):
            subject = challenge_info["subject"]
            logger.info("Hydra login skipped; user already authenticated", subject=subject)
            # Even on a remembered login, resolve the Kratos session to
            # rebuild the email/name `context` — Hydra does NOT carry the
            # previous login's context forward to a skipped login's consent
            # challenge, so without this every remembered login mints ID
            # tokens with email/name = null (confirmed live: fresh login
            # had email, the very next remembered login didn't).
            body: dict[str, object] = {"subject": subject}
            try:
                skip_session = await kratos.to_session(request.headers.get("cookie", ""))
                identity = skip_session.get("identity") if skip_session else None
                traits = identity.get("traits") if isinstance(identity, dict) else None
                if isinstance(traits, dict):
                    body["context"] = {
                        "email": traits.get("email"),
                        "name": _display_name(traits),
                    }
            except Exception:  # noqa: BLE001 - context is best-effort on skip
                logger.debug("Could not resolve Kratos session for skip-login context")
            accept = await hydra.accept_login_request(login_challenge, body)
            return RedirectResponse(accept["redirect_to"], status_code=302)

        cookie_header = request.headers.get("cookie", "")
        session: dict[str, object] | None = None
        try:
            session = await kratos.to_session(cookie_header)
        except Exception:  # noqa: BLE001 - user is simply not authenticated in Kratos
            logger.debug("Kratos session check failed; user must log in")

        if session:
            identity = session.get("identity")
            subject = identity.get("id") if isinstance(identity, dict) else None
            if subject:
                logger.info(
                    "User session resolved via Kratos; accepting Hydra login", subject=subject
                )
                # Carried forward as `context` on the consent challenge — the
                # consent handler below reads it to populate the ID token's
                # email/name claims. Without this, every ID token has
                # email/name = null regardless of requested scope, since
                # Hydra has no notion of Kratos identity traits on its own.
                traits = identity.get("traits") if isinstance(identity, dict) else None
                traits = traits if isinstance(traits, dict) else {}
                accept = await hydra.accept_login_request(
                    login_challenge,
                    {
                        "subject": subject,
                        "remember": True,
                        "remember_for": 3600,
                        "context": {
                            "email": traits.get("email"),
                            "name": _display_name(traits),
                        },
                    },
                )
                return RedirectResponse(accept["redirect_to"], status_code=302)

        kratos_login_url = (
            f"{settings.public_base_url}/.ory/kratos/public/self-service/login/browser"
            f"?login_challenge={login_challenge}"
        )
        logger.info("Redirecting to Kratos public login page", url=kratos_login_url)
        return RedirectResponse(kratos_login_url, status_code=302)
    except Exception as error:  # noqa: BLE001 - top-level flow error boundary, matches original
        logger.error("Error during login challenge reconciliation", error=str(error))
        return RedirectResponse("/hydra/error?error=login_failed", status_code=302)


@app.get("/hydra/consent")
async def consent(request: Request, consent_challenge: str | None = None) -> Response:
    if not consent_challenge:
        return PlainTextResponse("Missing consent challenge", status_code=400)

    hydra: HydraAdminClient = request.app.state.hydra
    kratos_admin: KratosAdminClient = request.app.state.kratos_admin

    try:
        challenge_info = await hydra.get_consent_request(consent_challenge)

        requested_scope = challenge_info.get("requested_scope") or []
        requested_audience = challenge_info.get("requested_access_token_audience") or []
        context = challenge_info.get("context") or {}

        # Kratos's own oauth2_provider integration (required so
        # /self-service/login/browser?login_challenge=... doesn't 500 on a
        # FRESH login) completes the login challenge itself once the user
        # submits credentials directly to Kratos's login flow action —
        # bypassing /hydra/login's context-building entirely, so
        # `context` is empty here even though the login definitely
        # succeeded. Fall back to an admin identity lookup by subject
        # (Hydra's subject IS the Kratos identity ID) rather than leaving
        # every ID token's email/name null.
        if not context.get("email"):
            subject = challenge_info.get("subject")
            if subject:
                identity = await kratos_admin.get_identity(subject)
                traits = identity.get("traits") if isinstance(identity, dict) else None
                if isinstance(traits, dict):
                    context = {
                        "email": traits.get("email"),
                        "name": _display_name(traits),
                    }

        logger.info(
            "Auto-accepting consent for client",
            client_id=(challenge_info.get("client") or {}).get("client_id"),
            scopes=requested_scope,
        )

        accept = await hydra.accept_consent_request(
            consent_challenge,
            {
                "grant_scope": requested_scope,
                "grant_access_token_audience": requested_audience,
                "session": {
                    "id_token": {
                        "email": context.get("email"),
                        "name": context.get("name"),
                    }
                },
                "remember": True,
                "remember_for": 3600,
            },
        )
        return RedirectResponse(accept["redirect_to"], status_code=302)
    except Exception as error:  # noqa: BLE001 - top-level flow error boundary, matches original
        logger.error("Error during consent flow processing", error=str(error))
        return RedirectResponse("/hydra/error?error=consent_failed", status_code=302)


@app.get("/hydra/logout")
async def logout(request: Request, logout_challenge: str | None = None) -> Response:
    if not logout_challenge:
        return PlainTextResponse("Missing logout challenge", status_code=400)

    hydra: HydraAdminClient = request.app.state.hydra

    try:
        logger.info("Processing logout request")
        accept = await hydra.accept_logout_request(logout_challenge)
        return RedirectResponse(accept["redirect_to"], status_code=302)
    except Exception as error:  # noqa: BLE001 - top-level flow error boundary, matches original
        logger.error("Error during logout flow processing", error=str(error))
        return RedirectResponse("/hydra/error?error=logout_failed", status_code=302)


@app.get("/hydra/error")
async def auth_error(error: str | None = None) -> PlainTextResponse:
    return PlainTextResponse(f"Authentication error: {error or 'unknown'}", status_code=500)


@app.get("/healthz")
async def healthz() -> JSONResponse:
    return JSONResponse(status_code=200, content={"status": "healthy", "service": "auth-service"})
