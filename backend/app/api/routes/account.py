from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies import get_authenticated_context, get_user_service
from app.core.context import RequestContext
from app.schemas.users import ChangePasswordInput
from app.services.users import UserService

router = APIRouter(prefix="/account", tags=["account"])


@router.post("/password")
async def password(
    input: ChangePasswordInput,
    context: Annotated[RequestContext, Depends(get_authenticated_context)],
    service: Annotated[UserService, Depends(get_user_service)],
) -> dict[str, dict[str, bool]]:
    await service.change_password(input.currentPassword, input.newPassword, context)
    return {"data": {"success": True}}
