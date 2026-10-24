from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.api.dependencies import get_actor, get_authenticated_context, get_user_service
from app.core.context import Actor, RequestContext
from app.schemas.users import ChangePasswordInput
from app.services.users import UserService

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/me")
async def me(response: Response, actor: Annotated[Actor, Depends(get_actor)]) -> dict[str, object]:
    response.headers["cache-control"] = "private, no-store"
    return {
        "data": {
            "id": actor.actor_id,
            "name": actor.name,
            "username": actor.username,
            "role": actor.role,
            "roles": actor.roles,
            "permissions": actor.permissions,
            "employeeId": actor.employee_id,
            "mustChangePassword": actor.must_change_password,
            "sessionVersion": actor.session_version,
            "access": {
                "identity": {
                    "userId": actor.actor_id,
                    "employeeId": actor.employee_id,
                    "employeeDepartmentId": (
                        actor.access.employee_department_id if actor.access else None
                    ),
                    "memberProjectIds": actor.access.member_project_ids if actor.access else (),
                },
                "grants": [
                    {
                        "assignmentId": grant.assignment_id,
                        "role": grant.role,
                        "departmentScopeMode": grant.department_scope_mode,
                        "projectScopeMode": grant.project_scope_mode,
                        "departmentIds": grant.department_ids,
                        "projectIds": grant.project_ids,
                    }
                    for grant in (actor.access.grants if actor.access else ())
                ],
            },
        }
    }


@router.post("/password")
async def password(
    input: ChangePasswordInput,
    context: Annotated[RequestContext, Depends(get_authenticated_context)],
    service: Annotated[UserService, Depends(get_user_service)],
) -> dict[str, dict[str, bool]]:
    await service.change_password(input.currentPassword, input.newPassword, context)
    return {"data": {"success": True}}
