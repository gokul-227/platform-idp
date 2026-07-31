from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from hooks_service.keto_client import DEFAULT_ORGANIZATION_ROLE, KetoWriteClient
from hooks_service.logging_config import configure_logging, log
from hooks_service.models import LoginWebhookPayload, RegistrationWebhookPayload

logger = configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    keto_write_url = os.environ.get("KETO_WRITE_URL", "http://keto:4467")
    app.state.keto = KetoWriteClient(keto_write_url)
    app.state.keto_read_url = os.environ.get("KETO_READ_URL", "http://keto:4466")
    try:
        yield
    finally:
        await app.state.keto.aclose()


app = FastAPI(title="hooks-service", lifespan=lifespan)
Instrumentator().instrument(app).expose(app)


@app.post("/webhooks/registration")
async def webhooks_registration(payload: RegistrationWebhookPayload) -> JSONResponse:
    identity_id = payload.identity.id
    organization = payload.identity.traits.organization

    log(
        logger,
        logging.INFO,
        "Received registration webhook event",
        identity_id=identity_id,
        schema_id=payload.identity.schema_id,
        email=payload.identity.traits.email,
    )

    if organization is not None and organization.id:
        role = organization.role or DEFAULT_ORGANIZATION_ROLE
        log(
            logger,
            logging.INFO,
            "Registering organization membership in Keto",
            identity_id=identity_id,
            organization_id=organization.id,
            role=role,
        )
        try:
            keto: KetoWriteClient = app.state.keto
            await keto.write_organization_membership(organization.id, identity_id, role)
        except httpx.HTTPError as error:
            log(
                logger,
                logging.ERROR,
                "Failed to process registration webhook",
                error=str(error),
            )
            return JSONResponse(status_code=500, content={"error": "Internal processing error"})

        log(logger, logging.INFO, "Successfully wrote organization relationships to Keto")

    return JSONResponse(status_code=200, content={"status": "success"})


@app.post("/webhooks/login")
async def webhooks_login(payload: LoginWebhookPayload) -> JSONResponse:
    log(
        logger,
        logging.INFO,
        "Received login webhook event",
        identity_id=payload.identity.id,
        email=payload.identity.traits.email,
        session_id=payload.session.id,
        aal=payload.session.authenticator_assurance_level,
        auth_methods=payload.session.authentication_methods,
        user_agent=payload.request_headers.user_agent,
        ip=payload.request_headers.x_real_ip or payload.request_headers.x_forwarded_for,
    )
    return JSONResponse(status_code=200, content={"status": "success"})


@app.post("/admin/platform-admins/{identity_id}")
async def grant_platform_admin(identity_id: str) -> JSONResponse:
    """Grant the console/admin-portal "super admin" role to one identity.

    Writes Organization:platform#admin (+member) in Keto — the same
    relation write_organization_membership already uses for tenant
    onboarding, just against the reserved "platform" organization id. This
    is the one write path for platform-admin grants; the Next.js console
    calls this instead of writing Keto tuples itself.
    """
    keto: KetoWriteClient = app.state.keto
    try:
        await keto.grant_platform_admin(identity_id)
    except httpx.HTTPError as error:
        log(logger, logging.ERROR, "Failed to grant platform admin", error=str(error))
        return JSONResponse(status_code=502, content={"error": str(error)})
    log(logger, logging.INFO, "Granted platform admin", identity_id=identity_id)
    return JSONResponse(
        status_code=200, content={"identity_id": identity_id, "platform_admin": True}
    )


@app.delete("/admin/platform-admins/{identity_id}")
async def revoke_platform_admin(identity_id: str) -> JSONResponse:
    keto: KetoWriteClient = app.state.keto
    try:
        await keto.revoke_platform_admin(identity_id)
    except httpx.HTTPError as error:
        log(logger, logging.ERROR, "Failed to revoke platform admin", error=str(error))
        return JSONResponse(status_code=502, content={"error": str(error)})
    log(logger, logging.INFO, "Revoked platform admin", identity_id=identity_id)
    return JSONResponse(
        status_code=200, content={"identity_id": identity_id, "platform_admin": False}
    )


@app.get("/admin/bootstrap/status")
async def bootstrap_status() -> JSONResponse:
    """Whether the platform already has at least one admin.

    Backs identity-ui's /setup page: shown only while this is `false`, so a
    beginner can become the first administrator entirely through the
    browser (no curl/Postman/manual Keto tuples) — see
    docs/10-reference/final-audit-report.md Phase 3.
    """
    keto: KetoWriteClient = app.state.keto
    has_admin = await keto.has_any_platform_admin(app.state.keto_read_url)
    return JSONResponse(status_code=200, content={"has_admin": has_admin})


@app.post("/admin/bootstrap")
async def bootstrap_admin(request: Request) -> JSONResponse:
    """Claim platform-admin for `identity_id`, but ONLY while zero admins exist.

    This is the one endpoint in the platform that grants admin to a
    caller-supplied identity without the caller already being an admin —
    intentionally, to solve the chicken-and-egg first-admin problem. It is
    self-disabling: once any Organization:platform#admin tuple exists, every
    call here 409s, permanently, for the life of that Keto store. The
    check-then-write is not perfectly atomic (a benign TOCTOU race exists
    between the read and the write below), but the blast radius is bounded
    to the brief first-boot window before any admin has claimed the role —
    documented as a known limitation, not silently ignored.
    """
    body = await request.json()
    identity_id = body.get("identity_id")
    if not identity_id or not isinstance(identity_id, str):
        return JSONResponse(status_code=400, content={"error": "identity_id is required"})

    keto: KetoWriteClient = app.state.keto
    if await keto.has_any_platform_admin(app.state.keto_read_url):
        return JSONResponse(
            status_code=409,
            content={"error": "An administrator has already been configured"},
        )

    try:
        await keto.grant_platform_admin(identity_id)
    except httpx.HTTPError as error:
        log(logger, logging.ERROR, "Failed to bootstrap platform admin", error=str(error))
        return JSONResponse(status_code=502, content={"error": str(error)})

    log(logger, logging.INFO, "Bootstrapped first platform admin", identity_id=identity_id)
    return JSONResponse(
        status_code=201, content={"identity_id": identity_id, "platform_admin": True}
    )


@app.get("/healthz")
async def healthz() -> JSONResponse:
    return JSONResponse(status_code=200, content={"status": "healthy"})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log(logger, logging.ERROR, "Unhandled exception", path=request.url.path, error=str(exc))
    return JSONResponse(status_code=500, content={"error": "Internal processing error"})
