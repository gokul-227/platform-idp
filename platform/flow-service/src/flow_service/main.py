from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel

from flow_service.audit_client import AuditClient
from flow_service.logging_config import configure_logging, log
from flow_service.registry import (
    KNOWN_METHODS,
    FlowDefinition,
    FlowNotFoundError,
    FlowVersionNotFoundError,
    delete_flow,
    get_flow,
    list_flow_history,
    list_flows,
    publish_to_rendered_config,
    rollback_flow,
    write_flow,
)

logger = configure_logging()


def _flows_dir() -> Path:
    return Path(os.environ.get("FLOWS_CONFIG_PATH", "/etc/config/flows"))


def _rendered_kratos_config_path() -> Path:
    return Path(
        os.environ.get(
            "RENDERED_KRATOS_CONFIG_PATH",
            "/etc/config/kratos/config/rendered/ory/kratos/config/kratos.yaml",
        )
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    audit_service_url = os.environ.get("AUDIT_SERVICE_URL", "http://audit-service:8087")
    app.state.audit = AuditClient(audit_service_url)
    try:
        yield
    finally:
        await app.state.audit.aclose()


app = FastAPI(title="flow-service", lifespan=lifespan)
Instrumentator().instrument(app).expose(app)


class SetEnabledRequest(BaseModel):
    enabled: bool


def _validate_steps(definition: FlowDefinition) -> str | None:
    unknown = [s for s in definition.steps if s not in KNOWN_METHODS]
    if unknown:
        known = ", ".join(KNOWN_METHODS)
        return f"Unknown method(s) in steps: {', '.join(unknown)}. Known: {known}"
    return None


@app.get("/healthz")
async def healthz() -> JSONResponse:
    return JSONResponse(status_code=200, content={"status": "healthy", "service": "flow-service"})


@app.get("/api/v1/flows")
async def get_flows() -> JSONResponse:
    flows = list_flows(_flows_dir())
    return JSONResponse(status_code=200, content={"flows": [f.model_dump() for f in flows]})


@app.get("/api/v1/flows/{flow_id}")
async def get_one_flow(flow_id: str) -> JSONResponse:
    try:
        flow = get_flow(_flows_dir(), flow_id)
    except FlowNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown flow: {flow_id}"})
    return JSONResponse(status_code=200, content=flow.model_dump())


@app.post("/api/v1/flows")
async def create_flow(body: FlowDefinition) -> JSONResponse:
    flows_dir = _flows_dir()
    if (flows_dir / f"{body.id}.yaml").exists():
        return JSONResponse(status_code=409, content={"error": f"Flow already exists: {body.id}"})
    error = _validate_steps(body)
    if error:
        return JSONResponse(status_code=422, content={"error": error})

    write_flow(flows_dir, body)
    log(logger, logging.INFO, "Created flow", flow_id=body.id, type=body.type)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="flow.create",
        resource_type="flow",
        resource_id=body.id,
        metadata={"type": body.type},
    )
    return JSONResponse(status_code=201, content=body.model_dump())


@app.put("/api/v1/flows/{flow_id}")
async def update_flow(flow_id: str, body: FlowDefinition) -> JSONResponse:
    flows_dir = _flows_dir()
    try:
        get_flow(flows_dir, flow_id)
    except FlowNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown flow: {flow_id}"})
    error = _validate_steps(body)
    if error:
        return JSONResponse(status_code=422, content={"error": error})

    write_flow(flows_dir, body)
    log(logger, logging.INFO, "Updated flow", flow_id=flow_id)
    audit: AuditClient = app.state.audit
    await audit.record(logger, action="flow.update", resource_type="flow", resource_id=flow_id)
    return JSONResponse(status_code=200, content=body.model_dump())


@app.delete("/api/v1/flows/{flow_id}")
async def remove_flow(flow_id: str) -> Response:
    try:
        delete_flow(_flows_dir(), flow_id)
    except FlowNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown flow: {flow_id}"})
    log(logger, logging.INFO, "Deleted flow", flow_id=flow_id)
    audit: AuditClient = app.state.audit
    await audit.record(logger, action="flow.delete", resource_type="flow", resource_id=flow_id)
    return Response(status_code=204)


async def _set_enabled(flow_id: str, enabled: bool) -> JSONResponse:
    flows_dir = _flows_dir()
    try:
        definition = get_flow(flows_dir, flow_id)
    except FlowNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown flow: {flow_id}"})

    definition.enabled = enabled
    write_flow(flows_dir, definition)
    log(logger, logging.INFO, "Set flow enabled", flow_id=flow_id, enabled=enabled)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="flow.enable" if enabled else "flow.disable",
        resource_type="flow",
        resource_id=flow_id,
    )
    return JSONResponse(status_code=200, content=definition.model_dump())


@app.post("/api/v1/flows/{flow_id}/enable")
async def enable_flow(flow_id: str) -> JSONResponse:
    return await _set_enabled(flow_id, True)


@app.post("/api/v1/flows/{flow_id}/disable")
async def disable_flow(flow_id: str) -> JSONResponse:
    return await _set_enabled(flow_id, False)


@app.post("/api/v1/flows/{flow_id}/publish")
async def publish_flow(flow_id: str) -> JSONResponse:
    """Applies ALL enabled flows' steps to the rendered Kratos config
    (enable-only — see registry.py's docstring). Takes effect on Kratos's
    next restart; Kratos has no runtime config-reload API."""
    flows_dir = _flows_dir()
    try:
        get_flow(flows_dir, flow_id)
    except FlowNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown flow: {flow_id}"})

    enabled_methods = publish_to_rendered_config(flows_dir, _rendered_kratos_config_path())
    log(
        logger,
        logging.INFO,
        "Published flows",
        flow_id=flow_id,
        enabled_methods=sorted(enabled_methods),
    )
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="flow.publish",
        resource_type="flow",
        resource_id=flow_id,
        metadata={"enabled_methods": sorted(enabled_methods)},
    )
    return JSONResponse(
        status_code=200,
        content={"flow_id": flow_id, "enabled_methods": sorted(enabled_methods)},
    )


@app.get("/api/v1/flows/{flow_id}/history")
async def get_flow_history(flow_id: str) -> JSONResponse:
    versions = list_flow_history(_flows_dir(), flow_id)
    return JSONResponse(status_code=200, content={"versions": versions})


@app.post("/api/v1/flows/{flow_id}/history/{version_id}/rollback")
async def rollback_flow_endpoint(flow_id: str, version_id: str) -> JSONResponse:
    try:
        definition = rollback_flow(_flows_dir(), flow_id, version_id)
    except FlowVersionNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown version: {version_id}"})
    log(logger, logging.INFO, "Rolled back flow", flow_id=flow_id, version_id=version_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="flow.rollback",
        resource_type="flow",
        resource_id=flow_id,
        metadata={"version_id": version_id},
    )
    return JSONResponse(status_code=200, content=definition.model_dump())
