from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
async def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready", response_model=None)
async def ready(request: Request) -> dict[str, str] | JSONResponse:
    settings = request.app.state.settings
    try:
        async with asyncio.timeout(settings.db_readiness_timeout_seconds):
            async with request.app.state.engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
    except (TimeoutError, SQLAlchemyError, OSError) as exc:
        logger.warning("Readiness check failed (%s)", type(exc).__name__)
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return {"status": "ok"}
