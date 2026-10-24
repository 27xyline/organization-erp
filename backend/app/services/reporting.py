from __future__ import annotations

from datetime import datetime
from typing import Any, cast

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.domain.auth.rules import AccessContext, require_permission
from app.domain.errors import DomainError
from app.repositories.reporting import SqlAlchemyReportingRepository
from app.schemas.reporting import ReportPresetInput

_GROUP_METRICS = {
    "department": {"headcount", "occupiedRate", "plannedFot", "assetValue"},
    "project": {"projectBudget", "actualFot", "assetValue"},
}


class ReportingService:
    def __init__(self, session_factory: async_sessionmaker[Any]) -> None:
        self._session_factory = session_factory

    async def _call(self, name: str, *args: Any) -> Any:
        async with self._session_factory() as session:
            repository = SqlAlchemyReportingRepository(session)
            return await getattr(repository, name)(*args)

    async def turnover(
        self,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        access: AccessContext,
    ) -> dict[str, Any]:
        require_permission(access, "reports.read")
        require_permission(access, "employees.read")
        require_permission(access, "personnelActions.read")
        return cast(
            dict[str, Any],
            await self._call("turnover", date_from, date_to, department_id, access),
        )

    async def profitability(
        self,
        date_from: datetime,
        date_to: datetime,
        project_id: str | None,
        access: AccessContext,
    ) -> list[dict[str, Any]]:
        for permission in (
            "reports.read",
            "projects.read",
            "projectPayroll.read",
            "finance.salary.read",
        ):
            require_permission(access, permission)
        return cast(
            list[dict[str, Any]],
            await self._call("profitability", date_from, date_to, project_id, access),
        )

    async def depreciation(
        self,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        access: AccessContext,
    ) -> dict[str, Any]:
        require_permission(access, "reports.read")
        require_permission(access, "assets.read")
        return cast(
            dict[str, Any],
            await self._call("depreciation", date_from, date_to, department_id, access),
        )

    async def vacation_calendar(
        self,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        access: AccessContext,
    ) -> list[dict[str, Any]]:
        require_permission(access, "reports.read")
        require_permission(access, "vacations.read")
        return cast(
            list[dict[str, Any]],
            await self._call("vacation_calendar", date_from, date_to, department_id, access),
        )

    async def presets(self, user_id: str, access: AccessContext) -> list[dict[str, Any]]:
        require_permission(access, "reports.read")
        return cast(list[dict[str, Any]], await self._call("list_presets", user_id))

    async def save_preset(
        self, user_id: str, body: ReportPresetInput, access: AccessContext
    ) -> dict[str, Any]:
        require_permission(access, "reports.read")
        async with self._session_factory.begin() as session:
            repository = SqlAlchemyReportingRepository(session)
            return await repository.save_preset(user_id, body.model_dump())

    async def delete_preset(self, user_id: str, preset_id: str, access: AccessContext) -> None:
        require_permission(access, "reports.read")
        async with self._session_factory.begin() as session:
            repository = SqlAlchemyReportingRepository(session)
            deleted = await repository.delete_preset(user_id, preset_id)
        if not deleted:
            raise DomainError("REPORT_PRESET_NOT_FOUND", "Сохранённый отчёт не найден", 404)

    async def custom_report(
        self,
        preset: ReportPresetInput,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        project_id: str | None,
        access: AccessContext,
    ) -> list[dict[str, Any]]:
        require_permission(access, "reports.read")
        if preset.groupBy not in _GROUP_METRICS:
            raise DomainError("INVALID_GROUP", "Выберите группировку отчёта", 400)
        if any(metric not in _GROUP_METRICS[preset.groupBy] for metric in preset.metrics):
            raise DomainError(
                "INVALID_METRIC", "Показатель недоступен для выбранной группировки", 400
            )
        required = {
            "department": "departments.read",
            "project": "projects.read",
            "headcount": "employees.read",
            "occupiedRate": "employees.read",
            "plannedFot": "finance.salary.read",
            "actualFot": "finance.salary.read",
            "assetValue": "assets.read",
            "projectBudget": "projects.read",
        }
        permissions = {required[preset.groupBy], *(required[metric] for metric in preset.metrics)}
        for permission in permissions:
            require_permission(access, permission)
        return cast(
            list[dict[str, Any]],
            await self._call(
                "custom_report",
                preset.groupBy,
                preset.metrics,
                date_from,
                date_to,
                department_id,
                project_id,
                access,
            ),
        )
