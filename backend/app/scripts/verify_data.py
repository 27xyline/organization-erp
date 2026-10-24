from __future__ import annotations

import asyncio
import json

from app.core.config import Settings
from app.db.registry import Base
from app.db.session import create_engine, create_session_factory
from app.repositories.cli import SqlAlchemyVerifyDataRepository
from app.services.cli import VerifyDataService

MODEL_METADATA = Base.metadata


async def _run() -> dict[str, int]:
    if "mols" not in MODEL_METADATA.tables:
        raise RuntimeError("Complete SQLAlchemy model registry was not loaded")
    engine = create_engine(Settings())
    try:
        async with create_session_factory(engine)() as session:
            return await VerifyDataService(SqlAlchemyVerifyDataRepository(session)).verify()
    finally:
        await engine.dispose()


def main() -> None:
    result = asyncio.run(_run())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if any(result.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
