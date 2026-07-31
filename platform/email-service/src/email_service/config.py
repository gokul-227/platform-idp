from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(populate_by_name=True)

    port: int = Field(default=8084, validation_alias=AliasChoices("EMAIL_SERVICE_PORT", "PORT"))
    log_level: str = Field(default="info", alias="PLATFORM_LOG_LEVEL")
    email_provider: str = Field(default="smtp", alias="EMAIL_PROVIDER")
    # Populated by COPY plugins ./plugins in this service's Dockerfile.
    plugins_dir: Path = Field(default=Path("/app/plugins"), alias="PLUGINS_DIR")
    smtp_host: str = Field(default="localhost", alias="SMTP_HOST")
    smtp_port: int = Field(default=1025, alias="SMTP_PORT")
    smtp_user: str = Field(default="", alias="SMTP_USER")
    smtp_password: str = Field(default="", alias="SMTP_PASSWORD")
    smtp_tls_enabled: bool = Field(default=False, alias="SMTP_TLS_ENABLED")
    smtp_from_address: str = Field(default="noreply@platform.local", alias="SMTP_FROM_ADDRESS")
    smtp_from_name: str = Field(default="Identity Platform", alias="SMTP_FROM_NAME")
    otel_enabled: bool = Field(default=True, alias="OTEL_ENABLED")
    otel_endpoint: str = Field(default="http://otel-collector:4317", alias="OTEL_ENDPOINT")


@lru_cache
def get_settings() -> Settings:
    return Settings()
