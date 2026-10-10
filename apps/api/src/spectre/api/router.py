from fastapi import APIRouter

from spectre.api.routes import analyses, meta, scenarios, simulations

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(meta.router, tags=["meta"])
api_router.include_router(scenarios.router)
api_router.include_router(analyses.router)
api_router.include_router(simulations.router)
