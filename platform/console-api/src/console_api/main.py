from __future__ import annotations

import logging
import os
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel

from console_api.api_keys import (
    ApiKeyCreateRequest,
    create_api_key,
    disable_api_key,
    enable_api_key,
    is_api_key,
)
from console_api.api_keys import to_view as to_api_key_view
from console_api.audit_client import AuditClient
from console_api.hydra_admin_client import ClientNotFoundError, HydraAdminClient
from console_api.hydra_public_client import HydraPublicClient, TokenRequestError
from console_api.identity_providers import (
    UnknownProviderError,
    load_provider_metadata,
    load_providers,
    set_provider_enabled,
)
from console_api.keto_admin_client import KetoAdminClient
from console_api.kratos_admin_client import (
    DEFAULT_SCHEMA_ID,
    IdentityNotFoundError,
    KratosAdminClient,
    SessionNotFoundError,
)
from console_api.logging_config import configure_logging, log
from console_api.theme import (
    ThemeVersionNotFoundError,
    get_theme_history_version,
    list_theme_history,
    load_theme,
    rollback_theme,
    write_theme,
)

logger = configure_logging()


def _identity_providers_path() -> Path:
    return Path(os.environ.get("IDENTITY_PROVIDERS_PATH", "/etc/config/identity-providers.yaml"))


def _kratos_rendered_config_path() -> Path:
    return Path(
        os.environ.get(
            "KRATOS_RENDERED_CONFIG_PATH",
            "/etc/config/kratos-rendered/ory/kratos/config/kratos.yaml",
        )
    )


def _theme_path() -> Path:
    return Path(os.environ.get("THEME_CONFIG_PATH", "/etc/config/themes/neobim.yaml"))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    kratos_admin_url = os.environ.get("KRATOS_ADMIN_URL", "http://kratos:4434")
    hydra_admin_url = os.environ.get("HYDRA_ADMIN_URL", "http://hydra:4445")
    hydra_public_url = os.environ.get("HYDRA_PUBLIC_URL", "http://hydra:4444")
    keto_write_url = os.environ.get("KETO_WRITE_URL", "http://keto:4467")
    audit_service_url = os.environ.get("AUDIT_SERVICE_URL", "http://audit-service:8087")
    app.state.kratos = KratosAdminClient(kratos_admin_url)
    app.state.hydra = HydraAdminClient(hydra_admin_url)
    app.state.hydra_public = HydraPublicClient(hydra_public_url)
    app.state.keto = KetoAdminClient(keto_write_url)
    app.state.audit = AuditClient(audit_service_url)
    try:
        yield
    finally:
        await app.state.kratos.aclose()
        await app.state.hydra.aclose()
        await app.state.hydra_public.aclose()
        await app.state.keto.aclose()
        await app.state.audit.aclose()


app = FastAPI(title="console-api", lifespan=lifespan)
Instrumentator().instrument(app).expose(app)


class CreateIdentityRequest(BaseModel):
    email: str
    schema_id: str = DEFAULT_SCHEMA_ID
    password: str | None = None
    traits: dict[str, Any] = {}


class UpdateTraitsRequest(BaseModel):
    traits: dict[str, Any]


class SetPasswordRequest(BaseModel):
    password: str


class ClientRequest(BaseModel):
    client_name: str
    redirect_uris: list[str] = []
    post_logout_redirect_uris: list[str] = []
    grant_types: list[str] = ["authorization_code", "refresh_token"]
    response_types: list[str] = ["code"]
    scope: str = "openid profile email"
    token_endpoint_auth_method: str = "client_secret_post"
    client_secret: str | None = None
    # Real Hydra OAuth2Client fields (confirmed present on every live
    # client this platform's Hydra returns) — per-client token TTL
    # overrides. None means "unset" and is dropped from the payload
    # (exclude_none below), leaving Hydra's global default in effect.
    authorization_code_grant_access_token_lifespan: str | None = None
    authorization_code_grant_id_token_lifespan: str | None = None
    authorization_code_grant_refresh_token_lifespan: str | None = None
    client_credentials_grant_access_token_lifespan: str | None = None
    refresh_token_grant_access_token_lifespan: str | None = None
    refresh_token_grant_id_token_lifespan: str | None = None
    refresh_token_grant_refresh_token_lifespan: str | None = None
    # Real Hydra fields, previously unexposed anywhere in this console
    # (confirmed by reading OAuth2Client's own SDK type — both are real,
    # supported fields, not invented). No raw inline JWKS document support
    # here — Hydra accepts one (a `jwks` object), but round-tripping a full
    # JSON Web Key Set through a plain text field is real added UI
    # complexity for a rarely-used case; `jwks_uri` (a hosted key set) covers
    # the common private_key_jwt scenario without it.
    jwks_uri: str | None = None
    audience: list[str] = []

    def to_hydra_payload(self) -> dict[str, Any]:
        payload = self.model_dump(exclude_none=True)
        return payload


class SubjectSetRef(BaseModel):
    namespace: str
    object: str
    relation: str


class RelationTupleRequest(BaseModel):
    namespace: str
    object: str
    relation: str
    subject_id: str | None = None
    subject_set: SubjectSetRef | None = None


class SetEnabledRequest(BaseModel):
    enabled: bool


class ThemeLogo(BaseModel):
    src: str
    alt: str


class ThemeColors(BaseModel):
    background: str
    foreground: str
    accent: str
    accentForeground: str
    border: str


class ThemeTypography(BaseModel):
    fontFamily: str


class ThemeFooterLink(BaseModel):
    label: str
    href: str


class ThemeFooter(BaseModel):
    text: str
    links: list[ThemeFooterLink] = []


class TestTokenRequest(BaseModel):
    client_id: str
    client_secret: str
    scope: str = "openid"


class ExchangeCodeRequest(BaseModel):
    client_id: str
    code: str
    redirect_uri: str
    code_verifier: str


class RefreshTokenRequest(BaseModel):
    client_id: str
    refresh_token: str


class ThemeRequest(BaseModel):
    """Mirrors identity-ui/themes/types.ts's Theme interface field-for-field."""

    productName: str
    companyName: str
    logo: ThemeLogo
    favicon: str
    colors: ThemeColors
    typography: ThemeTypography
    footer: ThemeFooter


@app.get("/healthz")
async def healthz() -> JSONResponse:
    return JSONResponse(status_code=200, content={"status": "healthy", "service": "console-api"})


@app.post("/api/v1/identities")
async def create_identity(body: CreateIdentityRequest) -> JSONResponse:
    kratos: KratosAdminClient = app.state.kratos
    traits = {**body.traits, "email": body.email}
    try:
        identity = await kratos.create_identity(
            traits=traits, schema_id=body.schema_id, password=body.password
        )
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to create identity", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Created identity", identity_id=identity.get("id"))
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="identity.create",
        resource_type="identity",
        resource_id=identity.get("id"),
        metadata={"email": body.email},
    )
    return JSONResponse(status_code=201, content=identity)


@app.post("/api/v1/identities/{identity_id}/enable")
async def enable_identity(identity_id: str) -> JSONResponse:
    return await _set_state(identity_id, "active")


@app.post("/api/v1/identities/{identity_id}/disable")
async def disable_identity(identity_id: str) -> JSONResponse:
    return await _set_state(identity_id, "inactive")


async def _set_state(identity_id: str, state: str) -> JSONResponse:
    kratos: KratosAdminClient = app.state.kratos
    try:
        identity = await kratos.set_identity_state(identity_id, state)  # type: ignore[arg-type]
    except IdentityNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown identity: {identity_id}"})
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to set identity state", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Set identity state", identity_id=identity_id, state=state)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action=f"identity.{'enable' if state == 'active' else 'disable'}",
        resource_type="identity",
        resource_id=identity_id,
    )
    return JSONResponse(status_code=200, content=identity)


@app.put("/api/v1/identities/{identity_id}/traits")
async def update_identity_traits(identity_id: str, body: UpdateTraitsRequest) -> JSONResponse:
    kratos: KratosAdminClient = app.state.kratos
    try:
        identity = await kratos.update_traits(identity_id, body.traits)
    except IdentityNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown identity: {identity_id}"})
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to update identity traits", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Updated identity traits", identity_id=identity_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="identity.update", resource_type="identity", resource_id=identity_id
    )
    return JSONResponse(status_code=200, content=identity)


@app.post("/api/v1/identities/{identity_id}/force-verify")
async def force_verify_identity(identity_id: str) -> JSONResponse:
    kratos: KratosAdminClient = app.state.kratos
    try:
        identity = await kratos.force_verify(identity_id)
    except IdentityNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown identity: {identity_id}"})
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to force-verify identity", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Force-verified identity", identity_id=identity_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="identity.verify", resource_type="identity", resource_id=identity_id
    )
    return JSONResponse(status_code=200, content=identity)


@app.post("/api/v1/identities/{identity_id}/reset-password")
async def reset_identity_password(identity_id: str, body: SetPasswordRequest) -> JSONResponse:
    kratos: KratosAdminClient = app.state.kratos
    try:
        identity = await kratos.set_password(identity_id, body.password)
    except IdentityNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown identity: {identity_id}"})
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to reset identity password", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Reset identity password", identity_id=identity_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="identity.password_reset",
        resource_type="identity",
        resource_id=identity_id,
    )
    return JSONResponse(status_code=200, content=identity)


@app.delete("/api/v1/identities/{identity_id}")
async def delete_identity(identity_id: str) -> Response:
    kratos: KratosAdminClient = app.state.kratos
    try:
        await kratos.delete_identity(identity_id)
    except IdentityNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown identity: {identity_id}"})
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to delete identity", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Deleted identity", identity_id=identity_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="identity.delete", resource_type="identity", resource_id=identity_id
    )
    return Response(status_code=204)


@app.delete("/api/v1/sessions/{session_id}")
async def revoke_session(session_id: str) -> Response:
    kratos: KratosAdminClient = app.state.kratos
    try:
        await kratos.revoke_session(session_id)
    except SessionNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown session: {session_id}"})
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to revoke session", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Revoked session", session_id=session_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="session.revoke", resource_type="session", resource_id=session_id
    )
    return Response(status_code=204)


@app.delete("/api/v1/identities/{identity_id}/sessions")
async def revoke_all_sessions(identity_id: str) -> Response:
    kratos: KratosAdminClient = app.state.kratos
    try:
        await kratos.revoke_all_sessions(identity_id)
    except IdentityNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown identity: {identity_id}"})
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to revoke all sessions", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Revoked all sessions", identity_id=identity_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="session.revoke_all", resource_type="identity", resource_id=identity_id
    )
    return Response(status_code=204)


@app.post("/api/v1/clients")
async def create_client(body: ClientRequest) -> JSONResponse:
    hydra: HydraAdminClient = app.state.hydra
    try:
        client = await hydra.create_client(body.to_hydra_payload())
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to create OAuth2 client", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Created OAuth2 client", client_id=client.get("client_id"))
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="client.create",
        resource_type="oauth2_client",
        resource_id=client.get("client_id"),
        metadata={"client_name": body.client_name},
    )
    return JSONResponse(status_code=201, content=client)


@app.put("/api/v1/clients/{client_id}")
async def update_client(client_id: str, body: ClientRequest) -> JSONResponse:
    hydra: HydraAdminClient = app.state.hydra
    payload = {**body.to_hydra_payload(), "client_id": client_id}
    try:
        client = await hydra.update_client(client_id, payload)
    except ClientNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown client: {client_id}"})
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to update OAuth2 client", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Updated OAuth2 client", client_id=client_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="client.update", resource_type="oauth2_client", resource_id=client_id
    )
    return JSONResponse(status_code=200, content=client)


@app.post("/api/v1/clients/{client_id}/rotate-secret")
async def rotate_client_secret(client_id: str) -> JSONResponse:
    hydra: HydraAdminClient = app.state.hydra
    new_secret = secrets.token_urlsafe(32)
    try:
        client = await hydra.patch_client(
            client_id, [{"op": "replace", "path": "/client_secret", "value": new_secret}]
        )
    except ClientNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown client: {client_id}"})
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to rotate client secret", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Rotated OAuth2 client secret", client_id=client_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="client.rotate_secret", resource_type="oauth2_client", resource_id=client_id
    )
    # Hydra never returns the plaintext secret again after this — the
    # console must show it to the operator exactly once, right here.
    return JSONResponse(status_code=200, content={**client, "client_secret": new_secret})


@app.delete("/api/v1/clients/{client_id}")
async def delete_client(client_id: str) -> Response:
    hydra: HydraAdminClient = app.state.hydra
    try:
        await hydra.delete_client(client_id)
    except ClientNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown client: {client_id}"})
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to delete OAuth2 client", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Deleted OAuth2 client", client_id=client_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="client.delete", resource_type="oauth2_client", resource_id=client_id
    )
    return Response(status_code=204)


@app.get("/api/v1/api-keys")
async def get_api_keys() -> JSONResponse:
    hydra: HydraAdminClient = app.state.hydra
    clients = await hydra.list_clients()
    keys = [to_api_key_view(c) for c in clients if is_api_key(c)]
    return JSONResponse(status_code=200, content={"api_keys": [k.model_dump() for k in keys]})


@app.post("/api/v1/api-keys")
async def create_api_key_endpoint(body: ApiKeyCreateRequest) -> JSONResponse:
    hydra: HydraAdminClient = app.state.hydra
    try:
        view, client_secret = await create_api_key(hydra, body)
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to create API key", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Created API key", client_id=view.client_id, name=body.name)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="api_key.create",
        resource_type="api_key",
        resource_id=view.client_id,
        metadata={"name": body.name, "scope": body.scope},
    )
    # Hydra never returns this secret again — shown to the operator exactly
    # once, right here, same as the Clients page's create/rotate-secret flow.
    return JSONResponse(
        status_code=201, content={**view.model_dump(), "client_secret": client_secret}
    )


@app.post("/api/v1/api-keys/{client_id}/enable")
async def enable_api_key_endpoint(client_id: str) -> JSONResponse:
    hydra: HydraAdminClient = app.state.hydra
    try:
        view = await enable_api_key(hydra, client_id)
    except ClientNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown API key: {client_id}"})
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to enable API key", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Enabled API key", client_id=client_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="api_key.enable", resource_type="api_key", resource_id=client_id
    )
    return JSONResponse(status_code=200, content=view.model_dump())


@app.post("/api/v1/api-keys/{client_id}/disable")
async def disable_api_key_endpoint(client_id: str) -> JSONResponse:
    hydra: HydraAdminClient = app.state.hydra
    try:
        view = await disable_api_key(hydra, client_id)
    except ClientNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown API key: {client_id}"})
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to disable API key", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Disabled API key", client_id=client_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="api_key.disable", resource_type="api_key", resource_id=client_id
    )
    return JSONResponse(status_code=200, content=view.model_dump())


@app.delete("/api/v1/api-keys/{client_id}")
async def delete_api_key_endpoint(client_id: str) -> Response:
    hydra: HydraAdminClient = app.state.hydra
    try:
        await hydra.delete_client(client_id)
    except ClientNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown API key: {client_id}"})
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to delete API key", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(logger, logging.INFO, "Deleted API key", client_id=client_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger, action="api_key.delete", resource_type="api_key", resource_id=client_id
    )
    return Response(status_code=204)


@app.post("/api/v1/relation-tuples")
async def create_relation_tuple(body: RelationTupleRequest) -> JSONResponse:
    keto: KetoAdminClient = app.state.keto
    if not body.subject_id and not body.subject_set:
        return JSONResponse(
            status_code=422, content={"error": "one of subject_id or subject_set is required"}
        )
    try:
        await keto.create_relationship(
            body.namespace,
            body.object,
            body.relation,
            subject_id=body.subject_id,
            subject_set=body.subject_set.model_dump() if body.subject_set else None,
        )
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to create relation tuple", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(
        logger,
        logging.INFO,
        "Created relation tuple",
        namespace=body.namespace,
        object=body.object,
        relation=body.relation,
    )
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="permission.grant",
        resource_type=body.namespace,
        resource_id=body.object,
        metadata={
            "relation": body.relation,
            "subject_id": body.subject_id,
            "subject_set": body.subject_set.model_dump() if body.subject_set else None,
        },
    )
    return JSONResponse(status_code=201, content=body.model_dump(exclude_none=True))


@app.delete("/api/v1/relation-tuples")
async def delete_relation_tuple(
    namespace: str,
    object: str,  # noqa: A002 - matches Keto's own field name
    relation: str,
    subject_id: str | None = None,
    subject_set_namespace: str | None = None,
    subject_set_object: str | None = None,
    subject_set_relation: str | None = None,
) -> Response:
    keto: KetoAdminClient = app.state.keto
    has_subject_set = (
        subject_set_namespace
        and subject_set_object is not None
        and subject_set_relation is not None
    )
    subject_set = (
        {
            "namespace": subject_set_namespace,
            "object": subject_set_object,
            "relation": subject_set_relation,
        }
        if has_subject_set
        else None
    )
    try:
        await keto.delete_relationship(
            namespace, object, relation, subject_id=subject_id, subject_set=subject_set
        )
    except httpx.HTTPStatusError as error:
        log(logger, logging.ERROR, "Failed to delete relation tuple", error=str(error))
        return JSONResponse(status_code=error.response.status_code, content=_error_body(error))
    log(
        logger,
        logging.INFO,
        "Deleted relation tuple",
        namespace=namespace,
        object=object,
        relation=relation,
    )
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="permission.revoke",
        resource_type=namespace,
        resource_id=object,
        metadata={"relation": relation, "subject_id": subject_id, "subject_set": subject_set},
    )
    return Response(status_code=204)


@app.get("/api/v1/identity-providers")
async def get_identity_providers() -> JSONResponse:
    try:
        providers = load_providers(_identity_providers_path())
    except (FileNotFoundError, ValueError) as error:
        return JSONResponse(status_code=500, content={"error": str(error)})
    # Real, non-secret metadata from Kratos's own rendered config (see
    # load_provider_metadata's docstring) — merged in, not fabricated;
    # absent entirely (empty dict) if the rendered file isn't mounted/
    # doesn't exist yet, which every provider entry below handles by simply
    # omitting the extra fields rather than guessing at them.
    metadata = load_provider_metadata(_kratos_rendered_config_path())
    enriched = [{**p, **metadata.get(p["id"], {})} for p in providers]
    return JSONResponse(status_code=200, content={"providers": enriched})


@app.post("/api/v1/identity-providers/{provider_id}/enabled")
async def set_identity_provider_enabled(provider_id: str, body: SetEnabledRequest) -> JSONResponse:
    """Toggle one provider's enabled flag in configuration/identity-providers.yaml.

    Does NOT restart Kratos — Kratos has no runtime config-reload API in
    the open-source edition, so this takes effect on the next
    config-render + Kratos restart (see identity_providers.py's docstring
    and the identity-providers-render compose service).
    """
    try:
        set_provider_enabled(_identity_providers_path(), provider_id, body.enabled)
    except UnknownProviderError:
        return JSONResponse(
            status_code=404, content={"error": f"Unknown identity provider: {provider_id}"}
        )
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="identity_provider.enable" if body.enabled else "identity_provider.disable",
        resource_type="identity_provider",
        resource_id=provider_id,
    )
    return JSONResponse(
        status_code=200, content={"provider_id": provider_id, "enabled": body.enabled}
    )


@app.get("/api/v1/theme")
async def get_theme() -> JSONResponse:
    try:
        theme = load_theme(_theme_path())
    except (FileNotFoundError, ValueError) as error:
        return JSONResponse(status_code=500, content={"error": str(error)})
    return JSONResponse(status_code=200, content=theme)


@app.put("/api/v1/theme")
async def update_theme(body: ThemeRequest) -> JSONResponse:
    """Overwrite configuration/themes/neobim.yaml with the submitted theme.

    Takes effect on the next identity-ui restart — themes/load-theme.ts
    caches the parsed theme for the life of the Node process (see
    theme.py's docstring).
    """
    theme = body.model_dump()
    write_theme(_theme_path(), theme)
    log(logger, logging.INFO, "Updated theme", product_name=body.productName)
    audit: AuditClient = app.state.audit
    await audit.record(logger, action="theme.update", resource_type="theme", resource_id="neobim")
    return JSONResponse(status_code=200, content=theme)


@app.get("/api/v1/theme/history")
async def get_theme_history() -> JSONResponse:
    versions = list_theme_history(_theme_path())
    return JSONResponse(status_code=200, content={"versions": versions})


@app.get("/api/v1/theme/history/{version_id}")
async def get_theme_history_version_endpoint(version_id: str) -> JSONResponse:
    try:
        theme = get_theme_history_version(_theme_path(), version_id)
    except ThemeVersionNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown version: {version_id}"})
    return JSONResponse(status_code=200, content=theme)


@app.post("/api/v1/theme/history/{version_id}/rollback")
async def rollback_theme_endpoint(version_id: str) -> JSONResponse:
    try:
        theme = rollback_theme(_theme_path(), version_id)
    except ThemeVersionNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Unknown version: {version_id}"})
    log(logger, logging.INFO, "Rolled back theme", version_id=version_id)
    audit: AuditClient = app.state.audit
    await audit.record(
        logger,
        action="theme.rollback",
        resource_type="theme",
        resource_id="neobim",
        metadata={"version_id": version_id},
    )
    return JSONResponse(status_code=200, content=theme)


@app.post("/api/v1/developer/test-token")
async def test_token(body: TestTokenRequest) -> JSONResponse:
    """Developer Portal's token tester: forwards a client_credentials
    request straight to Hydra's public token endpoint — exactly what an
    external developer's own app would do. The secret is never persisted;
    it only passes through this one request."""
    hydra_public: HydraPublicClient = app.state.hydra_public
    try:
        token = await hydra_public.client_credentials_token(
            body.client_id, body.client_secret, body.scope
        )
    except TokenRequestError as error:
        return JSONResponse(status_code=error.status_code, content=error.body)
    return JSONResponse(status_code=200, content=token)


@app.post("/api/v1/developer/exchange-code")
async def exchange_code(body: ExchangeCodeRequest) -> JSONResponse:
    """Authorization Code + PKCE playground's token exchange — forwards to
    Hydra's real public token endpoint. No client_secret: this is a public
    (token_endpoint_auth_method: none) client, so Hydra itself validates the
    code_verifier against the code_challenge sent to /oauth2/auth."""
    hydra_public: HydraPublicClient = app.state.hydra_public
    try:
        token = await hydra_public.authorization_code_token(
            body.client_id, body.code, body.redirect_uri, body.code_verifier
        )
    except TokenRequestError as error:
        return JSONResponse(status_code=error.status_code, content=error.body)
    return JSONResponse(status_code=200, content=token)


@app.post("/api/v1/developer/refresh-token")
async def refresh_token_endpoint(body: RefreshTokenRequest) -> JSONResponse:
    hydra_public: HydraPublicClient = app.state.hydra_public
    try:
        token = await hydra_public.refresh_token(body.client_id, body.refresh_token)
    except TokenRequestError as error:
        return JSONResponse(status_code=error.status_code, content=error.body)
    return JSONResponse(status_code=200, content=token)


def _error_body(error: httpx.HTTPStatusError) -> dict[str, Any]:
    try:
        body: dict[str, Any] = error.response.json()
        return body
    except ValueError:
        return {"error": str(error)}
