from fastapi import APIRouter

from app.api.routes.account import router as account_router
from app.api.routes.auth_internal import router as auth_router
from app.api.routes.health import router as health_router
from app.api.routes.users import router as users_router

api_router = APIRouter(prefix="/api")
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(account_router)
