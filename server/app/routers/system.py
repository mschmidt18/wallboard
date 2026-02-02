from typing import Optional
from fastapi import APIRouter

from server.app.config import Config

router = APIRouter(prefix="/api/system", tags=["system"])

_config: Optional[Config] = None


def set_config(config: Config) -> None:
    global _config
    _config = config
