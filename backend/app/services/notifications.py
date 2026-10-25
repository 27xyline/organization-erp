"Чтение уведомлений в приложении и изменение настроек."

from __future__ import annotations

from typing import Any

from app.core.context import RequestContext
from app.domain.enums import NotificationChannel, NotificationEventType
from app.domain.errors import DomainError
from app.domain.ports.audit import AuditRecord
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.dto.notifications import NotificationQuery
from app.services.users import json_value


class NotificationService:
    def __init__(self, factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._factory = factory

    @staticmethod
    def _authenticated(context: RequestContext) -> str:
        actor = context.actor
        if actor is None or not actor.is_authenticated or actor.access is None:
            raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
        if actor.must_change_password:
            raise DomainError(
                "PASSWORD_CHANGE_REQUIRED", "Необходимо изменить временный пароль", 403
            )
        return actor.actor_id

    async def list_notifications(
        self, query: NotificationQuery, context: RequestContext
    ) -> tuple[list[dict[str, object]], int]:
        user_id = self._authenticated(context)
        async with self._factory() as uow:
            return await uow.notifications.list_for_user(
                user_id, query.page, query.pageSize, query.unreadOnly
            )

    async def unread_count(self, context: RequestContext) -> int:
        user_id = self._authenticated(context)
        async with self._factory() as uow:
            return await uow.notifications.unread_count(user_id)

    async def set_read(self, identifier: str, read: bool, context: RequestContext) -> None:
        user_id = self._authenticated(context)
        async with self._factory() as uow:
            if not await uow.notifications.set_read(user_id, identifier, read):
                raise DomainError("NOT_FOUND", "Уведомление не найдено", 404)
            await uow.commit()

    async def delete(self, identifier: str, context: RequestContext) -> None:
        user_id = self._authenticated(context)
        async with self._factory() as uow:
            if not await uow.notifications.delete_for_user(user_id, identifier):
                raise DomainError("NOT_FOUND", "Уведомление не найдено", 404)
            await uow.commit()

    async def mark_all_read(self, context: RequestContext) -> int:
        user_id = self._authenticated(context)
        async with self._factory() as uow:
            count = await uow.notifications.mark_all_read(user_id)
            await uow.commit()
            return count

    async def get_preferences(self, context: RequestContext) -> list[dict[str, Any]]:
        user_id = self._authenticated(context)
        async with self._factory() as uow:
            stored = await uow.notifications.preferences(user_id)
        values = {(item["eventType"], item["channel"]): bool(item["enabled"]) for item in stored}
        return [
            {
                "eventType": event.value,
                "channel": channel.value,
                "enabled": values.get(
                    (event.value, channel.value), channel == NotificationChannel.IN_APP
                ),
            }
            for event in NotificationEventType
            for channel in NotificationChannel
        ]

    async def update_preferences(
        self, values: list[dict[str, Any]], context: RequestContext
    ) -> list[dict[str, Any]]:
        user_id = self._authenticated(context)
        async with self._factory() as uow:
            for item in values:
                await uow.notifications.set_preference(
                    user_id, item["eventType"], item["channel"], item["enabled"]
                )
            if values:
                await uow.audit.append(
                    AuditRecord(
                        "NOTIFICATION_PREFERENCES_UPDATE",
                        "NotificationPreference",
                        user_id,
                        user_id,
                        {"preferences": json_value(values)},
                        context.request_id,
                    )
                )
            await uow.commit()
        return await self.get_preferences(context)
