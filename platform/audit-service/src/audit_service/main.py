from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy.exc import SQLAlchemyError

from audit_service.config import get_settings
from audit_service.db import make_engine, make_session_factory
from audit_service.logging_config import configure_logging
from audit_service.repository import AuditEventRepository
from audit_service.schemas import AuditEventResponse, CreateAuditEventRequest

settings = get_settings()
logger = configure_logging("audit-service", settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    engine = make_engine(settings.database_url)
    app.state.session_factory = make_session_factory(engine)
    try:
        yield
    finally:
        await engine.dispose()


app = FastAPI(title="audit-service", lifespan=lifespan)
Instrumentator().instrument(app).expose(app)


async def get_repository(request: Request) -> AsyncIterator[AuditEventRepository]:
    async with request.app.state.session_factory() as session:
        yield AuditEventRepository(session)


@app.post("/api/v1/events")
async def create_event(
    payload: CreateAuditEventRequest,
    repository: AuditEventRepository = Depends(get_repository),  # noqa: B008 - FastAPI's own idiom
) -> JSONResponse:
    try:
        event = await repository.create(
            payload.actor_id,
            payload.action,
            payload.resource_type,
            payload.resource_id,
            payload.metadata,
        )
        response = AuditEventResponse.model_validate(event)
        return JSONResponse(status_code=201, content=response.model_dump(mode="json"))
    except SQLAlchemyError as error:
        logger.error("Failed to record audit event", error=str(error))
        return JSONResponse(status_code=500, content={"error": "Database transaction failed"})


@app.get("/api/v1/events")
async def list_events(
    resource_type: str | None = None,
    resource_id: str | None = None,
    action: str | None = None,
    repository: AuditEventRepository = Depends(get_repository),  # noqa: B008 - FastAPI's own idiom
) -> JSONResponse:
    try:
        events = await repository.list_all(
            resource_type=resource_type, resource_id=resource_id, action=action
        )
        content = [AuditEventResponse.model_validate(e).model_dump(mode="json") for e in events]
        return JSONResponse(status_code=200, content=content)
    except SQLAlchemyError as error:
        logger.error("Failed to list audit events", error=str(error))
        return JSONResponse(status_code=500, content={"error": "Database read failed"})


@app.get("/healthz")
async def healthz() -> JSONResponse:
    return JSONResponse(status_code=200, content={"status": "healthy", "service": "audit-service"})
