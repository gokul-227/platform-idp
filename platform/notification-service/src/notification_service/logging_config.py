"""Structured JSON logging via structlog, matching configuration/platform.yaml's
observability.logging.format convention."""

from __future__ import annotations

import logging
import sys

import structlog


def configure_logging(service: str, level: str = "info") -> structlog.stdlib.BoundLogger:
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level.upper())
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
    )
    logger: structlog.stdlib.BoundLogger = structlog.get_logger(service).bind(service=service)
    return logger
