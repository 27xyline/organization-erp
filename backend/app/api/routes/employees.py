"""Транспорт сотрудников и композиция SSR. Все решения делегируются сервисам."""

import math
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any, Literal, cast

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from app.api.dependencies import (
    get_authenticated_context,
    get_employee_service,
    get_workforce_service,
)
from app.core.context import RequestContext
from app.domain.employees.employment import ERRORS
from app.domain.errors import DomainError
from app.domain.ports.employees import ProfileComposition
from app.schemas.employees import EmployeeCreateInput, EmployeeUpdateInput, ProfileInput
from app.services.dto.employees import (
    CertificateCommand,
    EmployeeListQuery,
    EmployeeReferenceQuery,
    ProfileCommand,
    SkillCommand,
)
from app.services.employees import EmployeeService
from app.services.workforce import WorkforceService

router = APIRouter(prefix="/employees", tags=["employees"])
Context = Annotated[RequestContext, Depends(get_authenticated_context)]
Service = Annotated[EmployeeService, Depends(get_employee_service)]
Workforce = Annotated[WorkforceService, Depends(get_workforce_service)]


def wire(value: Any, *, numeric: bool = False) -> Any:
    if isinstance(value, Decimal):
        return float(value) if numeric else format(value.normalize(), "f")
    if isinstance(value, datetime):
        return value.isoformat(timespec="milliseconds") + "Z"
    if isinstance(value, dict):
        return {key: wire(item, numeric=numeric) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [wire(item, numeric=numeric) for item in value]
    return value


def paged(rows: list[Any], total: int, page: int, size: int, **extra: Any) -> dict[str, Any]:
    return {
        "data": wire([row.as_dict() for row in rows]),
        "pagination": {
            "page": page,
            "pageSize": size,
            "total": total,
            "totalPages": max(1, math.ceil(total / size)),
            **extra,
        },
    }


def profile_wire(profile: ProfileComposition) -> dict[str, Any]:
    employee = profile.employee
    keys = (
        "id",
        "code",
        "fullName",
        "department",
        "departmentId",
        "phone",
        "email",
        "birthDate",
        "education",
        "qualification",
        "status",
        "contractType",
        "contractSignedDate",
        "contractEndDate",
        "contractNumber",
        "employmentRate",
    )
    values = {key: getattr(employee, key) for key in keys}
    position = employee.staffSchedule
    values.update(
        staffSchedule={key: getattr(position, key) for key in ("id", "position", "salary")}
        if position
        else None,
        manager=profile.manager,
        directReports=profile.direct_reports,
        skills=profile.skills,
        certificates=profile.certificates,
        personnelActions=profile.actions,
        salaryEntries=profile.salary_entries,
        projects=profile.projects,
        vacations=profile.vacations,
        mol=profile.mol,
        documents=profile.documents,
    )
    return cast(
        dict[str, Any], wire({"employee": values, "managers": profile.managers}, numeric=True)
    )


def employee_error(error: DomainError) -> None:
    if error.code in ERRORS:
        raise DomainError("EMPLOYEE_DOMAIN_ERROR", error.message, error.status_code) from error
    raise error


@router.get("")
async def list_employees(
    context: Context,
    service: Service,
    scope: Literal["active", "archive", "expired", "all"] = "all",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int | None, Query(alias="pageSize", ge=1, le=100)] = None,
    limit: Annotated[int | None, Query(ge=1, le=100)] = None,
) -> dict[str, Any]:
    assert context.actor is not None
    size = page_size or limit or 50
    rows, total = await service.list(EmployeeListQuery(scope, page, size), context.actor)
    return paged(rows, total, page, size, scope=scope)


@router.get("/references")
async def references(
    context: Context,
    service: Service,
    project_id: Annotated[str | None, Query(alias="projectId", min_length=1)] = None,
) -> dict[str, Any]:
    assert context.actor is not None
    if project_id:
        options = await service.project_references(
            EmployeeReferenceQuery(project_id), context.actor
        )
        return {"data": [row.as_dict() for row in options]}
    rows = await service.references(context.actor)
    return {"data": wire([row.summary() | {"code": row.code} for row in rows])}


@router.get("/dashboard")
async def dashboard(
    context: Context,
    service: Workforce,
    year: Annotated[int | None, Query(ge=1900, le=2100)] = None,
) -> dict[str, Any]:
    assert context.actor is not None
    result = await service.dashboard(year or datetime.now().year, context.actor)
    return {
        "data": wire(
            {
                "employees": [row.as_dict() for row in result.employees],
                "staffSchedule": [row.as_dict() for row in result.staff_schedule],
                "departments": result.departments,
                "vacations": [row.as_dict() for row in result.vacations],
                "personnelActions": [row.as_dict() for row in result.personnel_actions],
            },
            numeric=True,
        )
    }


@router.post("")
async def create_employee(
    input: EmployeeCreateInput, context: Context, service: Service
) -> JSONResponse:
    try:
        employee = await service.create(input.command(), context)
    except DomainError as error:
        employee_error(error)
        raise
    return JSONResponse({"data": wire(employee.as_dict(department_ref=False))}, status_code=201)


@router.put("/{identifier}")
async def update_employee(
    identifier: str, input: EmployeeUpdateInput, context: Context, service: Service
) -> dict[str, Any]:
    try:
        employee = await service.update(identifier, input.command(), context)
    except DomainError as error:
        employee_error(error)
        raise
    return {"data": wire(employee.as_dict(department_ref=False))}


@router.delete("/{identifier}")
async def dismiss_employee(identifier: str, context: Context, service: Service) -> dict[str, Any]:
    try:
        await service.dismiss(identifier, context)
    except DomainError as error:
        employee_error(error)
    return {"data": {"success": True, "archived": True, "status": "DISMISSED"}}


@router.get("/{identifier}/profile")
async def employee_profile(identifier: str, context: Context, service: Service) -> dict[str, Any]:
    assert context.actor is not None
    result = await service.profile(identifier, context.actor)
    return {"data": profile_wire(result) if result else None}


@router.put("/{identifier}/profile")
async def update_profile(
    identifier: str, input: ProfileInput, context: Context, service: Service
) -> dict[str, Any]:
    values = input.model_dump(exclude={"skills", "certificates"})
    command = ProfileCommand(
        skills=tuple(SkillCommand(**row.model_dump()) for row in input.skills),
        certificates=tuple(CertificateCommand(**row.model_dump()) for row in input.certificates),
        **values,
    )
    result = await service.update_profile(identifier, command, context)
    # Изменение профиля в legacy возвращает поля сотрудника без связи staffSchedule.
    data = result.as_dict()
    data.pop("staffSchedule")
    return {"data": wire(data)}
