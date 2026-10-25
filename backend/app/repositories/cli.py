"""Адаптеры SQLAlchemy для интерфейсов CLI явного заполнения демоданными и проверки."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime
from decimal import Decimal
from typing import Any, cast

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.documents.records import StagedObject, UploadStream
from app.domain.ports.cli import DocumentFileReference, VerifyDataSnapshot
from app.domain.ports.documents import StoragePort
from app.models.assets import Asset, AssetHolding
from app.models.catalogs import AssetGroup, Mol
from app.models.departments import Department
from app.models.documents import Document, DocumentVersion
from app.models.employees import Employee
from app.models.projects import Project, ProjectMember, Task, TaskAssignee
from app.models.timekeeping import StaffSchedule
from app.models.users import User

DEMO_DEPARTMENT_CODE = "DEMO"
DEMO_EMPLOYEE_ID = "demo_seed_employee_0001"
DEMO_PROJECT_ID = "demo_seed_project_0001"
DEMO_TASK_ID = "demo_seed_task_0001"
DEMO_PROJECT_MEMBER_ID = "demo_seed_project_member_0001"
DEMO_DOCUMENT_IDS = (
    "demo_seed_document_0001",
    "demo_seed_document_0002",
    "demo_seed_document_0003",
)


def idempotent_insert_statement(model: Any, values: dict[str, Any]) -> Any:
    return pg_insert(model).values(**values).on_conflict_do_nothing()


def demo_training_links(
    department_id: str, schedule_id: str, employee_id: str, project_id: str, project_member_id: str
) -> dict[str, dict[str, str]]:
    return {
        "staffSchedule": {"departmentId": department_id},
        "employee": {"departmentId": department_id, "staffScheduleId": schedule_id},
        "projectMember": {"projectId": project_id, "employeeId": employee_id},
        "task": {"projectId": project_id},
        "taskAssignee": {
            "taskId": DEMO_TASK_ID,
            "employeeId": employee_id,
            "projectMemberId": project_member_id,
        },
    }


class SqlAlchemyDemoSeedRepository:
    def __init__(self, session: AsyncSession, document_storage: StoragePort) -> None:
        self._session = session
        self._document_storage = document_storage
        self.staged_files: list[StagedObject] = []

    async def seed_training_dataset(self) -> dict[str, int]:
        # Блокировка упорядочивает параллельные явные вызовы CLI.
        await self._session.execute(text("SELECT pg_advisory_xact_lock(904202607)"))
        counts: dict[str, int] = {}

        # Документы требуют реального пользователя-автора. Выбираем его до любых
        # изменений БД и файлов; создание тестовых аккаунтов здесь не выполняется.
        actor_id = await self._session.scalar(
            select(User.id)
            .where(User.isActive.is_(True))
            .order_by(User.createdAt, User.id)
            .limit(1)
        )
        if actor_id is None:
            raise RuntimeError(
                "Для демо-документов нужен хотя бы один существующий активный пользователь; "
                "seed не создаёт аккаунты"
            )

        department_specs = (
            ("demo_seed_department_0001", DEMO_DEPARTMENT_CODE, "Учебное подразделение"),
            ("demo_seed_department_0002", "DEMO-IT", "Демо: информационные технологии"),
            ("demo_seed_department_0003", "DEMO-OPS", "Демо: административный отдел"),
        )
        for identifier, code, name in department_specs:
            counts["departmentsCreated"] = counts.get("departmentsCreated", 0) + await self._insert(
                Department,
                {"id": identifier, "code": code, "name": name, "isActive": True},
            )
            await self._require_code_id(Department, code, identifier, "подразделение")

        department_ids = {code: identifier for identifier, code, _ in department_specs}
        department_names = {code: name for _, code, name in department_specs}

        employee_specs = (
            {
                "id": DEMO_EMPLOYEE_ID,
                "code": "DEMO-EMP-001",
                "fullName": "Иванов Иван Иванович",
                "departmentCode": DEMO_DEPARTMENT_CODE,
                "position": "Ведущий специалист",
                "rate": Decimal("1.00"),
                "salary": Decimal("0.00"),
                "scheduleId": "demo_seed_staff_schedule_0001",
                "employmentRate": Decimal("1.00"),
            },
            {
                "id": "demo_seed_employee_0002",
                "code": "DEMO-EMP-002",
                "fullName": "Петрова Анна Сергеевна",
                "departmentCode": "DEMO-IT",
                "position": "Руководитель проекта",
                "rate": Decimal("1.00"),
                "salary": Decimal("0.00"),
                "scheduleId": "demo_seed_staff_schedule_0002",
                "employmentRate": Decimal("1.00"),
            },
            {
                "id": "demo_seed_employee_0003",
                "code": "DEMO-EMP-003",
                "fullName": "Сидоров Максим Олегович",
                "departmentCode": "DEMO-IT",
                "position": "Системный аналитик",
                "rate": Decimal("1.00"),
                "salary": Decimal("0.00"),
                "scheduleId": "demo_seed_staff_schedule_0003",
                "employmentRate": Decimal("1.00"),
            },
            {
                "id": "demo_seed_employee_0004",
                "code": "DEMO-EMP-004",
                "fullName": "Кузнецова Елена Викторовна",
                "departmentCode": "DEMO-OPS",
                "position": "Специалист по административному обеспечению",
                "rate": Decimal("1.00"),
                "salary": Decimal("0.00"),
                "scheduleId": "demo_seed_staff_schedule_0004",
                "employmentRate": Decimal("1.00"),
            },
        )

        employee_ids: dict[str, str] = {}
        for employee in employee_specs:
            department_code = str(employee["departmentCode"])
            department_id = department_ids[department_code]
            department_name = department_names[department_code]
            schedule_id = str(employee["scheduleId"])
            counts["staffSchedulesCreated"] = counts.get(
                "staffSchedulesCreated", 0
            ) + await self._insert(
                StaffSchedule,
                {
                    "id": schedule_id,
                    "position": employee["position"],
                    "department": department_name,
                    "departmentId": department_id,
                    "rate": employee["rate"],
                    "salary": employee["salary"],
                },
            )
            counts["employeesCreated"] = counts.get("employeesCreated", 0) + await self._insert(
                Employee,
                {
                    "id": employee["id"],
                    "code": employee["code"],
                    "fullName": employee["fullName"],
                    "department": department_name,
                    "departmentId": department_id,
                    "staffScheduleId": schedule_id,
                    "employmentRate": employee["employmentRate"],
                },
            )
            employee_ids[str(employee["code"])] = await self._require_code_id(
                Employee, str(employee["code"]), str(employee["id"]), "сотрудник"
            )

        counts["projectsCreated"] = await self._insert(
            Project,
            {
                "id": DEMO_PROJECT_ID,
                "code": "DEMO-PRJ-001",
                "name": "Учебное внедрение ERP",
                "description": "Демо-проект для знакомства с участниками и задачами.",
                "startDate": datetime(2026, 1, 1),
                "endDate": datetime(2026, 12, 31),
            },
        )
        existing_project_id = await self._require_code_id(
            Project, "DEMO-PRJ-001", DEMO_PROJECT_ID, "учебный проект"
        )
        counts["projectsCreated"] += await self._insert(
            Project,
            {
                "id": "demo_seed_project_0002",
                "code": "DEMO-PRJ-002",
                "name": "Внедрение системы электронного документооборота",
                "description": "Демо-проект со связанными участниками, задачами и имуществом.",
                "goals": "Настроить электронное хранение и согласование документов.",
                "startDate": datetime(2026, 10, 1),
                "endDate": datetime(2026, 12, 31),
            },
        )
        project_id = await self._require_code_id(
            Project, "DEMO-PRJ-002", "demo_seed_project_0002", "демо-проект"
        )
        links = demo_training_links(
            department_ids[DEMO_DEPARTMENT_CODE],
            str(employee_specs[0]["scheduleId"]),
            employee_ids["DEMO-EMP-001"],
            existing_project_id,
            DEMO_PROJECT_MEMBER_ID,
        )
        counts["projectMembersCreated"] = await self._insert(
            ProjectMember,
            {
                "id": DEMO_PROJECT_MEMBER_ID,
                **links["projectMember"],
                "department": department_names[DEMO_DEPARTMENT_CODE],
                "position": str(employee_specs[0]["position"]),
                "rate": Decimal("0.50"),
                "salary": Decimal("0.00"),
            },
        )
        existing_project_member_id = await self._require_project_member_id(
            existing_project_id, employee_ids["DEMO-EMP-001"], DEMO_PROJECT_MEMBER_ID
        )

        new_member_ids: dict[str, str] = {}
        for index, code in enumerate(("DEMO-EMP-002", "DEMO-EMP-003", "DEMO-EMP-004"), start=2):
            employee = next(item for item in employee_specs if item["code"] == code)
            member_id = f"demo_seed_project_member_{index:04d}"
            employee_id = employee_ids[code]
            counts["projectMembersCreated"] += await self._insert(
                ProjectMember,
                {
                    "id": member_id,
                    "projectId": project_id,
                    "employeeId": employee_id,
                    "department": department_names[str(employee["departmentCode"])],
                    "position": employee["position"],
                    "rate": Decimal("0.50") if code != "DEMO-EMP-004" else Decimal("0.25"),
                    "salary": Decimal("0.00"),
                },
            )
            new_member_ids[code] = await self._require_project_member_id(
                project_id, employee_id, member_id
            )

        counts["tasksCreated"] = await self._insert(
            Task,
            {
                "id": DEMO_TASK_ID,
                **links["task"],
                "name": "Подготовить учебное окружение",
                "description": "Проверить связанные подразделение, сотрудника и проект.",
                "startDate": datetime(2026, 5, 1),
                "endDate": datetime(2026, 6, 30),
                "progress": 50,
                "status": "IN_PROGRESS",
            },
        )
        counts["taskAssigneesCreated"] = await self._insert(
            TaskAssignee,
            {
                "id": "demo_seed_task_assignee_0001",
                **demo_training_links(
                    department_ids[DEMO_DEPARTMENT_CODE],
                    str(employee_specs[0]["scheduleId"]),
                    employee_ids["DEMO-EMP-001"],
                    existing_project_id,
                    existing_project_member_id,
                )["taskAssignee"],
            },
        )

        task_specs = (
            (
                "demo_seed_task_0002",
                "Согласовать структуру электронного архива",
                "Собрать требования подразделений и утвердить категории документов.",
                "DEMO-EMP-002",
                datetime(2026, 10, 1),
                datetime(2026, 10, 31),
                75,
                "IN_PROGRESS",
            ),
            (
                "demo_seed_task_0003",
                "Подготовить рабочие места",
                "Проверить оборудование и доступы для запуска системы.",
                "DEMO-EMP-003",
                datetime(2026, 11, 1),
                datetime(2026, 11, 30),
                0,
                "NOT_STARTED",
            ),
        )
        for task_id, name, description, employee_code, start, end, progress, status in task_specs:
            counts["tasksCreated"] += await self._insert(
                Task,
                {
                    "id": task_id,
                    "projectId": project_id,
                    "name": name,
                    "description": description,
                    "startDate": start,
                    "endDate": end,
                    "progress": progress,
                    "status": status,
                },
            )
            counts["taskAssigneesCreated"] += await self._insert(
                TaskAssignee,
                {
                    "id": task_id.replace("task", "task_assignee"),
                    "taskId": task_id,
                    "employeeId": employee_ids[employee_code],
                    "projectMemberId": new_member_ids[employee_code],
                },
            )

        group_specs = (
            ("demo_seed_asset_group_0001", "DEMO-GRP-IT", "Компьютерная и презентационная техника"),
            ("demo_seed_asset_group_0002", "DEMO-GRP-FURN", "Офисная мебель"),
        )
        group_ids: dict[str, str] = {}
        for group_id, code, name in group_specs:
            counts["assetGroupsCreated"] = counts.get("assetGroupsCreated", 0) + await self._insert(
                AssetGroup, {"id": group_id, "code": code, "name": name}
            )
            group_ids[code] = await self._require_code_id(
                AssetGroup, code, group_id, "группа имущества"
            )

        mol_specs = (
            ("demo_seed_mol_0001", "DEMO-MOL-001", "DEMO-IT", "DEMO-EMP-002", "Кабинет 301"),
            ("demo_seed_mol_0002", "DEMO-MOL-002", "DEMO-OPS", "DEMO-EMP-004", "Склад 1"),
        )
        mol_ids: dict[str, str] = {}
        for mol_id, code, department_code, employee_code, location in mol_specs:
            counts["molsCreated"] = counts.get("molsCreated", 0) + await self._insert(
                Mol,
                {
                    "id": mol_id,
                    "code": code,
                    "department": department_names[department_code],
                    "departmentId": department_ids[department_code],
                    "fullName": str(
                        next(
                            item["fullName"]
                            for item in employee_specs
                            if item["code"] == employee_code
                        )
                    ),
                    "storageLocation": location,
                    "employeeId": employee_ids[employee_code],
                },
            )
            mol_ids[code] = await self._require_code_id(Mol, code, mol_id, "МОЛ")

        asset_specs = (
            (
                "Ноутбук для проектной команды",
                Decimal("2"),
                Decimal("105000.00"),
                "DEMO-MOL-001",
                "DEMO-GRP-IT",
            ),
            ("Монитор 27 дюймов", Decimal("4"), Decimal("24500.00"), "DEMO-MOL-001", "DEMO-GRP-IT"),
            (
                "Проектор для переговорной",
                Decimal("1"),
                Decimal("78000.00"),
                "DEMO-MOL-001",
                "DEMO-GRP-IT",
            ),
            ("Офисное кресло", Decimal("3"), Decimal("18500.00"), "DEMO-MOL-002", "DEMO-GRP-FURN"),
            (
                "Стол для переговорной",
                Decimal("1"),
                Decimal("92000.00"),
                "DEMO-MOL-002",
                "DEMO-GRP-FURN",
            ),
            (
                "Шкаф для документов",
                Decimal("2"),
                Decimal("26000.00"),
                "DEMO-MOL-002",
                "DEMO-GRP-FURN",
            ),
        )
        asset_ids: list[str] = []
        counts["assetsCreated"] = 0
        counts["assetHoldingsCreated"] = 0
        for index, (name, quantity, unit_price, mol_code, group_code) in enumerate(
            asset_specs, start=1
        ):
            asset_id = f"demo_seed_asset_{index:04d}"
            inventory_number = f"DEMO-AST-{index:03d}"
            total_cost = quantity * unit_price
            counts["assetsCreated"] += await self._insert(
                Asset,
                {
                    "id": asset_id,
                    "name": name,
                    "inventoryNumber": inventory_number,
                    "unitPrice": unit_price,
                    "unitOfMeasure": "шт.",
                    "quantity": quantity,
                    "totalCost": total_cost,
                    "initialCost": total_cost,
                    "usefulLifeMonths": 60,
                    "molId": mol_ids[mol_code],
                    "groupId": group_ids[group_code],
                    "projectId": project_id,
                    "recordingDate": datetime(2026, 2, 15),
                    "documentType": "Демо-накладная",
                    "documentDetails": f"Поступление демо-имущества {inventory_number}",
                    "notes": (
                        "Добавлено локальной командой seed; запись можно проверить "
                        "в карточке имущества."
                    ),
                },
            )
            await self._require_value_id(
                Asset, "inventoryNumber", inventory_number, asset_id, "имущество"
            )
            asset_ids.append(asset_id)
            counts["assetHoldingsCreated"] += await self._insert(
                AssetHolding,
                {
                    "id": f"demo_seed_asset_holding_{index:04d}",
                    "assetId": asset_id,
                    "molId": mol_ids[mol_code],
                    "quantity": quantity,
                },
            )

        document_specs: tuple[
            tuple[str, str, str, str | None, str | None, str | None, str, str], ...
        ] = (
            (
                DEMO_DOCUMENT_IDS[0],
                "Паспорт проекта электронного документооборота",
                "PROJECT",
                "DEMO-PRJ-002",
                "DEMO-EMP-002",
                None,
                "demo-project-charter.txt",
                (
                    "ПАСПОРТ ДЕМО-ПРОЕКТА\n\n"
                    "Название: Электронный документооборот\n"
                    "Куратор: Петрова Анна Сергеевна\n"
                    "Статус: в работе\n"
                    "Цель: настроить электронное хранение и согласование документов.\n"
                ),
            ),
            (
                DEMO_DOCUMENT_IDS[1],
                "Карточка сотрудника Анны Петровой",
                "PERSONNEL",
                None,
                "DEMO-EMP-002",
                None,
                "demo-employee-card.txt",
                (
                    "КАРТОЧКА ДЕМО-СОТРУДНИКА\n\n"
                    "ФИО: Петрова Анна Сергеевна\n"
                    "Подразделение: Демо: информационные технологии\n"
                    "Должность: Руководитель проекта\n"
                    "Табельный номер: DEMO-EMP-002\n"
                ),
            ),
            (
                DEMO_DOCUMENT_IDS[2],
                "Акт приёма ноутбуков",
                "ASSET",
                "DEMO-PRJ-002",
                None,
                asset_ids[0],
                "demo-asset-acceptance.txt",
                (
                    "АКТ ПРИЁМА-ПЕРЕДАЧИ ДЕМО-ИМУЩЕСТВА\n\n"
                    "Инвентарный номер: DEMO-AST-001\n"
                    "Наименование: Ноутбук для проектной команды\n"
                    "Количество: 2 шт.\n"
                    "Ответственный: Петрова Анна Сергеевна\n"
                ),
            ),
        )
        counts["documentsCreated"] = 0
        counts["documentVersionsCreated"] = 0
        for (
            document_id,
            title,
            category,
            linked_project_code,
            linked_employee_code,
            document_asset_id,
            filename,
            body,
        ) in document_specs:
            existing_document = await self._session.scalar(
                select(Document.id).where(Document.id == document_id)
            )
            if existing_document is not None:
                has_version = await self._session.scalar(
                    select(DocumentVersion.id)
                    .where(DocumentVersion.documentId == document_id)
                    .limit(1)
                )
                if has_version is None:
                    raise RuntimeError(
                        f"Демо-документ {document_id} уже есть без версии; "
                        "автоматическое восстановление остановлено"
                    )
                continue

            content = body.encode("utf-8")
            staged = await self._document_storage.stage(
                UploadStream(
                    chunks=self._single_chunk(content),
                    mime_type="text/plain",
                    declared_size=len(content),
                ),
                1024 * 1024,
            )
            self.staged_files.append(staged)
            await self._document_storage.promote(staged)

            project_document_id = (
                (project_id if linked_project_code == "DEMO-PRJ-002" else existing_project_id)
                if linked_project_code
                else None
            )
            counts["documentsCreated"] += await self._insert(
                Document,
                {
                    "id": document_id,
                    "title": title,
                    "description": (
                        "Демо-файл для проверки карточки и скачивания документа в приложении."
                    ),
                    "category": category,
                    "projectId": project_document_id,
                    "employeeId": (
                        employee_ids[linked_employee_code] if linked_employee_code else None
                    ),
                    "assetId": document_asset_id,
                    "createdById": actor_id,
                },
            )
            counts["documentVersionsCreated"] += await self._insert(
                DocumentVersion,
                {
                    "id": document_id.replace("document", "document_version"),
                    "documentId": document_id,
                    "versionNumber": 1,
                    "storageKey": staged.stored.key,
                    "originalFilename": filename,
                    "mimeType": "text/plain",
                    "extension": "txt",
                    "sizeBytes": staged.stored.size,
                    "sha256": staged.stored.sha256,
                    "comment": "Демо-файл, созданный локальным seed.",
                    "uploadedById": actor_id,
                },
            )

        counts["trainingRecordsCreated"] = sum(
            value for key, value in counts.items() if key not in {"trainingRecordsCreated"}
        )
        return counts

    async def _require_code_id(self, model: Any, code: str, expected_id: str, label: str) -> str:
        identifier = await self._session.scalar(select(model.id).where(model.code == code))
        if identifier is None:
            raise RuntimeError(f"Не удалось получить демо-запись: {label} {code}")
        if identifier != expected_id:
            raise RuntimeError(
                f"Код {code} уже занят другой записью; seed остановлен без её изменения"
            )
        return str(identifier)

    async def _require_value_id(
        self, model: Any, column: str, value: str, expected_id: str, label: str
    ) -> str:
        identifier = await self._session.scalar(
            select(model.id).where(getattr(model, column) == value)
        )
        if identifier is None:
            raise RuntimeError(f"Не удалось получить демо-запись: {label} {value}")
        if identifier != expected_id:
            raise RuntimeError(
                f"Значение {value} уже занято другой записью; seed остановлен без её изменения"
            )
        return str(identifier)

    async def _require_project_member_id(
        self, project_id: str, employee_id: str, expected_id: str
    ) -> str:
        identifier = await self._session.scalar(
            select(ProjectMember.id).where(
                ProjectMember.projectId == project_id,
                ProjectMember.employeeId == employee_id,
            )
        )
        if identifier is None or identifier != expected_id:
            raise RuntimeError("Демо-связь участника проекта уже занята другой записью")
        return str(identifier)

    @staticmethod
    async def _single_chunk(content: bytes) -> AsyncIterator[bytes]:
        yield content

    async def _insert(self, model: Any, values: dict[str, Any]) -> int:
        result = await self._session.execute(idempotent_insert_statement(model, values))
        return int(cast(CursorResult[Any], result).rowcount or 0)


class SqlAlchemyVerifyDataRepository:
    """Проверки SQL только для чтения; прикладной сервис не знает деталей ORM и SQL."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def verify_data(self) -> VerifyDataSnapshot:
        checks = {
            "holdingMismatch": """
                SELECT COUNT(*) FROM "assets" asset
                LEFT JOIN (
                    SELECT "assetId", COALESCE(SUM("quantity"), 0) AS quantity
                    FROM "asset_holdings" GROUP BY "assetId"
                ) holding ON holding."assetId" = asset."id"
                WHERE COALESCE(holding.quantity, 0) <> asset."quantity"
            """,
            "negativeAssets": """
                SELECT COUNT(*) FROM "assets"
                WHERE "quantity" < 0 OR "unitPrice" < 0 OR "totalCost" < 0
            """,
            "negativeHoldings": """
                SELECT COUNT(*) FROM "asset_holdings" WHERE "quantity" < 0
            """,
            "orphanHoldings": """
                SELECT COUNT(*) FROM "asset_holdings" holding
                LEFT JOIN "assets" asset ON asset."id" = holding."assetId"
                LEFT JOIN "mols" mol ON mol."id" = holding."molId"
                WHERE asset."id" IS NULL OR mol."id" IS NULL
            """,
            "secretAuditRows": """
                SELECT COUNT(*) FROM "audit_logs"
                WHERE COALESCE("details"::text, '')
                    ~* '(passwordHash|temporaryPassword|NEXTAUTH_SECRET)'
            """,
            "departmentCycles": """
                WITH RECURSIVE hierarchy AS (
                    SELECT "id" AS "originId", "parentId", ARRAY["id"] AS path, false AS cycle
                    FROM "departments"
                    UNION ALL
                    SELECT hierarchy."originId", parent."parentId",
                           hierarchy.path || parent."id", parent."id" = ANY(hierarchy.path)
                    FROM hierarchy
                    JOIN "departments" parent ON parent."id" = hierarchy."parentId"
                    WHERE NOT hierarchy.cycle
                )
                SELECT COUNT(DISTINCT "originId") FROM hierarchy WHERE cycle
            """,
            "duplicateDepartmentCodes": """
                SELECT COUNT(*) FROM (
                    SELECT LOWER("code") FROM "departments"
                    GROUP BY LOWER("code") HAVING COUNT(*) > 1
                ) duplicates
            """,
            "duplicateDepartmentNames": """
                SELECT COUNT(*) FROM (
                    SELECT LOWER("name") FROM "departments"
                    GROUP BY LOWER("name") HAVING COUNT(*) > 1
                ) duplicates
            """,
            "departmentSnapshotMismatch": """
                SELECT COUNT(*) FROM (
                    SELECT employee."id" FROM "employees" employee
                    JOIN "departments" department ON department."id" = employee."departmentId"
                    WHERE employee."department" <> department."name"
                    UNION ALL
                    SELECT position."id" FROM "staff_schedule" position
                    JOIN "departments" department ON department."id" = position."departmentId"
                    WHERE position."department" <> department."name"
                    UNION ALL
                    SELECT mol."id" FROM "mols" mol
                    JOIN "departments" department ON department."id" = mol."departmentId"
                    WHERE mol."department" <> department."name"
                ) mismatches
            """,
            "documentCurrentVersionMismatch": """
                SELECT COUNT(*) FROM "documents" document
                LEFT JOIN "document_versions" version
                    ON version."documentId" = document."id"
                   AND version."versionNumber" = document."currentVersion"
                WHERE version."id" IS NULL
            """,
            "unsafeDocumentMetadata": """
                SELECT COUNT(*) FROM "document_versions"
                WHERE "storageKey" !~ '^[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f-]{36}$'
                   OR "sha256" !~ '^[0-9a-f]{64}$'
                   OR "sizeBytes" <= 0
            """,
        }
        counters = {
            key: int(await self._session.scalar(text(statement)) or 0)
            for key, statement in checks.items()
        }
        rows = (
            await self._session.execute(
                select(
                    DocumentVersion.storageKey,
                    DocumentVersion.sizeBytes,
                    DocumentVersion.sha256,
                )
            )
        ).all()
        files = tuple(
            DocumentFileReference(row.storageKey, row.sizeBytes, row.sha256) for row in rows
        )
        return VerifyDataSnapshot(counters, files)
