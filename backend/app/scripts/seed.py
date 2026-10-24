from __future__ import annotations

import asyncio

from app.core.config import Settings
from app.db import registry as _model_registry  # noqa: F401
from app.db.session import create_engine, create_session_factory
from app.repositories.cli import SqlAlchemyDemoSeedRepository
from app.scripts.cli_support import require_safe_seed_target
from app.services.cli import DemoSeedService


async def _run() -> None:
    settings = Settings()
    database = require_safe_seed_target(settings)
    engine = create_engine(settings)
    try:
        async with create_session_factory(engine).begin() as session:
            result = await DemoSeedService(SqlAlchemyDemoSeedRepository(session)).seed()
        print(f"Учебные данные применены к {database}: {result}")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(_run())
