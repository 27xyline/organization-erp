from __future__ import annotations

import asyncio
import json

from app.core.config import Settings
from app.db.session import create_engine, create_session_factory
from app.services.cli import VerifyDataService


async def _run() -> dict[str, int]:
    engine = create_engine(Settings())
    try:
        async with create_session_factory(engine)() as session:
            return await VerifyDataService().verify(session)
    finally:
        await engine.dispose()


def main() -> None:
    result = asyncio.run(_run())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if any(result.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
