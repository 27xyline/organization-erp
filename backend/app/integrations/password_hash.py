"""Адаптер Argon2id, совместимый с PHC. Работа CPU не блокирует цикл событий."""

import asyncio

from argon2 import PasswordHasher, extract_parameters
from argon2.exceptions import InvalidHashError, VerificationError
from argon2.low_level import Type


class Argon2PasswordHasher:
    # Использовать стандартные параметры @node-rs/argon2: 19 МиБ, две итерации, один поток.
    def __init__(self) -> None:
        self._hasher = PasswordHasher(
            time_cost=2, memory_cost=19456, parallelism=1, hash_len=32, salt_len=16, type=Type.ID
        )

    async def verify(self, encoded: str, password: str) -> bool:
        def check() -> bool:
            try:
                return self._hasher.verify(encoded, password)
            except (VerificationError, InvalidHashError):
                return False

        return await asyncio.to_thread(check)

    async def hash(self, password: str) -> str:
        return await asyncio.to_thread(self._hasher.hash, password)

    def needs_rehash(self, encoded: str) -> bool:
        try:
            parameters = extract_parameters(encoded)
            return (
                parameters.type != Type.ID
                or parameters.version != 19
                or parameters.memory_cost < 19456
                or parameters.time_cost < 2
                or parameters.parallelism < 1
                or parameters.hash_len < 32
                or parameters.salt_len < 16
            )
        except InvalidHashError:
            return True
