from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(populate_by_name=True)

    port: int = Field(
        default=8085, validation_alias=AliasChoices("NOTIFICATION_SERVICE_PORT", "PORT")
    )
    log_level: str = Field(default="info", alias="PLATFORM_LOG_LEVEL")
    email_service_url: str = Field(
        default="http://email-service:8084/send", alias="EMAIL_SERVICE_URL"
    )
    otel_enabled: bool = Field(default=True, alias="OTEL_ENABLED")
    otel_endpoint: str = Field(default="http://otel-collector:4317", alias="OTEL_ENDPOINT")


@lru_cache
def get_settings() -> Settings:
    return Settings()
