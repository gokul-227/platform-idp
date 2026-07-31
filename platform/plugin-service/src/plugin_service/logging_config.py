"""Structured JSON logging, matching the platform's `structured_logging` convention
(configuration/platform.yaml: observability.logging.format)."""

from __future__ import annotations

import json
import logging
import os
import sys
from typing import Any


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname.lower(),
            "service": "plugin-service",
            "message": record.getMessage(),
        }
        extra_fields = getattr(record, "extra_fields", None)
        if extra_fields:
            payload.update(extra_fields)
        return json.dumps(payload)


def configure_logging() -> logging.Logger:
    logger = logging.getLogger("plugin_service")
    level = os.environ.get("PLATFORM_LOG_LEVEL", "info").upper()
    logger.setLevel(level)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logger.handlers = [handler]
    logger.propagate = False
    return logger


def log(logger: logging.Logger, level: int, message: str, **fields: object) -> None:
    logger.log(level, message, extra={"extra_fields": fields})
