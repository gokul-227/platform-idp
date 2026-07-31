"""SMTP EmailProvider plugin. Constructor contract: SmtpEmailProvider(settings, logger)
where `settings` exposes smtp_host/smtp_port/smtp_user/smtp_password/smtp_tls_enabled/
smtp_from_name/smtp_from_address, and `logger` is a structlog-style BoundLogger.
See platform/email-service/src/email_service/providers.py for the calling convention."""

from __future__ import annotations

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import Any

import aiosmtplib


class SmtpEmailProvider:
    def __init__(self, settings: Any, logger: Any) -> None:
        self._settings = settings
        self._logger = logger
        logger.info(
            "Initializing SMTP email provider", host=settings.smtp_host, port=settings.smtp_port
        )

    async def send_mail(self, to: str, subject: str, html: str, text: str) -> bool:
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = formataddr(
            (self._settings.smtp_from_name, self._settings.smtp_from_address)
        )
        message["To"] = to
        if text:
            message.attach(MIMEText(text, "plain"))
        if html:
            message.attach(MIMEText(html, "html"))

        try:
            await aiosmtplib.send(
                message,
                hostname=self._settings.smtp_host,
                port=self._settings.smtp_port,
                username=self._settings.smtp_user or None,
                password=self._settings.smtp_password or None,
                use_tls=self._settings.smtp_tls_enabled,
            )
            self._logger.info("Email sent successfully via SMTP", to=to, subject=subject)
            return True
        except (aiosmtplib.SMTPException, OSError) as error:
            self._logger.error("SMTP send failed", error=str(error))
            return False
