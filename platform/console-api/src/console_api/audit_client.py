"""Thin client for platform/audit-service. Best-effort: a failure to record
an audit event never fails the real mutation it's describing — logged and
swallowed, matching the same "log but don't block" tradeoff structlog's own
error-path logging already makes throughout this service.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from console_api.logging_config import log


class AuditClient:
    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(base_url=base_url, timeout=5.0)

    async def record(
        self,
        logger: logging.Logger,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        actor_id: str | None = None,
    ) -> None:
        try:
            response = await self._client.post(
                "/api/v1/events",
                json={
                    "actor_id": actor_id,
                    "action": action,
                    "resource_type": resource_type,
                    "resource_id": resource_id,
                    "metadata": metadata or {},
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            log(
                logger,
                logging.WARNING,
                "Failed to record audit event",
                action=action,
                resource_type=resource_type,
                error=str(error),
            )

    async def aclose(self) -> None:
        await self._client.aclose()
