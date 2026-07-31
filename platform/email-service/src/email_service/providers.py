"""Email provider selection via the shared plugin framework (docs/10-reference/adr/ADR-0004).

The actual SMTP implementation lives in integrations/email/smtp/provider.py, discovered
at startup from settings.plugins_dir — it is not defined in this module.
"""

from __future__ import annotations

from typing import Protocol

import structlog
from plugin_framework import PluginRegistry, discover_plugins
from plugin_framework.registry import PluginNotFoundError

from email_service.config import Settings

DEFAULT_PROVIDER_NAME = "smtp"


class EmailProvider(Protocol):
    async def send_mail(self, to: str, subject: str, html: str, text: str) -> bool: ...


def get_email_provider(settings: Settings, logger: structlog.stdlib.BoundLogger) -> EmailProvider:
    provider_name = settings.email_provider.lower()
    logger.info("Loading configured email provider", provider=provider_name)

    registry = PluginRegistry(discover_plugins(settings.plugins_dir, plugin_type="email"))
    try:
        provider_class = registry.select(provider_name)
    except PluginNotFoundError:
        logger.warning(
            "Unknown email provider; falling back to smtp",
            provider=provider_name,
            available=registry.names(),
        )
        provider_class = registry.select(DEFAULT_PROVIDER_NAME)

    provider: EmailProvider = provider_class(settings, logger)
    return provider
