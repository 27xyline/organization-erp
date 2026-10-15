from fastapi import APIRouter

from app.api.routes.account import router as account_router
from app.api.routes.auth_internal import router as auth_router
from app.api.routes.catalogs import router as catalogs_router
from app.api.routes.departments import router as departments_router
from app.api.routes.employees import router as employees_router
from app.api.routes.health import router as health_router
from app.api.routes.personnel_actions import router as personnel_actions_router
from app.api.routes.projects import router as projects_router
from app.api.routes.staff_schedule import router as staff_schedule_router
from app.api.routes.tasks import router as tasks_router
from app.api.routes.users import router as users_router
from app.api.routes.vacations import router as vacations_router

api_router = APIRouter(prefix="/api")
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(account_router)
api_router.include_router(departments_router)
api_router.include_router(catalogs_router)


api_router.include_router(employees_router)
api_router.include_router(personnel_actions_router)
api_router.include_router(vacations_router)
api_router.include_router(staff_schedule_router)


api_router.include_router(projects_router)
api_router.include_router(tasks_router)
