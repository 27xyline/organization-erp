from __future__ import annotations

import ast
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from typing import cast

import pytest
from sqlalchemy.dialects import postgresql

from app.core.config import Settings
from app.domain.documents.records import StoredObject
from app.domain.ports.cli import DocumentFileReference, VerifyDataSnapshot
from app.domain.ports.documents import StoragePort
from app.integrations.cli_storage import LocalDocumentFileVerificationAdapter
from app.models.departments import Department
from app.repositories.cli import (
    SqlAlchemyVerifyDataRepository,
    demo_training_links,
    idempotent_insert_statement,
)
from app.scripts.cli_support import require_safe_seed_target
from app.services.cli import DemoSeedService, VerifyDataService


class _SeedPort:
    async def seed_training_dataset(self) -> dict[str, int]:
        return {"departmentsCreated": 1, "employeesCreated": 1, "tasksCreated": 1}


class _VerifyPort:
    async def verify_data(self) -> VerifyDataSnapshot:
        return VerifyDataSnapshot(
            {"holdingMismatch": 0, "orphanHoldings": 0},
            (DocumentFileReference("aa/bb/00000000-0000-0000-0000-000000000001", 10, "a" * 64),),
        )


class _DocumentFilesPort:
    async def verify(self, reference: DocumentFileReference) -> bool:
        assert reference.storage_key.startswith("aa/bb/")
        return False


class _StoragePort:
    def __init__(self, *, missing: bool = False) -> None:
        self.missing = missing
        self.stored: StoredObject | None = None
        self.contents = BytesIO(b"verified document")

    async def get(self, stored: StoredObject) -> BytesIO:
        self.stored = stored
        if self.missing:
            raise FileNotFoundError
        return self.contents


@pytest.mark.anyio
async def test_cli_services_delegate_to_ports_without_session_arguments() -> None:
    seed = await DemoSeedService(_SeedPort()).seed()
    verified = await VerifyDataService(_VerifyPort(), _DocumentFilesPort()).verify()

    assert seed == {"departmentsCreated": 1, "employeesCreated": 1, "tasksCreated": 1}
    assert verified == {
        "holdingMismatch": 0,
        "orphanHoldings": 0,
        "missingOrCorruptDocumentFiles": 1,
    }


@pytest.mark.anyio
async def test_verify_repository_preserves_legacy_counter_set_and_file_metadata() -> None:
    class _Rows:
        def all(self) -> list[SimpleNamespace]:
            return [
                SimpleNamespace(
                    storageKey="aa/bb/00000000-0000-0000-0000-000000000001",
                    sizeBytes=10,
                    sha256="a" * 64,
                )
            ]

    class _Session:
        def __init__(self) -> None:
            self.statements: list[str] = []

        async def scalar(self, statement: object) -> int:
            self.statements.append(str(statement))
            return 0

        async def execute(self, statement: object) -> _Rows:
            self.statements.append(str(statement))
            return _Rows()

    session = _Session()
    snapshot = await SqlAlchemyVerifyDataRepository(session).verify_data()  # type: ignore[arg-type]

    assert set(snapshot.counters) == {
        "holdingMismatch",
        "negativeAssets",
        "negativeHoldings",
        "orphanHoldings",
        "secretAuditRows",
        "departmentCycles",
        "duplicateDepartmentCodes",
        "duplicateDepartmentNames",
        "departmentSnapshotMismatch",
        "documentCurrentVersionMismatch",
        "unsafeDocumentMetadata",
    }
    assert len(session.statements) == 12  # одиннадцать счётчиков и запрос метаданных версии
    query_text = "\n".join(session.statements)
    for legacy_sql_marker in (
        'LEFT JOIN "mols"',
        "temporaryPassword|NEXTAUTH_SECRET",
        "WITH RECURSIVE hierarchy",
        'LOWER("code")',
        'LOWER("name")',
        "UNION ALL",
        '"currentVersion"',
        '"storageKey" !~',
        '"sizeBytes" <= 0',
    ):
        assert legacy_sql_marker in query_text
    assert snapshot.document_files == (
        DocumentFileReference("aa/bb/00000000-0000-0000-0000-000000000001", 10, "a" * 64),
    )


@pytest.mark.anyio
async def test_document_file_verifier_uses_integrity_metadata_and_closes_stream() -> None:
    storage = _StoragePort()
    reference = DocumentFileReference("aa/bb/file-id", 17, "b" * 64)

    result = await LocalDocumentFileVerificationAdapter(cast(StoragePort, storage)).verify(
        reference
    )

    assert result is True
    assert storage.stored == StoredObject(
        reference.storage_key, reference.size_bytes, reference.sha256
    )
    assert storage.contents.closed


@pytest.mark.anyio
async def test_document_file_verifier_counts_unavailable_files_as_invalid() -> None:
    storage = _StoragePort(missing=True)
    reference = DocumentFileReference("aa/bb/file-id", 17, "b" * 64)

    assert (
        await LocalDocumentFileVerificationAdapter(cast(StoragePort, storage)).verify(reference)
        is False
    )


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
            database_url="postgresql+asyncpg://localhost:5432/erp_procurement_test",
        ),
        Settings(database_url="postgresql+asyncpg://localhost:5432/organization_erp"),
        Settings(database_url="postgresql+asyncpg://db.example:5432/erp_procurement_test"),
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
