"""
Prometheus metrics endpoint.

Exposes all registered prometheus_client metrics in the Prometheus text exposition format.
Prometheus scrapes this endpoint periodically (default: every 15 s).

Production note: In production, this endpoint would be served on a separate internal
management port (not 8000) so it is not reachable from the public internet. Here it is
exposed on the main port but exempted from the X-Internal-Api-Key check — acceptable
for a single-instance local/Railway deployment where network-level access control is
the outer defence.
"""

from fastapi import APIRouter
from fastapi.responses import Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

router = APIRouter()


@router.get(
    "/metrics",
    include_in_schema=False,  # Hide from Swagger UI — not an API endpoint
    response_class=Response,
)
async def prometheus_metrics() -> Response:
    """Prometheus text format metrics scrape endpoint."""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
