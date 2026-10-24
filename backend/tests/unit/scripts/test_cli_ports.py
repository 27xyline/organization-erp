from __future__ import annotations

import ast
from pathlib import Path

import pytest
from sqlalchemy.dialects import postgresql

from app.core.config import Settings
from app.models.departments import Department
from app.repositories.cli import demo_training_links, idempotent_insert_statement
from app.scripts.cli_support import require_safe_seed_target
from app.services.cli import DemoSeedService, VerifyDataService


class _SeedPort:
    async def seed_training_dataset(self) -> dict[str, int]:
        return {"departmentsCreated": 1, "employeesCreated": 1, "tasksCreated": 1}


class _VerifyPort:
    async def verify_data(self) -> dict[str, int]:
        return {"holdingMismatch": 0, "orphanHoldings": 0}


@pytest.mark.anyio
async def test_cli_services_delegate_to_ports_without_session_arguments() -> None:
    seed = await DemoSeedService(_SeedPort()).seed()
    verified = await VerifyDataService(_VerifyPort()).verify()

    assert seed == {"departmentsCreated": 1, "employeesCreated": 1, "tasksCreated": 1}
    assert verified == {"holdingMismatch": 0, "orphanHoldings": 0}


def test_cli_services_have_no_sqlalchemy_or_model_imports() -> None:
    source = Path(__file__).parents[3] / "app/services/cli.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))
    imported = {node.module or "" for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)}

    assert not any(
        name.startswith(("sqlalchemy", "app.models", "app.repositories", "app.db"))
        for name in imported
    )


def test_seed_adapter_uses_postgres_conflict_safe_insert() -> None:
    statement = idempotent_insert_statement(Department, {"id": "demo-id", "name": "Учебная строка"})
    sql = str(
        statement.compile(
            dialect=postgresql.dialect(),  # type: ignore[no-untyped-call]
            compile_kwargs={"literal_binds": True},
        )
    )

    assert "ON CONFLICT DO NOTHING" in sql
    assert "Учебная строка" in sql


def test_demo_seed_has_department_employee_project_task_assignment_chain() -> None:
    links = demo_training_links("dept-1", "schedule-1", "employee-1", "project-1", "member-1")

    assert links["staffSchedule"]["departmentId"] == "dept-1"
    assert links["employee"] == {"departmentId": "dept-1", "staffScheduleId": "schedule-1"}
    assert links["projectMember"] == {"projectId": "project-1", "employeeId": "employee-1"}
    assert links["task"] == {"projectId": "project-1"}
    assert links["taskAssignee"] == {
        "taskId": "demo_seed_task_0001",
        "employeeId": "employee-1",
        "projectMemberId": "member-1",
    }


@pytest.mark.parametrize(
    "settings",
    [
        Settings(
            environment="production",
            database_url="postgresql+asyncpg://localhost:5432/erp_stage11_test",
        ),
        Settings(database_url="postgresql+asyncpg://localhost:5432/organization_erp"),
        Settings(database_url="postgresql+asyncpg://db.example:5432/erp_stage11_test"),
    ],
)
def test_seed_target_guard_rejects_production_working_and_remote_targets(
    settings: Settings,
) -> None:
    with pytest.raises(RuntimeError):
        require_safe_seed_target(settings)


def test_seed_target_guard_accepts_an_isolated_local_training_database() -> None:
    settings = Settings(database_url="postgresql+asyncpg://localhost:5432/erp_training_local")

    assert require_safe_seed_target(settings) == "erp_training_local"
