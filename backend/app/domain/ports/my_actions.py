"""Persistence port for the actor's dashboard action list."""

from datetime import datetime
from typing import Any, Protocol

from app.domain.auth.rules import AccessContext


class MyActionsPort(Protocol):
    async def my_actions(
        self,
        actor_id: str,
        employee_id: str | None,
        access: AccessContext,
        now: datetime,
    ) -> dict[str, Any]: ...
