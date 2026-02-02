import asyncio
import time
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import structlog
from server.app.config import Config
from server.app.database import init_db, get_session_factory
from server.app.logging import setup_logging
from server.app.routers import layouts, widgets, display, integrations, google_data
from server.app.routers import settings as settings_router
from server.app.routers import system as system_router
from server.app.services.refresh import start_refresh_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = Config.default()
    setup_logging(level=config.log_level)
    settings_router.set_config(config)
    display.set_config(config)
    integrations.set_config(config)
    google_data.set_config(config)
    system_router.set_config(config)
    engine = init_db(config.db_path)
    session_factory = get_session_factory(engine)
    refresh_task = asyncio.create_task(
        start_refresh_loop(session_factory, config.display_refresh_interval, config)
    )
    yield
    refresh_task.cancel()
    try:
        await refresh_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Wallboard", lifespan=lifespan)
app.include_router(layouts.router)
app.include_router(widgets.router)
app.include_router(settings_router.router)
app.include_router(display.router)
app.include_router(integrations.router)
app.include_router(google_data.router)
app.include_router(system_router.router)


logger = structlog.get_logger()


@app.middleware("http")
async def log_requests(request: Request, call_next):
    if request.url.path == "/api/display" or request.url.path == "/api/health":
        return await call_next(request)
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = round((time.monotonic() - start) * 1000, 1)
    logger.info(
        "request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=duration_ms,
    )
    return response


@app.get("/api/health")
async def health():
    return {"status": "ok"}


frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"

if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.resolve().is_relative_to(frontend_dist.resolve()):
            if file_path.is_file():
                return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")
