from __future__ import annotations

import html
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel

from notification_service.audit_client import AuditClient
from notification_service.config import get_settings
from notification_service.logging_config import configure_logging
from notification_service.telemetry import configure_tracing
from notification_service.templates import (
    TemplateNotFoundError,
    get_template,
    list_templates,
    update_template,
)

settings = get_settings()
logger = configure_logging("notification-service", settings.log_level)


def _templates_dir() -> Path:
    return Path(os.environ.get("EMAIL_TEMPLATES_PATH", "/etc/config/kratos/email-templates"))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.http_client = httpx.AsyncClient(timeout=10.0)
    app.state.audit = AuditClient(os.environ.get("AUDIT_SERVICE_URL", "http://audit-service:8087"))
    try:
        yield
    finally:
        await app.state.http_client.aclose()
        await app.state.audit.aclose()


app = FastAPI(title="notification-service", lifespan=lifespan)
Instrumentator().instrument(app).expose(app)
configure_tracing(app, settings)


class DispatchRequest(BaseModel):
    recipient: str | None = None
    channel: str | None = None
    message: str | None = None
    title: str | None = None


@app.post("/dispatch")
async def dispatch(payload: DispatchRequest, request: Request) -> JSONResponse:
    if not payload.recipient or not payload.channel or not payload.message:
        return JSONResponse(
            status_code=400, content={"error": "Missing recipient, channel, or message"}
        )

    logger.info(
        "Processing notification dispatch request",
        recipient=payload.recipient,
        channel=payload.channel,
    )

    try:
        if payload.channel == "email":
            client: httpx.AsyncClient = request.app.state.http_client
            # Message is user-controlled — escape before interpolating into HTML.
            # docs/10-reference/repository-audit.md flagged the pre-port implementation for
            # rendering unescaped user text into an HTML email body.
            safe_message = html.escape(payload.message)
            response = await client.post(
                settings.email_service_url,
                json={
                    "to": payload.recipient,
                    "subject": payload.title or "Notification",
                    "html": f"<p>{safe_message}</p>",
                    "text": payload.message,
                },
            )
            if response.is_success:
                logger.info("Email notification dispatched successfully")
                return JSONResponse(
                    status_code=200, content={"status": "dispatched", "channel": "email"}
                )
            raise RuntimeError(
                f"Email microservice returned error status: {response.status_code} "
                f"- {response.text}"
            )

        if payload.channel == "sms":
            # Mocking SMS delivery - to be integrated with SMS plugins in Phase 6.
            logger.info(
                "SMS notification dispatched successfully (mocked)", recipient=payload.recipient
            )
            return JSONResponse(status_code=200, content={"status": "dispatched", "channel": "sms"})

        return JSONResponse(
            status_code=400, content={"error": f"Unsupported channel: {payload.channel}"}
        )
    except Exception as error:  # noqa: BLE001 - top-level flow error boundary, matches original
        logger.error("Failed to dispatch notification", error=str(error))
        return JSONResponse(status_code=500, content={"error": "Notification routing failed"})


class UpdateTemplateRequest(BaseModel):
    content: str


@app.get("/api/v1/notifications/templates")
async def get_templates() -> JSONResponse:
    templates = list_templates(_templates_dir())
    return JSONResponse(status_code=200, content={"templates": [t.model_dump() for t in templates]})


@app.get("/api/v1/notifications/templates/{template_id}")
async def get_one_template(template_id: str) -> JSONResponse:
    try:
        template = get_template(_templates_dir(), template_id)
    except TemplateNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown template: {template_id}"})
    return JSONResponse(status_code=200, content=template.model_dump())


@app.put("/api/v1/notifications/templates/{template_id}")
async def put_template(template_id: str, body: UpdateTemplateRequest) -> JSONResponse:
    try:
        template = update_template(_templates_dir(), template_id, body.content)
    except TemplateNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown template: {template_id}"})
    logger.info("Updated notification template", template_id=template_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="notification.template.update",
        resource_type="notification_template",
        resource_id=template_id,
    )
    return JSONResponse(status_code=200, content=template.model_dump())


class TestSendRequest(BaseModel):
    recipient: str


@app.post("/api/v1/notifications/test")
async def test_send(body: TestSendRequest, request: Request) -> Response:
    """Sends a real test email through the same email-service path
    /dispatch uses — proves the SMTP connection actually works, not just
    that this endpoint returns 200."""
    result = await dispatch(
        DispatchRequest(
            channel="email",
            message="This is a test email from the NeoBIM Identity Platform's Notifications page.",
            recipient=body.recipient,
            title="Test notification",
        ),
        request,
    )
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="notification.test.send",
        resource_type="notification",
        resource_id=body.recipient,
        metadata={"status_code": result.status_code},
    )
    return result


@app.get("/healthz")
async def healthz() -> JSONResponse:
    return JSONResponse(
        status_code=200, content={"status": "healthy", "service": "notification-service"}
    )
