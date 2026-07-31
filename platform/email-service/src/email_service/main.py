from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel

from email_service.config import get_settings
from email_service.logging_config import configure_logging
from email_service.providers import get_email_provider
from email_service.telemetry import configure_tracing

settings = get_settings()
logger = configure_logging("email-service", settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.provider = get_email_provider(settings, logger)
    yield


app = FastAPI(title="email-service", lifespan=lifespan)
Instrumentator().instrument(app).expose(app)
configure_tracing(app, settings)


class SendEmailRequest(BaseModel):
    to: str | None = None
    subject: str | None = None
    html: str | None = None
    text: str | None = None


@app.post("/send")
async def send(payload: SendEmailRequest, request: Request) -> JSONResponse:
    if not payload.to or not payload.subject or not (payload.html or payload.text):
        return JSONResponse(
            status_code=400, content={"error": "Missing to, subject, or message body content"}
        )

    provider = request.app.state.provider
    success = await provider.send_mail(
        payload.to, payload.subject, payload.html or "", payload.text or ""
    )
    if success:
        return JSONResponse(status_code=200, content={"status": "sent"})
    return JSONResponse(status_code=500, content={"error": "Email delivery failed"})


@app.get("/healthz")
async def healthz() -> JSONResponse:
    return JSONResponse(status_code=200, content={"status": "healthy", "service": "email-service"})
