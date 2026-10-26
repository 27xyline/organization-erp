"Граница доставки электронной почты, используемая обработчиками очереди исходящих сообщений."

from __future__ import annotations

from typing import Any, Protocol


class EmailSender(Protocol):
    async def send(self, payload: dict[str, Any]) -> None: ...
