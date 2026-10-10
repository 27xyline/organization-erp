import secrets
from dataclasses import asdict
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from app.api.dependencies import get_actor, get_auth_service
from app.core.context import Actor
from app.domain.errors import DomainError
from app.schemas.auth import CredentialsInput
from app.services.auth import AuthService

router = APIRouter(prefix="/internal/auth", tags=["internal auth"])


async def require_internal_service(request: Request) -> None:
    configured = request.app.state.settings.internal_auth_secret
    secret = configured.get_secret_value() if configured else ""
    if len(secret.encode()) < 32:
        raise DomainError("AUTH_UNAVAILABLE", "Сервис авторизации недоступен", 503)
    if not secrets.compare_digest(
        request.headers.get("authorization", "").encode(), ("Bearer " + secret).encode()
    ):
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)


@router.post("/credentials", dependencies=[Depends(require_internal_service)])
async def credentials(
    input: CredentialsInput, service: Annotated[AuthService, Depends(get_auth_service)]
) -> dict[str, Any]:
    result = await service.authenticate_credentials(input.username, input.password)
    return {"data": asdict(result) if result else None}


@router.get("/actor")
async def actor_context(actor: Annotated[Actor, Depends(get_actor)]) -> dict[str, Any]:
    access = actor.access
    assert access is not None
    return {
        "data": {
            "id": actor.actor_id,
            "username": actor.username,
            "name": actor.name,
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
                    "employeeDepartmentId": access.employee_department_id,
                    "memberProjectIds": access.member_project_ids,
                },
                "grants": [
                    {
                        "assignmentId": g.assignment_id,
                        "role": g.role,
                        "departmentScopeMode": g.department_scope_mode,
                        "projectScopeMode": g.project_scope_mode,
                        "departmentIds": g.department_ids,
                        "projectIds": g.project_ids,
                    }
                    for g in access.grants
                ],
            },
        }
    }
