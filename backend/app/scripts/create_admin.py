from __future__ import annotations

import asyncio
import getpass

from app.core.config import Settings
from app.db import registry as _model_registry  # noqa: F401
from app.db.session import create_engine, create_session_factory
from app.db.uow import create_unit_of_work_factory
from app.integrations.password_hash import Argon2PasswordHasher
from app.services.users import UserService

ADMIN_USERNAME = "admin"
ADMIN_NAME = ADMIN_USERNAME


async def _run() -> None:
    settings = Settings()
    engine = create_engine(settings)
    try:
        service = UserService(
            create_unit_of_work_factory(create_session_factory(engine)), Argon2PasswordHasher()
        )
        password = await asyncio.to_thread(getpass.getpass, "Пароль администратора: ")
        identifier = await service.create_initial_admin(ADMIN_USERNAME, ADMIN_NAME, password)
        print(f"Администратор {ADMIN_USERNAME} создан (id={identifier}).")
        print("Логин и имя: admin. Пароль постоянный, смена при первом входе не требуется.")
    finally:
        await engine.dispose()


def main() -> None:
    asyncio.run(_run())


if __name__ == "__main__":
    main()
