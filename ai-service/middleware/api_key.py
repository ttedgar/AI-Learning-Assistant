"""
Internal API key middleware.

Validates the X-Internal-Api-Key header on every request except /health.
Returns HTTP 401 for missing or incorrect keys.

Production note: replace with mTLS — mutual TLS certificate verification
provides stronger guarantees without a shared secret that can leak.
"""

import logging

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from config import settings

logger = logging.getLogger(__name__)

# Routes that bypass API key validation
_PUBLIC_PATHS = {"/health", "/docs", "/openapi.json"}


class ApiKeyMiddleware(BaseHTTPMiddleware):

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in _PUBLIC_PATHS:
            return await call_next(request)

        api_key = request.headers.get("X-Internal-Api-Key")
        if not api_key or api_key != settings.internal_api_key:
            logger.warning(
                "Rejected request: missing or invalid X-Internal-Api-Key",
                extra={"path": request.url.path},
            )
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or missing X-Internal-Api-Key"},
            )

        return await call_next(request)
