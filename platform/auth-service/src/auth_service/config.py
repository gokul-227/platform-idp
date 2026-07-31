from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(populate_by_name=True)

    port: int = Field(default=8083, validation_alias=AliasChoices("AUTH_SERVICE_PORT", "PORT"))
    log_level: str = Field(default="info", alias="PLATFORM_LOG_LEVEL")
    public_base_url: str = Field(default="http://localhost:4455", alias="PLATFORM_BASE_URL")
    hydra_admin_url: str = Field(default="http://hydra:4445", alias="HYDRA_ADMIN_URL")
    kratos_public_url: str = Field(default="http://kratos:4433", alias="KRATOS_PUBLIC_URL")
    kratos_admin_url: str = Field(default="http://kratos:4434", alias="KRATOS_ADMIN_URL")
    otel_enabled: bool = Field(default=True, alias="OTEL_ENABLED")
    otel_endpoint: str = Field(default="http://otel-collector:4317", alias="OTEL_ENDPOINT")


@lru_cache
def get_settings() -> Settings:
    return Settings()
