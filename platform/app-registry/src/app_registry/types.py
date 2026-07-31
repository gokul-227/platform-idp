"""Registry definition and sync result models.

Mirrors configuration/schemas/app-registry.schema.json, which is the validated
contract for files under integrations/applications/ — see registry_loader.py.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class AppRegistryDefinition(BaseModel):
    """One Hydra OAuth2/OIDC client, loaded from integrations/applications/*.yaml.

    configuration/schemas/app-registry.schema.json sets additionalProperties: false
    and is validated first in registry_loader.py, so no extra fields reach
    this model.
    """

    client_id: str
    client_name: str
    redirect_uris: list[str]
    post_logout_redirect_uris: list[str] = []
    grant_types: list[str]
    scope: str
    client_secret_env_var: str | None = None
    token_endpoint_auth_method: str | None = None
    enabled: bool | None = None
    tenant_id: str | None = None
    tags: list[str] = []

    @property
    def is_enabled(self) -> bool:
        return self.enabled is not False


class SyncResult(BaseModel):
    client_id: str
    action: Literal["created", "updated", "skipped", "deleted", "failed"]
    message: str | None = None


class SyncSummary(BaseModel):
    dry_run: bool
    registry_path: str
    processed: int
    results: list[SyncResult]


class RegistryDefinitionSummary(BaseModel):
    filename: str
    client_id: str
    client_name: str
    enabled: bool
    tenant_id: str | None
    tags: list[str]


class RegistryInfo(BaseModel):
    registry_path: str
    files: list[str]
    count: int


class HydraClientSummary(BaseModel):
    client_id: str
    client_name: str | None = None
    grant_types: list[str] | None = None
    redirect_uris: list[str] | None = None
