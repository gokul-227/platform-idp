from __future__ import annotations

from email_service.config import Settings
from email_service.logging_config import configure_logging
from email_service.providers import get_email_provider

logger = configure_logging("test")


def test_get_email_provider_returns_smtp_for_smtp() -> None:
    settings = Settings(email_provider="smtp")
    provider = get_email_provider(settings, logger)
    assert type(provider).__name__ == "SmtpEmailProvider"


def test_get_email_provider_falls_back_to_smtp_for_unknown() -> None:
    settings = Settings(email_provider="sendgrid")
    provider = get_email_provider(settings, logger)
    assert type(provider).__name__ == "SmtpEmailProvider"
