from contextlib import asynccontextmanager
from fastapi import FastAPI
from server.app.config import Config
from server.app.database import init_db
from server.app.routers import layouts


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = Config.default()
    init_db(config.db_path)
    yield


app = FastAPI(title="Wallboard", lifespan=lifespan)
app.include_router(layouts.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
