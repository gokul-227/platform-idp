"""OpenTelemetry tracing setup, matching configuration/platform.yaml's
observability.tracing convention (OTEL_ENABLED / OTEL_ENDPOINT)."""

from __future__ import annotations

from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from email_service.config import Settings


def configure_tracing(app: FastAPI, settings: Settings) -> None:
    if not settings.otel_enabled:
        return

    provider = TracerProvider(resource=Resource.create({SERVICE_NAME: "email-service"}))
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otel_endpoint))
    )
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)
