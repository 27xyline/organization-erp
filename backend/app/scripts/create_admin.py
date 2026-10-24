from __future__ import annotations

import asyncio
import getpass

from app.core.config import Settings
from app.db.session import create_engine, create_session_factory
from app.db.uow import create_unit_of_work_factory
from app.integrations.password_hash import Argon2PasswordHasher
from app.services.users import UserService


async def _run() -> None:
    settings = Settings()
    engine = create_engine(settings)
    try:
        service = UserService(
            create_unit_of_work_factory(create_session_factory(engine)), Argon2PasswordHasher()
        )
        username = (await asyncio.to_thread(input, "Логин администратора: ")).strip()
        name = (await asyncio.to_thread(input, "Имя администратора: ")).strip()
        password = await asyncio.to_thread(
            getpass.getpass, "Временный пароль (минимум 12 символов): "
        )
        identifier = await service.create_initial_admin(username, name, password)
        print(f"Администратор {username} создан (id={identifier}).")
        print("Смените временный пароль после входа.")
    finally:
        await engine.dispose()


def main() -> None:
    asyncio.run(_run())


if __name__ == "__main__":
    main()
