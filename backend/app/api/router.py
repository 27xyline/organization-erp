from fastapi import APIRouter

from app.api.routes.account import router as account_router
from app.api.routes.approvals import router as approvals_router
from app.api.routes.asset_import import router as asset_import_router
from app.api.routes.assets import router as assets_router
from app.api.routes.auth_internal import router as auth_router
from app.api.routes.catalogs import router as catalogs_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.departments import router as departments_router
from app.api.routes.documents import router as documents_router
from app.api.routes.employees import router as employees_router
from app.api.routes.exports import router as exports_router
from app.api.routes.finance import finance_router, project_payroll_router
from app.api.routes.health import router as health_router
from app.api.routes.inventory import router as inventory_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.operations import router as operations_router
from app.api.routes.payroll import router as payroll_router
from app.api.routes.personnel_actions import router as personnel_actions_router
from app.api.routes.procurement import router as procurement_router
from app.api.routes.projects import router as projects_router
from app.api.routes.reports import router as reports_router
from app.api.routes.search import router as search_router
from app.api.routes.smtp_settings import router as smtp_settings_router
from app.api.routes.staff_schedule import router as staff_schedule_router
from app.api.routes.tasks import router as tasks_router
from app.api.routes.timekeeping import router as timekeeping_router
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


api_router.include_router(asset_import_router)
api_router.include_router(inventory_router)
api_router.include_router(assets_router)
api_router.include_router(operations_router)

api_router.include_router(documents_router)
api_router.include_router(approvals_router)
api_router.include_router(notifications_router)
api_router.include_router(smtp_settings_router)
api_router.include_router(payroll_router)
api_router.include_router(timekeeping_router)
api_router.include_router(finance_router)
api_router.include_router(project_payroll_router)
api_router.include_router(procurement_router)
api_router.include_router(search_router)
api_router.include_router(dashboard_router)
api_router.include_router(reports_router)
api_router.include_router(exports_router)
