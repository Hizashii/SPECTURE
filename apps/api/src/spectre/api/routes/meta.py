from fastapi import APIRouter

from spectre.schemas.api import CapabilitiesResponse, HealthResponse
from spectre.services.capabilities import app_version, describe_capabilities

router = APIRouter()


@router.get("/health", summary="Service health and version")
def health() -> HealthResponse:
    return HealthResponse(status="ok", version=app_version())


@router.get("/capabilities", summary="What the engine implements and what it does not")
def capabilities() -> CapabilitiesResponse:
    return describe_capabilities()
