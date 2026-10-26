from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import event, select
from sqlalchemy.orm import selectinload

from app.db.registry import Department, Employee


@pytest.mark.anyio
async def test_eager_loaded_collection_detaches_without_n_plus_one(
    db_session_factory, db_engine
) -> None:
    suffix = uuid4().hex
    department_code = f"d-{suffix}"

    async with db_session_factory() as session:
        transaction = await session.begin()
        try:
            department = Department(code=department_code, name=f"Mapping {suffix}")
            employees = [
                Employee(
                    code=f"e-{suffix}-{index}",
                    fullName=f"Mapping employee {index}",
                    department="Mapping department",
                    departmentRef=department,
                )
                for index in range(3)
            ]
            session.add_all([department, *employees])
            await session.flush()

            statements: list[str] = []

            def count_query(_conn, _cursor, statement, _parameters, _context, _executemany) -> None:
                if statement.lstrip().upper().startswith("SELECT"):
                    statements.append(statement)

            event.listen(db_engine.sync_engine, "before_cursor_execute", count_query)
            try:
                result = await session.scalars(
                    select(Department)
                    .where(Department.code == department_code)
                    .options(selectinload(Department.employees))
                )
                loaded_department = result.one()
            finally:
                event.remove(db_engine.sync_engine, "before_cursor_execute", count_query)

            assert len(statements) == 2
            assert len(loaded_department.employees) == 3
            session.expunge_all()
            assert [employee.fullName for employee in loaded_department.employees] == [
                "Mapping employee 0",
                "Mapping employee 1",
                "Mapping employee 2",
            ]
        finally:
            await transaction.rollback()
