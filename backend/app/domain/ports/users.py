"Чистый контракт хранения пользователей. ORM-объекты не покидают репозиторий."

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from app.domain.auth.rules import ScopeGrant


@dataclass(frozen=True, slots=True)
class UserRecord:
    id: str
    username: str
    name: str
    role: str
    password_hash: str
    is_active: bool
    must_change_password: bool
    session_version: int
    failed_login_attempts: int
    locked_until: datetime | None
    employee_id: str | None
    employee_department_id: str | None
    member_project_ids: tuple[str, ...]
    grants: tuple[ScopeGrant, ...]
    public: dict[str, Any]


class UserRepository(Protocol):
    async def get(self, user_id: str, *, for_update: bool = False) -> UserRecord | None: ...
    async def by_username_for_update(self, username: str) -> UserRecord | None: ...
    async def departments(self) -> tuple[tuple[str, str | None], ...]: ...
    async def update_auth(self, user_id: str, values: dict[str, Any]) -> None: ...
    async def list_users(self, page: int, page_size: int) -> tuple[list[dict[str, Any]], int]: ...
    async def references(self) -> dict[str, Any]: ...
    async def validate_references(
        self, assignments: list[dict[str, Any]], employee_id: str | None
    ) -> bool: ...
    async def create(
        self, values: dict[str, Any], assignments: list[dict[str, Any]]
    ) -> UserRecord: ...
    async def update(
        self, user_id: str, values: dict[str, Any], assignments: list[dict[str, Any]] | None
    ) -> UserRecord: ...
    async def lock_admin_changes(self) -> None: ...
    async def active_admin_count(self) -> int: ...
