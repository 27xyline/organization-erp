from dataclasses import dataclass
from datetime import date, datetime


@dataclass(frozen=True, slots=True)
class DashboardQuery:
    date_from: date
    date_to: date
    department_id: str | None = None
    project_id: str | None = None

    def as_dict(self) -> dict[str, str | None]:
        return {
            "dateFrom": self.date_from.isoformat(),
            "dateTo": self.date_to.isoformat(),
            "departmentId": self.department_id,
            "projectId": self.project_id,
        }


@dataclass(frozen=True, slots=True)
class ReportPreset:
    id: str
    name: str
    metrics: tuple[str, ...]
    group_by: str | None
    filters: dict[str, object] | None
    created_by_id: str
    created_at: datetime
