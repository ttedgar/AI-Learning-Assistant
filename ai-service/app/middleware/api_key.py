import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings

logger = logging.getLogger(__name__)

_EXEMPT_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}


class InternalApiKeyMiddleware(BaseHTTPMiddleware):
    """
    Validates the X-Internal-Api-Key header on every non-exempt request.

    Design rationale (DIP at architecture level):
      The worker depends on this service's *interface*, not on Gemini directly.
      This middleware enforces that only trusted internal callers (the worker)
      can reach the AI endpoints.

    Production alternative:
      Replace this shared-secret approach with mTLS: the worker presents a
      client certificate signed by an internal CA, and this service validates it.
      mTLS gives per-caller identity, rotation without shared secrets, and works
      naturally in service-mesh environments (Istio, Linkerd).
    """

    async def dispatch(self, request: Request, call_next):
        if request.url.path in _EXEMPT_PATHS:
            return await call_next(request)

        settings = get_settings()
        api_key = request.headers.get("X-Internal-Api-Key")

        if not api_key or api_key != settings.internal_api_key:
            logger.warning(
                "Rejected request — invalid or missing X-Internal-Api-Key",
                extra={"path": request.url.path, "method": request.method},
            )
            return JSONResponse(
                status_code=401,
                content={
                    "detail": "Invalid or missing X-Internal-Api-Key header.",
                    "type": "https://httpstatuses.com/401",
                },
            )

        return await call_next(request)
