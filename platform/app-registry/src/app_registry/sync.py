from __future__ import annotations

import os
from typing import Any

import structlog

from app_registry.config import Settings
from app_registry.hydra_client import HydraAdminClient
from app_registry.registry_loader import list_registry_files, load_all_definitions
from app_registry.types import (
    AppRegistryDefinition,
    HydraClientSummary,
    RegistryInfo,
    SyncResult,
    SyncSummary,
)

DEFAULT_DEV_SECRET = "default_client_secret_do_not_use_in_production"  # noqa: S105 - dev-only fallback, gated by allow_default_secret


class HydraRegistrySync:
    def __init__(
        self,
        settings: Settings,
        hydra: HydraAdminClient,
        logger: structlog.stdlib.BoundLogger,
    ) -> None:
        self._settings = settings
        self._hydra = hydra
        self._logger = logger

    @property
    def settings(self) -> Settings:
        return self._settings

    def _resolve_client_secret(self, app: AppRegistryDefinition) -> str:
        if app.client_secret_env_var:
            secret = os.environ.get(app.client_secret_env_var)
            if secret:
                return secret

        if self._settings.allow_default_secret:
            self._logger.warning(
                "Using development fallback client secret",
                client_id=app.client_id,
                env_var=app.client_secret_env_var,
            )
            return DEFAULT_DEV_SECRET

        raise ValueError(
            f"Missing client secret for {app.client_id}. "
            f"Set {app.client_secret_env_var or 'client_secret_env_var'}."
        )

    def _to_hydra_client(self, app: AppRegistryDefinition) -> dict[str, Any]:
        return {
            "client_id": app.client_id,
            "client_name": app.client_name,
            "redirect_uris": app.redirect_uris,
            "post_logout_redirect_uris": app.post_logout_redirect_uris,
            "grant_types": app.grant_types,
            "scope": app.scope,
            "token_endpoint_auth_method": app.token_endpoint_auth_method or "client_secret_post",
            "client_secret": self._resolve_client_secret(app),
            "metadata": {
                "tenant_id": app.tenant_id,
                "tags": app.tags,
                "enabled": app.is_enabled,
            },
        }

    async def sync(self, dry_run: bool = False) -> SyncSummary:
        definitions = load_all_definitions(self._settings.registry_path, self._settings.schema_path)
        results: list[SyncResult] = []

        self._logger.info(
            "Starting application registry sync",
            registry_path=str(self._settings.registry_path),
            definition_count=len(definitions),
            dry_run=dry_run,
        )

        for filename, app in definitions:
            try:
                if app.enabled is False:
                    existing = await self._hydra.get_oauth2_client(app.client_id)
                    if existing is None:
                        results.append(
                            SyncResult(
                                client_id=app.client_id,
                                action="skipped",
                                message="disabled in registry",
                            )
                        )
                        continue

                    if dry_run:
                        results.append(
                            SyncResult(
                                client_id=app.client_id,
                                action="deleted",
                                message="[dry-run] would delete existing Hydra client (disabled)",
                            )
                        )
                        continue

                    await self._hydra.delete_oauth2_client(app.client_id)
                    results.append(
                        SyncResult(
                            client_id=app.client_id,
                            action="deleted",
                            message="disabled in registry — Hydra client removed",
                        )
                    )
                    self._logger.info(
                        "Deleted disabled application's OAuth2 client", client_id=app.client_id
                    )
                    continue

                existing = await self._hydra.get_oauth2_client(app.client_id)
                action: str = "updated" if existing else "created"

                if dry_run:
                    results.append(
                        SyncResult(
                            client_id=app.client_id,
                            action=action,
                            message=f"[dry-run] from {filename}",
                        )
                    )
                    continue

                payload = self._to_hydra_client(app)
                if existing:
                    await self._hydra.set_oauth2_client(app.client_id, payload)
                else:
                    await self._hydra.create_oauth2_client(payload)

                results.append(
                    SyncResult(
                        client_id=app.client_id,
                        action=action,
                        message=f"synced from {filename}",
                    )
                )
                self._logger.info(
                    "Synchronized OAuth2 client", client_id=app.client_id, action=action
                )
            except Exception as error:  # noqa: BLE001 - recorded per-definition, sync must not abort
                results.append(
                    SyncResult(client_id=app.client_id, action="failed", message=str(error))
                )
                self._logger.error(
                    "Failed to sync application definition",
                    filename=filename,
                    client_id=app.client_id,
                    error=str(error),
                )

        return SyncSummary(
            dry_run=dry_run,
            registry_path=str(self._settings.registry_path),
            processed=len(results),
            results=results,
        )

    async def list_hydra_clients(self) -> list[HydraClientSummary]:
        clients = await self._hydra.list_oauth2_clients()
        return [HydraClientSummary.model_validate(client) for client in clients]

    async def delete_hydra_client(self, client_id: str) -> None:
        await self._hydra.delete_oauth2_client(client_id)

    def describe_registry(self) -> RegistryInfo:
        files = list_registry_files(self._settings.registry_path)
        return RegistryInfo(
            registry_path=str(self._settings.registry_path), files=files, count=len(files)
        )
