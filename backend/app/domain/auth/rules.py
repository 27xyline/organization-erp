"Чистые правила авторизации: целевой объект должен входить в один полный набор разрешений."

from dataclasses import dataclass
from typing import Any

from app.domain.auth.permissions import PERMISSION_SCOPE, ROLE_PERMISSIONS
from app.domain.errors import DomainError


@dataclass(frozen=True, slots=True)
class ScopeGrant:
    assignment_id: str
    role: str
    department_scope_mode: str
    project_scope_mode: str
    department_ids: tuple[str, ...] = ()
    project_ids: tuple[str, ...] = ()


def expand_descendants(
    roots: tuple[str, ...], departments: tuple[tuple[str, str | None], ...]
) -> tuple[str, ...]:
    result = set(roots)
    queue = list(roots)
    children: dict[str, list[str]] = {}
    for identifier, parent in departments:
        if parent:
            children.setdefault(parent, []).append(identifier)
    for current in queue:
        for child in children.get(current, []):
            if child not in result:
                result.add(child)
                queue.append(child)
    return tuple(sorted(result))


@dataclass(frozen=True, slots=True)
class AccessContext:
    user_id: str
    employee_id: str | None
    employee_department_id: str | None
    member_project_ids: tuple[str, ...]
    grants: tuple[ScopeGrant, ...]

    @property
    def roles(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys(grant.role for grant in self.grants))

    @property
    def permissions(self) -> tuple[str, ...]:
        return tuple(p for p in PERMISSION_SCOPE if self.has(p))

    def has(self, permission: str) -> bool:
        return any(permission in ROLE_PERMISSIONS.get(g.role, ()) for g in self.grants)

    def grants_for(self, permission: str) -> tuple[ScopeGrant, ...]:
        return tuple(g for g in self.grants if permission in ROLE_PERMISSIONS.get(g.role, ()))

    def _ids(self, grant: ScopeGrant, kind: str) -> tuple[str, ...] | None:
        mode = grant.department_scope_mode if kind == "department" else grant.project_scope_mode
        if mode == "ALL":
            return None
        if mode == "SELF":
            return (
                ((self.employee_department_id,) if self.employee_department_id else ())
                if kind == "department"
                else self.member_project_ids
            )
        if mode == "ASSIGNED":
            return grant.department_ids if kind == "department" else grant.project_ids
        return ()

    def _allowed(
        self, grant: ScopeGrant, kind: str, ids: tuple[str, ...], *, any_id: bool = False
    ) -> bool:
        if not ids:
            return False
        allowed = self._ids(grant, kind)
        if allowed is None:
            return True
        return any(i in allowed for i in ids) if any_id else all(i in allowed for i in ids)

    def allowed_department_ids(self, permission: str) -> tuple[str, ...] | None:
        return self._allowed_ids(permission, "department")

    def allowed_project_ids(self, permission: str) -> tuple[str, ...] | None:
        return self._allowed_ids(permission, "project")

    def _allowed_ids(self, permission: str, kind: str) -> tuple[str, ...] | None:
        result: set[str] = set()
        for grant in self.grants_for(permission):
            values = self._ids(grant, kind)
            if values is None:
                return None
            result.update(values)
        return tuple(sorted(result))

    def allows(self, permission: str, target: dict[str, Any] | None = None) -> bool:
        target = target or {}
        kind = PERMISSION_SCOPE.get(permission)
        departments = tuple(
            dict.fromkeys(
                filter(None, (target.get("departmentId"), *target.get("departmentIds", ())))
            )
        )
        projects = tuple(
            dict.fromkeys(filter(None, (target.get("projectId"), *target.get("projectIds", ()))))
        )
        for grant in self.grants_for(permission):
            department = self._allowed(grant, "department", departments)
            project = self._allowed(grant, "project", projects)
            if kind == "none":
                return True
            if kind == "employee":
                if (
                    (bool(target.get("employeeId")) and target["employeeId"] == self.employee_id)
                    if grant.department_scope_mode == "SELF"
                    else department
                ):
                    return True
            elif kind == "department" and department:
                return True
            elif kind == "project" and project:
                return True
            elif kind == "finance":
                own_employee = (
                    grant.department_scope_mode == "SELF"
                    and bool(target.get("employeeId"))
                    and target.get("employeeId") == self.employee_id
                )
                if (own_employee or department) and project:
                    return True
            elif kind == "asset":
                if self._allowed(grant, "department", departments, any_id=True) or self._allowed(
                    grant, "project", projects, any_id=True
                ):
                    return True
            elif kind == "document":
                employee_link = target.get("documentEmployeeId")
                project_link = target.get("documentProjectId")
                asset_project = target.get("documentAssetProjectId")
                asset_departments = tuple(target.get("documentAssetDepartmentIds", ()))
                if not (employee_link or project_link or asset_project or asset_departments):
                    if (
                        grant.role in ("ADMIN", "AUDITOR")
                        and grant.department_scope_mode == grant.project_scope_mode == "ALL"
                    ):
                        return True
                    continue
                employee_pass = not employee_link or (
                    employee_link == self.employee_id
                    if grant.department_scope_mode == "SELF"
                    else self._allowed(
                        grant,
                        "department",
                        tuple(filter(None, (target.get("documentEmployeeDepartmentId"),))),
                    )
                )
                project_pass = not project_link or self._allowed(grant, "project", (project_link,))
                asset_pass = (
                    not (asset_project or asset_departments)
                    or self._allowed(grant, "department", asset_departments, any_id=True)
                    or self._allowed(
                        grant, "project", (asset_project,) if asset_project else (), any_id=True
                    )
                )
                if employee_pass and project_pass and asset_pass:
                    return True
        return False


def require_permission(
    access: AccessContext, permission: str, target: dict[str, Any] | None = None
) -> None:
    if not (access.has(permission) if target is None else access.allows(permission, target)):
        raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
