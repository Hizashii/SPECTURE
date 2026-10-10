from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from spectre.api.errors import install_error_handlers
from spectre.api.limits import BodySizeLimit
from spectre.api.router import api_router
from spectre.core.config import get_settings
from spectre.persistence.migrate import upgrade_to_head
from spectre.services.capabilities import app_version

MAX_REQUEST_BYTES = 64 * 1024


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    upgrade_to_head()  # local SQLite: keep the schema current without a manual step
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="SPECTRE API",
        summary="Understand the path. Break the chain.",
        version=app_version(),
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    app.add_middleware(BodySizeLimit, max_bytes=MAX_REQUEST_BYTES)
    install_error_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
