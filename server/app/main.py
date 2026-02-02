import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from server.app.config import Config
from server.app.database import init_db, get_session_factory
from server.app.routers import layouts, widgets, display, integrations
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


@app.get("/api/health")
async def health():
    return {"status": "ok"}
