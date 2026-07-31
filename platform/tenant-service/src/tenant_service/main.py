from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, Request, Response
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.exc import SQLAlchemyError

from tenant_service.audit_client import AuditClient
from tenant_service.config import get_settings
from tenant_service.db import make_engine, make_session_factory
from tenant_service.logging_config import configure_logging
from tenant_service.repository import (
    InvitationAlreadyResolvedError,
    InvitationExpiredError,
    InvitationNotFoundError,
    InvitationRepository,
    TenantRepository,
)
from tenant_service.schemas import (
    AcceptInvitationResponse,
    CreateInvitationRequest,
    CreateTenantRequest,
    InvitationResponse,
    TenantResponse,
    UpdateTenantRequest,
)
from tenant_service.telemetry import configure_tracing

settings = get_settings()
logger = configure_logging("tenant-service", settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    engine = make_engine(settings.database_url)
    app.state.session_factory = make_session_factory(engine)
    app.state.audit = AuditClient(os.environ.get("AUDIT_SERVICE_URL", "http://audit-service:8087"))
    app.state.notifications = httpx.AsyncClient(
        base_url=os.environ.get("NOTIFICATION_SERVICE_URL", "http://notification-service:8085"),
        timeout=5.0,
    )
    try:
        yield
    finally:
        await engine.dispose()
        await app.state.audit.aclose()
        await app.state.notifications.aclose()


app = FastAPI(title="tenant-service", lifespan=lifespan)
Instrumentator().instrument(app).expose(app)
configure_tracing(app, settings)


async def get_repository(request: Request) -> AsyncIterator[TenantRepository]:
    async with request.app.state.session_factory() as session:
        yield TenantRepository(session)


async def get_invitation_repository(request: Request) -> AsyncIterator[InvitationRepository]:
    async with request.app.state.session_factory() as session:
        yield InvitationRepository(session)


@app.post("/tenants")
async def create_tenant(
    payload: CreateTenantRequest,
    repository: TenantRepository = Depends(get_repository),  # noqa: B008 - FastAPI's own idiom
) -> JSONResponse:
    if not payload.name:
        return JSONResponse(status_code=400, content={"error": "Tenant name is required"})

    try:
        tenant = await repository.create(payload.name, payload.domain)
        logger.info("Created new tenant organization", tenant_id=str(tenant.id), name=tenant.name)
        response = TenantResponse.model_validate(tenant)
        return JSONResponse(status_code=201, content=response.model_dump(mode="json"))
    except SQLAlchemyError as error:
        logger.error("Failed to create tenant", error=str(error))
        return JSONResponse(status_code=500, content={"error": "Database transaction failed"})


@app.get("/tenants")
async def list_tenants(
    repository: TenantRepository = Depends(get_repository),  # noqa: B008 - FastAPI's own idiom
) -> JSONResponse:
    try:
        tenants = await repository.list_all()
        content = [TenantResponse.model_validate(t).model_dump(mode="json") for t in tenants]
        return JSONResponse(status_code=200, content=content)
    except SQLAlchemyError as error:
        logger.error("Failed to retrieve tenants list", error=str(error))
        return JSONResponse(status_code=500, content={"error": "Database read failed"})


@app.get("/tenants/{tenant_id}")
async def get_tenant(
    tenant_id: str,
    repository: TenantRepository = Depends(get_repository),  # noqa: B008 - FastAPI's own idiom
) -> JSONResponse:
    try:
        parsed_id = uuid.UUID(tenant_id)
    except ValueError:
        return JSONResponse(status_code=422, content={"error": "Invalid tenant id"})

    try:
        tenant = await repository.get_by_id(parsed_id)
    except SQLAlchemyError as error:
        logger.error("Failed to retrieve tenant", error=str(error))
        return JSONResponse(status_code=500, content={"error": "Database read failed"})

    if tenant is None:
        return JSONResponse(status_code=404, content={"error": f"Unknown tenant: {tenant_id}"})

    response = TenantResponse.model_validate(tenant)
    return JSONResponse(status_code=200, content=response.model_dump(mode="json"))


@app.patch("/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: str,
    payload: UpdateTenantRequest,
    repository: TenantRepository = Depends(get_repository),  # noqa: B008 - FastAPI's own idiom
) -> JSONResponse:
    try:
        parsed_id = uuid.UUID(tenant_id)
    except ValueError:
        return JSONResponse(status_code=422, content={"error": "Invalid tenant id"})

    try:
        tenant = await repository.update(parsed_id, payload.name, payload.domain, payload.status)
    except SQLAlchemyError as error:
        logger.error("Failed to update tenant", error=str(error))
        return JSONResponse(status_code=500, content={"error": "Database transaction failed"})

    if tenant is None:
        return JSONResponse(status_code=404, content={"error": f"Unknown tenant: {tenant_id}"})

    logger.info("Updated tenant organization", tenant_id=tenant_id)
    response = TenantResponse.model_validate(tenant)
    return JSONResponse(status_code=200, content=response.model_dump(mode="json"))


@app.delete("/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: str,
    repository: TenantRepository = Depends(get_repository),  # noqa: B008 - FastAPI's own idiom
) -> Response:
    try:
        parsed_id = uuid.UUID(tenant_id)
    except ValueError:
        return JSONResponse(status_code=422, content={"error": "Invalid tenant id"})

    try:
        deleted = await repository.delete(parsed_id)
    except SQLAlchemyError as error:
        logger.error("Failed to delete tenant", error=str(error))
        return JSONResponse(status_code=500, content={"error": "Database transaction failed"})

    if not deleted:
        return JSONResponse(status_code=404, content={"error": f"Unknown tenant: {tenant_id}"})

    logger.info("Deleted tenant organization", tenant_id=tenant_id)
    return Response(status_code=204)


def _base_url() -> str:
    return os.environ.get("PUBLIC_BASE_URL", "http://localhost:4455")


@app.post("/tenants/{tenant_id}/invitations")
async def create_invitation(
    tenant_id: str,
    payload: CreateInvitationRequest,
    tenants: TenantRepository = Depends(get_repository),  # noqa: B008
    invitations: InvitationRepository = Depends(get_invitation_repository),  # noqa: B008
) -> JSONResponse:
    try:
        parsed_id = uuid.UUID(tenant_id)
    except ValueError:
        return JSONResponse(status_code=422, content={"error": "Invalid tenant id"})

    tenant = await tenants.get_by_id(parsed_id)
    if tenant is None:
        return JSONResponse(status_code=404, content={"error": f"Unknown tenant: {tenant_id}"})

    invitation = await invitations.create(
        parsed_id, payload.email, payload.role, payload.expires_in_hours
    )

    invite_link = (
        f"{_base_url()}/auth/console/organizations/{tenant_id}/invitations/accept"
        f"?token={invitation.token}"
    )
    try:
        await app.state.notifications.post(
            "/dispatch",
            json={
                "channel": "email",
                "message": (
                    f"You've been invited to join {tenant.name} as {payload.role}. "
                    f"Accept: {invite_link}"
                ),
                "recipient": payload.email,
                "title": f"Invitation to join {tenant.name}",
            },
        )
    except httpx.HTTPError as error:
        logger.warning("Failed to send invitation email", error=str(error))

    logger.info(
        "Created organization invitation",
        tenant_id=tenant_id,
        email=payload.email,
        invitation_id=str(invitation.id),
    )
    await app.state.audit.record(
        logger,
        action="invitation.create",
        resource_type="invitation",
        resource_id=str(invitation.id),
        metadata={"tenant_id": tenant_id, "email": payload.email, "role": payload.role},
    )
    response = InvitationResponse.model_validate(invitation)
    return JSONResponse(status_code=201, content=response.model_dump(mode="json"))


@app.get("/tenants/{tenant_id}/invitations")
async def list_invitations(
    tenant_id: str,
    invitations: InvitationRepository = Depends(get_invitation_repository),  # noqa: B008
) -> JSONResponse:
    try:
        parsed_id = uuid.UUID(tenant_id)
    except ValueError:
        return JSONResponse(status_code=422, content={"error": "Invalid tenant id"})

    items = await invitations.list_for_tenant(parsed_id)
    content = [InvitationResponse.model_validate(i).model_dump(mode="json") for i in items]
    return JSONResponse(status_code=200, content=content)


@app.delete("/tenants/{tenant_id}/invitations/{invitation_id}")
async def revoke_invitation(
    tenant_id: str,
    invitation_id: str,
    invitations: InvitationRepository = Depends(get_invitation_repository),  # noqa: B008
) -> Response:
    try:
        parsed_id = uuid.UUID(invitation_id)
    except ValueError:
        return JSONResponse(status_code=422, content={"error": "Invalid invitation id"})

    try:
        await invitations.revoke(parsed_id)
    except InvitationNotFoundError:
        return JSONResponse(
            status_code=404, content={"error": f"Unknown invitation: {invitation_id}"}
        )

    logger.info("Revoked invitation", invitation_id=invitation_id)
    await app.state.audit.record(
        logger,
        action="invitation.revoke",
        resource_type="invitation",
        resource_id=invitation_id,
        metadata={"tenant_id": tenant_id},
    )
    return Response(status_code=204)


@app.post("/invitations/{token}/accept")
async def accept_invitation(
    token: str,
    invitations: InvitationRepository = Depends(get_invitation_repository),  # noqa: B008
) -> JSONResponse:
    try:
        invitation = await invitations.accept(token)
    except InvitationNotFoundError:
        return JSONResponse(status_code=404, content={"error": "Unknown invitation token"})
    except InvitationExpiredError:
        return JSONResponse(status_code=410, content={"error": "Invitation has expired"})
    except InvitationAlreadyResolvedError:
        return JSONResponse(
            status_code=409, content={"error": "Invitation already accepted or revoked"}
        )

    logger.info("Accepted invitation", invitation_id=str(invitation.id))
    await app.state.audit.record(
        logger,
        action="invitation.accept",
        resource_type="invitation",
        resource_id=str(invitation.id),
        metadata={"tenant_id": str(invitation.tenant_id), "email": invitation.email},
    )
    response = AcceptInvitationResponse(
        email=invitation.email, role=invitation.role, tenant_id=invitation.tenant_id
    )
    return JSONResponse(status_code=200, content=response.model_dump(mode="json"))


@app.get("/healthz")
async def healthz() -> JSONResponse:
    return JSONResponse(status_code=200, content={"status": "healthy", "service": "tenant-service"})
