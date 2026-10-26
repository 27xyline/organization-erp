from __future__ import annotations

import asyncio
import json

from app.core.config import Settings
from app.db.registry import Base
from app.db.session import create_engine, create_session_factory
from app.integrations.cli import SqlAlchemyVerifyDataGateway
from app.integrations.cli_storage import LocalDocumentFileVerificationAdapter
from app.integrations.document_storage import LocalDocumentStorage
from app.services.cli import VerifyDataService

MODEL_METADATA = Base.metadata


async def _run() -> dict[str, int]:
    if "mols" not in MODEL_METADATA.tables:
        raise RuntimeError("Complete SQLAlchemy model registry was not loaded")
    settings = Settings()
    engine = create_engine(settings)
    storage = LocalDocumentStorage(settings.document_storage_root)
    try:
        service = VerifyDataService(
            SqlAlchemyVerifyDataGateway(create_session_factory(engine)),
            LocalDocumentFileVerificationAdapter(storage),
        )
        return await service.verify()
    finally:
        storage.close()
        await engine.dispose()


def main() -> None:
    result = asyncio.run(_run())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if any(result.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
