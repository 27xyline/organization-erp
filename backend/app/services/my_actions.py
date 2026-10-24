from __future__ import annotations

from datetime import datetime
from typing import Any

from app.domain.auth.rules import AccessContext
from app.domain.ports.my_actions import MyActionsPort


class MyActionsService:
    def __init__(self, my_actions_port: MyActionsPort) -> None:
        self._my_actions_port = my_actions_port

    async def get_for_user(
        self,
        actor_id: str,
        employee_id: str | None,
        access: AccessContext,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        return await self._my_actions_port.my_actions(
            actor_id, employee_id, access, now or datetime.utcnow()
        )
