"""
Correlation ID middleware.

Reads the X-Correlation-Id header from every incoming request and stores it
in a contextvars.ContextVar so it is ambient throughout the request lifecycle —
the Python equivalent of SLF4J's MDC in the Java services.

The ContextVar is injected into every log record by CorrelationIdFilter in
logging_config.py, so all log lines carry the correlationId field automatically
without explicit passing.

Production note: In a full OpenTelemetry setup this would be replaced by the
OTLP W3C traceparent/tracestate propagation, which Jaeger/Tempo can use to
stitch spans from all services into a single trace. The manual header approach
here gives the same observability benefit for a single log aggregator (ELK,
Datadog) at zero infrastructure cost.
"""

import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

CORRELATION_ID_HEADER = "X-Correlation-Id"

# Module-level ContextVar — one value per async task (request), not shared across requests.
correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="")


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get(CORRELATION_ID_HEADER) or str(uuid.uuid4())
        token = correlation_id_var.set(correlation_id)
        try:
            response = await call_next(request)
            response.headers[CORRELATION_ID_HEADER] = correlation_id
            return response
        finally:
            correlation_id_var.reset(token)
