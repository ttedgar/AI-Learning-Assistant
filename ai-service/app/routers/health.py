from fastapi import APIRouter

from app.models.responses import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check() -> HealthResponse:
    """
    Liveness probe endpoint.

    Returns 200 OK when the service is up. Railway, Kubernetes, and Docker
    health checks all hit this endpoint to decide whether to route traffic
    or restart the container.
    """
    return HealthResponse(status="ok")
