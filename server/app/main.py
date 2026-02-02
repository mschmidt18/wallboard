import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from server.app.config import Config
from server.app.database import init_db, get_session_factory
from server.app.routers import layouts, widgets, display, integrations, google_data
from server.app.routers import settings as settings_router
from server.app.services.refresh import start_refresh_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = Config.default()
    engine = init_db(config.db_path)
    session_factory = get_session_factory(engine)
    refresh_task = asyncio.create_task(
        start_refresh_loop(session_factory, config.display_refresh_interval)
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


@app.get("/api/health")
async def health():
    return {"status": "ok"}


frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"

if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")
