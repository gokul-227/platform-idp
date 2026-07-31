from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel

from app_registry.audit_client import AuditClient
from app_registry.config import get_settings
from app_registry.hydra_client import HydraAdminClient
from app_registry.logging_config import configure_logging
from app_registry.registry_loader import (
    delete_definition_file,
    find_definition_filename,
    load_all_definitions,
    set_enabled,
    write_definition,
)
from app_registry.sync import HydraRegistrySync
from app_registry.telemetry import configure_tracing
from app_registry.types import AppRegistryDefinition


class SetEnabledRequest(BaseModel):
    enabled: bool


class AppDefinitionRequest(BaseModel):
    client_id: str
    client_name: str
    redirect_uris: list[str]
    post_logout_redirect_uris: list[str] = []
    grant_types: list[str] = ["authorization_code", "refresh_token"]
    scope: str = "openid profile email"
    client_secret_env_var: str | None = None
    token_endpoint_auth_method: str | None = None
    enabled: bool = True
    tenant_id: str | None = None
    tags: list[str] = []

    def to_definition(self) -> AppRegistryDefinition:
        return AppRegistryDefinition.model_validate(self.model_dump())


settings = get_settings()
logger = configure_logging("app-registry", settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    hydra = HydraAdminClient(settings.hydra_admin_url)
    app.state.sync_engine = HydraRegistrySync(settings, hydra, logger)
    app.state.audit = AuditClient(os.environ.get("AUDIT_SERVICE_URL", "http://audit-service:8087"))
    try:
        yield
    finally:
        await hydra.aclose()
        await app.state.audit.aclose()


app = FastAPI(title="app-registry", lifespan=lifespan)
Instrumentator().instrument(app).expose(app)
configure_tracing(app, settings)


@app.get("/healthz")
async def healthz() -> JSONResponse:
    return JSONResponse(status_code=200, content={"status": "healthy", "service": "app-registry"})


@app.get("/ready")
async def ready() -> JSONResponse:
    sync_engine: HydraRegistrySync = app.state.sync_engine
    try:
        await sync_engine.list_hydra_clients()
        return JSONResponse(status_code=200, content={"status": "ready", "hydra": "reachable"})
    except httpx.HTTPError as error:
        logger.error("Readiness check failed", error=str(error))
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "hydra": "unreachable", "error": str(error)},
        )


@app.get("/api/v1/registry")
async def get_registry() -> JSONResponse:
    """List YAML definitions discovered on disk (not yet synced to Hydra)."""
    sync_engine: HydraRegistrySync = app.state.sync_engine
    try:
        registry = sync_engine.describe_registry()
        definitions = [
            {
                "filename": filename,
                "client_id": definition.client_id,
                "client_name": definition.client_name,
                "redirect_uris": definition.redirect_uris,
                "scope": definition.scope,
                "enabled": definition.is_enabled,
                "tenant_id": definition.tenant_id,
                "tags": definition.tags,
            }
            for filename, definition in load_all_definitions(
                sync_engine.settings.registry_path, sync_engine.settings.schema_path
            )
        ]
        return JSONResponse(
            status_code=200, content={**registry.model_dump(), "definitions": definitions}
        )
    except (FileNotFoundError, ValueError) as error:
        return JSONResponse(status_code=500, content={"error": str(error)})


@app.get("/api/v1/clients")
async def get_clients() -> JSONResponse:
    """List OAuth2 clients currently registered in Hydra."""
    sync_engine: HydraRegistrySync = app.state.sync_engine
    try:
        clients = await sync_engine.list_hydra_clients()
        return JSONResponse(
            status_code=200,
            content={
                "count": len(clients),
                "clients": [
                    {
                        "client_id": client.client_id,
                        "client_name": client.client_name,
                        "grant_types": client.grant_types,
                        "redirect_uris": client.redirect_uris,
                    }
                    for client in clients
                ],
            },
        )
    except httpx.HTTPError as error:
        return JSONResponse(status_code=502, content={"error": str(error)})


@app.post("/api/v1/registry/{client_id}/enabled")
async def set_registry_app_enabled(client_id: str, body: SetEnabledRequest) -> JSONResponse:
    """Flip an application's enabled flag and immediately reconcile Hydra.

    This is the one write path into integrations/applications/*.yaml: it owns the file
    mutation (registry_loader.set_enabled, comment-preserving) and the
    Hydra side effect (a real, non-dry-run sync right after), so a caller
    never observes a YAML file and a live Hydra client disagreeing with
    each other. The Next.js console calls this instead of touching the
    registry files or Hydra directly — see ADR-0012 (Python-first).
    """
    sync_engine: HydraRegistrySync = app.state.sync_engine
    engine_settings = sync_engine.settings
    filename = find_definition_filename(
        engine_settings.registry_path, engine_settings.schema_path, client_id
    )
    if filename is None:
        return JSONResponse(status_code=404, content={"error": f"Unknown client_id: {client_id}"})

    try:
        set_enabled(engine_settings.registry_path, filename, body.enabled)
        summary = await sync_engine.sync(dry_run=False)
    except (FileNotFoundError, ValueError) as error:
        return JSONResponse(status_code=500, content={"error": str(error)})

    result = next((r for r in summary.results if r.client_id == client_id), None)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="application.enable" if body.enabled else "application.disable",
        resource_type="application",
        resource_id=client_id,
    )
    return JSONResponse(
        status_code=200,
        content={
            "client_id": client_id,
            "filename": filename,
            "enabled": body.enabled,
            "sync_result": result.model_dump() if result else None,
        },
    )


@app.post("/api/v1/registry")
async def create_registry_app(body: AppDefinitionRequest) -> JSONResponse:
    """Create a new application definition (integrations/applications/{client_id}.yaml).

    Also syncs it to Hydra immediately.
    """
    sync_engine: HydraRegistrySync = app.state.sync_engine
    engine_settings = sync_engine.settings
    existing_filename = find_definition_filename(
        engine_settings.registry_path, engine_settings.schema_path, body.client_id
    )
    if existing_filename is not None:
        return JSONResponse(
            status_code=409, content={"error": f"client_id already exists: {body.client_id}"}
        )

    filename = f"{body.client_id}.yaml"
    try:
        write_definition(
            engine_settings.registry_path,
            filename,
            body.to_definition(),
            engine_settings.schema_path,
        )
        summary = await sync_engine.sync(dry_run=False)
    except (FileNotFoundError, ValueError) as error:
        return JSONResponse(status_code=422, content={"error": str(error)})

    result = next((r for r in summary.results if r.client_id == body.client_id), None)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="application.create", resource_type="application", resource_id=body.client_id
    )
    return JSONResponse(
        status_code=201,
        content={
            "client_id": body.client_id,
            "filename": filename,
            "sync_result": result.model_dump() if result else None,
        },
    )


@app.put("/api/v1/registry/{client_id}")
async def update_registry_app(client_id: str, body: AppDefinitionRequest) -> JSONResponse:
    """Overwrite an existing application definition's fields and re-sync it to Hydra."""
    sync_engine: HydraRegistrySync = app.state.sync_engine
    engine_settings = sync_engine.settings
    filename = find_definition_filename(
        engine_settings.registry_path, engine_settings.schema_path, client_id
    )
    if filename is None:
        return JSONResponse(status_code=404, content={"error": f"Unknown client_id: {client_id}"})

    try:
        write_definition(
            engine_settings.registry_path,
            filename,
            body.to_definition(),
            engine_settings.schema_path,
        )
        summary = await sync_engine.sync(dry_run=False)
    except (FileNotFoundError, ValueError) as error:
        return JSONResponse(status_code=422, content={"error": str(error)})

    result = next((r for r in summary.results if r.client_id == body.client_id), None)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="application.update", resource_type="application", resource_id=body.client_id
    )
    return JSONResponse(
        status_code=200,
        content={
            "client_id": body.client_id,
            "filename": filename,
            "sync_result": result.model_dump() if result else None,
        },
    )


@app.delete("/api/v1/registry/{client_id}")
async def delete_registry_app(client_id: str) -> JSONResponse:
    """Remove an application definition's YAML file and its Hydra client."""
    sync_engine: HydraRegistrySync = app.state.sync_engine
    engine_settings = sync_engine.settings
    filename = find_definition_filename(
        engine_settings.registry_path, engine_settings.schema_path, client_id
    )
    if filename is None:
        return JSONResponse(status_code=404, content={"error": f"Unknown client_id: {client_id}"})

    delete_definition_file(engine_settings.registry_path, filename)
    try:
        await sync_engine.delete_hydra_client(client_id)
    except httpx.HTTPError as error:
        return JSONResponse(status_code=502, content={"error": str(error)})

    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="application.delete", resource_type="application", resource_id=client_id
    )
    return JSONResponse(status_code=200, content={"client_id": client_id, "filename": filename})


@app.post("/api/v1/sync")
async def post_sync(request: Request) -> JSONResponse:
    """Trigger a registry -> Hydra synchronization run."""
    sync_engine: HydraRegistrySync = app.state.sync_engine
    dry_run = request.query_params.get("dry_run") == "true"
    if not dry_run:
        try:
            body = await request.json()
        except ValueError:
            body = {}
        dry_run = bool(body.get("dry_run") is True) if isinstance(body, dict) else False

    try:
        summary = await sync_engine.sync(dry_run)
        has_failures = any(result.action == "failed" for result in summary.results)
        return JSONResponse(status_code=207 if has_failures else 200, content=summary.model_dump())
    except (FileNotFoundError, ValueError) as error:
        return JSONResponse(status_code=500, content={"error": str(error)})
