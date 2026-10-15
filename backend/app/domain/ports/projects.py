"""Project persistence ports and detached domain records."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, NotRequired, Protocol, TypedDict

from app.domain.auth.rules import AccessContext


class NamedReference(TypedDict):
    id: str
    name: str


class EmployeeDisplay(TypedDict):
    id: str
    fullName: str


class AssigneeProjection(TypedDict):
    employeeId: str
    projectMemberId: str | None
    fullName: NotRequired[str]
    id: NotRequired[str]
    taskId: NotRequired[str]
    createdAt: NotRequired[datetime]
    employee: NotRequired[EmployeeDisplay]
    projectMember: NotRequired[dict[str, str] | None]


class DependencyProjection(TypedDict):
    id: str
    predecessorId: str
    successorId: str
    lagDays: int
    createdAt: datetime
    predecessor: NamedReference


class ChecklistProjection(TypedDict):
    id: str
    taskId: str
    title: str
    completed: bool
    order: int
    createdAt: datetime
    updatedAt: datetime


class CommentProjection(TypedDict):
    id: str
    taskId: str
    authorId: str
    body: str
    createdAt: datetime
    updatedAt: datetime
    author: NamedReference


class MemberStaffProjection(TypedDict):
    id: str
    department: str
    position: str
    salary: str


class MemberEmployeeProjection(TypedDict):
    id: str
    code: str
    fullName: str
    department: str
    employmentRate: str
    status: str
    staffSchedule: MemberStaffProjection | None


@dataclass(frozen=True, slots=True)
class UserDisplay:
    id: str
    name: str | None
    username: str | None = None


@dataclass(frozen=True, slots=True)
class CommentRecord:
    id: str
    taskId: str
    authorId: str
    body: str
    createdAt: datetime
    updatedAt: datetime
    author: UserDisplay

    @property
    def values(self) -> dict[str, Any]:
        result = asdict(self)
        result["author"].pop("username", None)
        return result


@dataclass(frozen=True, slots=True)
class ActivityRecord:
    id: str
    action: str
    entityType: str
    entityId: str
    createdAt: datetime
    user: UserDisplay | None

    @property
    def values(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class ProjectRecord:
    id: str
    code: str
    name: str
    description: str | None = None
    goals: str | None = None
    tasks: str | None = None
    results: str | None = None
    startDate: datetime | None = None
    endDate: datetime | None = None
    status: str = "ACTIVE"
    plannedBudget: str = "0"
    actualBudget: str = "0"
    plannedRevenue: str = "0"
    actualRevenue: str = "0"
    createdAt: datetime | None = None
    updatedAt: datetime | None = None
    counts: dict[str, int] | None = None
    tasksList: tuple[TaskRecord, ...] | None = None
    assets: tuple[dict[str, object], ...] | None = None
    financePlanEntries: tuple[dict[str, object], ...] | None = None
    reference: bool = False

    @classmethod
    def from_values(cls, values: dict[str, Any]) -> ProjectRecord:
        data = dict(values)
        data["counts"] = data.pop("_count", None)
        if "tasksList" in data:
            data["tasksList"] = tuple(TaskRecord.from_values(item) for item in data["tasksList"])
        for key in ("assets", "financePlanEntries"):
            if key in data:
                data[key] = tuple(data[key])
        data["reference"] = "status" not in data
        return cls(**data)

    @property
    def values(self) -> dict[str, Any]:
        if self.reference:
            return {key: getattr(self, key) for key in ("id", "code", "name")}
        result = asdict(self)
        for key in ("counts", "tasksList", "assets", "financePlanEntries", "reference"):
            result.pop(key)
        if self.counts is not None:
            result["_count"] = dict(self.counts)
        if self.tasksList is not None:
            result["tasksList"] = [item.values for item in self.tasksList]
        if self.assets is not None:
            result["assets"] = list(self.assets)
        if self.financePlanEntries is not None:
            result["financePlanEntries"] = list(self.financePlanEntries)
        return result


@dataclass(frozen=True, slots=True)
class TaskRecord:
    id: str
    projectId: str
    name: str
    level: int
    description: str | None = None
    priority: str = "MEDIUM"
    risk: str = "LOW"
    isMilestone: bool = False
    parentId: str | None = None
    startDate: datetime | None = None
    endDate: datetime | None = None
    duration: int | None = None
    progress: int = 0
    responsible: str | None = None
    status: str = "NOT_STARTED"
    createdAt: datetime | None = None
    updatedAt: datetime | None = None
    assignees: tuple[AssigneeProjection, ...] | None = None
    predecessors: tuple[DependencyProjection, ...] | None = None
    checklist: tuple[ChecklistProjection, ...] | None = None
    comments: tuple[CommentProjection, ...] | None = None
    children: tuple[TaskRecord, ...] | None = None

    @property
    def project_id(self) -> str:
        return self.projectId

    @classmethod
    def from_values(cls, values: dict[str, Any]) -> TaskRecord:
        data = dict(values)
        for key in ("assignees", "predecessors", "checklist", "comments"):
            if key in data:
                data[key] = tuple(data[key])
        if "children" in data:
            data["children"] = tuple(cls.from_values(item) for item in data["children"])
        return cls(**data)

    @property
    def values(self) -> dict[str, Any]:
        result = asdict(self)
        for key in ("assignees", "predecessors", "checklist", "comments", "children"):
            value = getattr(self, key)
            if value is None:
                result.pop(key)
            elif key == "children":
                result[key] = [item.values for item in value]
            else:
                result[key] = list(value)
        return result


@dataclass(frozen=True, slots=True)
class MemberRecord:
    id: str
    projectId: str
    employeeId: str
    department: str
    position: str
    rate: str
    salary: str
    isArchived: bool
    archivedAt: datetime | None
    createdAt: datetime
    updatedAt: datetime
    employee: MemberEmployeeProjection

    @property
    def employee_id(self) -> str:
        return self.employeeId

    @property
    def full_name(self) -> str:
        return str(self.employee["fullName"])

    @property
    def values(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class ProjectPage:
    projects: tuple[ProjectRecord, ...]
    total: int


class ProjectRepository(Protocol):
    async def lock(self, project_id: str) -> bool: ...
    async def list(
        self,
        page: int,
        page_size: int,
        status: str | None,
        allowed_ids: tuple[str, ...] | None,
        references: bool = False,
    ) -> ProjectPage: ...
    async def get(self, project_id: str) -> ProjectRecord | None: ...
    async def create(self, values: dict[str, Any]) -> ProjectRecord: ...
    async def update(self, project_id: str, values: dict[str, Any]) -> ProjectRecord: ...
    async def delete(self, project_id: str) -> None: ...
    async def assign_scopes(self, project_id: str, assignment_ids: tuple[str, ...]) -> None: ...
    async def project_view(
        self, project_id: str, access: AccessContext, detail: bool = False
    ) -> ProjectRecord | None: ...
    async def task(self, task_id: str) -> TaskRecord | None: ...
    async def tasks(self, project_id: str, shape: str = "list") -> tuple[TaskRecord, ...]: ...
    async def dependencies(self, project_id: str) -> tuple[tuple[str, str], ...]: ...
    async def active_members(
        self, project_id: str, employee_ids: tuple[str, ...]
    ) -> tuple[MemberRecord, ...]: ...
    async def create_task(
        self, project_id: str, values: dict[str, Any], members: tuple[MemberRecord, ...]
    ) -> TaskRecord: ...
    async def update_task(
        self, task_id: str, values: dict[str, Any], members: tuple[MemberRecord, ...] | None
    ) -> TaskRecord: ...
    async def delete_task(self, task_id: str) -> None: ...
    async def comment(self, task_id: str, author_id: str, body: str) -> CommentRecord: ...
    async def members(self, project_id: str, include_salary: bool) -> tuple[MemberRecord, ...]: ...
    async def add_member(
        self, project_id: str, employee_id: str, values: dict[str, Any]
    ) -> MemberRecord: ...
    async def update_member(
        self, project_id: str, member_id: str, archived: bool
    ) -> MemberRecord | None: ...
    async def activity(
        self, project_id: str, tasks: bool, documents: bool
    ) -> tuple[ActivityRecord, ...]: ...
