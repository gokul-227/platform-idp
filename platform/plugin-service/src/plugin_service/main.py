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

from plugin_service.audit_client import AuditClient
from plugin_service.logging_config import configure_logging, log
from plugin_service.registry import (
    MissingDependencyError,
    PluginDefinition,
    PluginNotFoundError,
    PluginVersionNotFoundError,
    delete_config_plugin,
    get_config_plugin,
    list_all_plugins,
    list_plugin_history,
    rollback_plugin,
    validate_dependencies,
    write_config_plugin,
)

logger = configure_logging()


def _plugins_dir() -> Path:
    return Path(os.environ.get("PLUGINS_CONFIG_PATH", "/etc/config/plugins"))


def _code_plugins_dir() -> Path:
    return Path(os.environ.get("CODE_PLUGINS_PATH", "/etc/plugins"))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    audit_service_url = os.environ.get("AUDIT_SERVICE_URL", "http://audit-service:8087")
    app.state.audit = AuditClient(audit_service_url)
    try:
        yield
    finally:
        await app.state.audit.aclose()


app = FastAPI(title="plugin-service", lifespan=lifespan)
Instrumentator().instrument(app).expose(app)


class SetEnabledRequest(BaseModel):
    enabled: bool


@app.get("/healthz")
async def healthz() -> JSONResponse:
    return JSONResponse(status_code=200, content={"status": "healthy", "service": "plugin-service"})


@app.get("/api/v1/plugins")
async def list_plugins() -> JSONResponse:
    plugins = list_all_plugins(_plugins_dir(), _code_plugins_dir())
    return JSONResponse(status_code=200, content={"plugins": [p.model_dump() for p in plugins]})


@app.post("/api/v1/plugins")
async def create_plugin(body: PluginDefinition) -> JSONResponse:
    plugins_dir = _plugins_dir()
    if (plugins_dir / f"{body.id}.yaml").exists():
        return JSONResponse(status_code=409, content={"error": f"Plugin already exists: {body.id}"})
    try:
        validate_dependencies(body, plugins_dir, _code_plugins_dir())
    except MissingDependencyError as error:
        return JSONResponse(status_code=422, content={"error": str(error)})

    write_config_plugin(plugins_dir, body)
    log(logger, logging.INFO, "Created plugin", plugin_id=body.id, type=body.type)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="plugin.create",
        resource_type="plugin",
        resource_id=body.id,
        metadata={"type": body.type},
    )
    return JSONResponse(status_code=201, content=body.model_dump())


@app.put("/api/v1/plugins/{plugin_id}")
async def update_plugin(plugin_id: str, body: PluginDefinition) -> JSONResponse:
    plugins_dir = _plugins_dir()
    try:
        get_config_plugin(plugins_dir, plugin_id)
    except PluginNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown plugin: {plugin_id}"})
    try:
        validate_dependencies(body, plugins_dir, _code_plugins_dir())
    except MissingDependencyError as error:
        return JSONResponse(status_code=422, content={"error": str(error)})

    write_config_plugin(plugins_dir, body)
    log(logger, logging.INFO, "Updated plugin", plugin_id=plugin_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="plugin.update", resource_type="plugin", resource_id=plugin_id
    )
    return JSONResponse(status_code=200, content=body.model_dump())


@app.delete("/api/v1/plugins/{plugin_id}")
async def delete_plugin(plugin_id: str) -> Response:
    try:
        delete_config_plugin(_plugins_dir(), plugin_id)
    except PluginNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown plugin: {plugin_id}"})

    log(logger, logging.INFO, "Deleted plugin", plugin_id=plugin_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="plugin.delete", resource_type="plugin", resource_id=plugin_id
    )
    return Response(status_code=204)


async def _set_enabled(plugin_id: str, enabled: bool) -> JSONResponse:
    plugins_dir = _plugins_dir()
    try:
        definition = get_config_plugin(plugins_dir, plugin_id)
    except PluginNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown plugin: {plugin_id}"})

    definition.enabled = enabled
    write_config_plugin(plugins_dir, definition)
    log(logger, logging.INFO, "Set plugin enabled", plugin_id=plugin_id, enabled=enabled)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="plugin.enable" if enabled else "plugin.disable",
        resource_type="plugin",
        resource_id=plugin_id,
    )
    return JSONResponse(status_code=200, content=definition.model_dump())


@app.post("/api/v1/plugins/{plugin_id}/enable")
async def enable_plugin(plugin_id: str) -> JSONResponse:
    return await _set_enabled(plugin_id, True)


@app.post("/api/v1/plugins/{plugin_id}/disable")
async def disable_plugin(plugin_id: str) -> JSONResponse:
    return await _set_enabled(plugin_id, False)


@app.get("/api/v1/plugins/{plugin_id}/history")
async def get_plugin_history(plugin_id: str) -> JSONResponse:
    versions = list_plugin_history(_plugins_dir(), plugin_id)
    return JSONResponse(status_code=200, content={"versions": versions})


@app.post("/api/v1/plugins/{plugin_id}/history/{version_id}/rollback")
async def rollback_plugin_endpoint(plugin_id: str, version_id: str) -> JSONResponse:
    try:
        definition = rollback_plugin(_plugins_dir(), plugin_id, version_id)
    except PluginVersionNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown version: {version_id}"})
    log(logger, logging.INFO, "Rolled back plugin", plugin_id=plugin_id, version_id=version_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="plugin.rollback",
        resource_type="plugin",
        resource_id=plugin_id,
        metadata={"version_id": version_id},
    )
    return JSONResponse(status_code=200, content=definition.model_dump())
