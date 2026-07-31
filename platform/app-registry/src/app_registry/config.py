from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# src/app_registry/config.py -> src/app_registry -> src -> app-registry -> platform -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[4]
_DEFAULT_REGISTRY_PATH = _REPO_ROOT / "integrations" / "applications"
_DEFAULT_SCHEMA_PATH = _REPO_ROOT / "configuration" / "schemas" / "app-registry.schema.json"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(populate_by_name=True)

    hydra_admin_url: str = Field(
        default="http://localhost:4445",
        validation_alias=AliasChoices("hydra_admin_url", "HYDRA_ADMIN_URL"),
    )
    registry_path: Path = Field(
        default=_DEFAULT_REGISTRY_PATH,
        validation_alias=AliasChoices(
            "registry_path", "REGISTRY_PATH", "APP_REGISTRY_REGISTRY_PATH"
        ),
    )
    schema_path: Path = Field(
        default=_DEFAULT_SCHEMA_PATH,
        validation_alias=AliasChoices("schema_path", "APP_REGISTRY_SCHEMA_PATH"),
    )
    log_level: str = Field(
        default="info", validation_alias=AliasChoices("log_level", "PLATFORM_LOG_LEVEL")
    )
    port: int = Field(
        default=8080, validation_alias=AliasChoices("port", "APP_REGISTRY_PORT", "PORT")
    )
    platform_env: str = Field(
        default="production", validation_alias=AliasChoices("platform_env", "PLATFORM_ENV")
    )
    otel_enabled: bool = Field(
        default=True, validation_alias=AliasChoices("otel_enabled", "OTEL_ENABLED")
    )
    otel_endpoint: str = Field(
        default="http://otel-collector:4317",
        validation_alias=AliasChoices("otel_endpoint", "OTEL_ENDPOINT"),
    )

    @property
    def allow_default_secret(self) -> bool:
        return self.platform_env in ("local", "dev")


@lru_cache
def get_settings() -> Settings:
    return Settings()
