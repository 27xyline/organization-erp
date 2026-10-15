import asyncio
from dataclasses import replace
from datetime import datetime
from decimal import Decimal

import pytest
from sqlalchemy import func, select, update

from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.errors import DomainError
from app.models.departments import Department
from app.models.employees import Employee
from app.models.finance import PersonnelAction
from app.models.users import User
from app.services.dto.employees import (
    EmployeeCommand,
    EmployeeListQuery,
    PersonnelActionCommand,
    StaffCommand,
    VacationCommand,
)


def hire(env, suffix=""):
    return EmployeeCommand(
        code=env["prefix"] + suffix,
        fullName="Worker",
        contractNumber="42",
        contractSignedDate="2026-01-01",
        contractEndDate="2026-10-01",
        employmentRate=Decimal("1"),
        staffScheduleId=env["staff_id"],
        fields=frozenset(
            {
                "code",
                "fullName",
                "contractNumber",
                "contractSignedDate",
                "contractEndDate",
                "employmentRate",
                "staffScheduleId",
            }
        ),
    )


@pytest.mark.anyio
async def test_hire_capacity_is_serialized_and_dismiss_clears_head(hr_env):
    env = hr_env
    results = await asyncio.gather(
        *(env["employees"].create(hire(env, str(i)), env["context"]) for i in range(2)),
        return_exceptions=True,
    )
    employees = [item for item in results if not isinstance(item, BaseException)]
    assert len(employees) == 1
    assert (
        len(
            [
                item
                for item in results
                if isinstance(item, DomainError) and item.code == "INSUFFICIENT_POSITION_RATE"
            ]
        )
        == 1
    )
    employee = employees[0]
    async with env["sessions"]() as session:
        await session.execute(
            update(Department)
            .where(Department.id == env["department_id"])
            .values(headEmployeeId=employee.id)
        )
        await session.commit()
    await env["employees"].dismiss(employee.id, env["context"])
    async with env["sessions"]() as session:
        assert (
            await session.scalar(
                select(Department.headEmployeeId).where(Department.id == env["department_id"])
            )
            is None
        )
        assert (
            await session.scalar(select(Employee.status).where(Employee.id == employee.id))
            == "DISMISSED"
        )
        assert (
            await session.scalar(
                select(func.count())
                .select_from(PersonnelAction)
                .where(PersonnelAction.employeeId == employee.id)
            )
            == 2
        )


@pytest.mark.anyio
async def test_sync_is_idempotent_even_concurrent(hr_env):
    env = hr_env
    employee = await env["employees"].create(hire(env), env["context"])
    result = await asyncio.gather(*(env["actions"].sync(env["context"]) for _ in range(2)))
    assert sorted(result) == [0, 1]
    async with env["sessions"]() as session:
        assert (
            await session.scalar(
                select(func.count())
                .select_from(PersonnelAction)
                .where(PersonnelAction.employeeId == employee.id, PersonnelAction.type == "ARCHIVE")
            )
            == 1
        )


@pytest.mark.anyio
async def test_equal_day_vacation_and_overlap_are_allowed(hr_env):
    env = hr_env
    employee = await env["employees"].create(hire(env), env["context"])
    command = VacationCommand(employee.id, "2026-10-01", "2026-10-01")
    first = await env["workforce"].save_vacation(None, command, env["context"])
    second = await env["workforce"].save_vacation(None, command, env["context"])
    assert first.id != second.id
    assert len(await env["workforce"].vacations(2026, env["actor"])) == 2
    with pytest.raises(DomainError) as error:
        await env["workforce"].save_vacation(
            None, VacationCommand(employee.id, "2026-10-02", "2026-10-01"), env["context"]
        )
    assert error.value.code == "INVALID_DATES"


@pytest.mark.anyio
async def test_stale_actor_cannot_mutate(hr_env):
    env = hr_env
    async with env["sessions"]() as session:
        await session.execute(
            update(User).where(User.id == env["user_id"]).values(sessionVersion=2)
        )
        await session.commit()
    with pytest.raises(DomainError) as error:
        await env["employees"].create(hire(env), env["context"])
    assert error.value.status_code == 401


@pytest.mark.anyio
async def test_scoped_hr_and_employee_reads(hr_env):
    env = hr_env
    employee = await env["employees"].create(hire(env), env["context"])
    access = AccessContext(
        env["user_id"], None, None, (), (ScopeGrant("hr", "HR", "ASSIGNED", "NONE", ("foreign",)),)
    )
    actor = replace(env["actor"], access=access)
    rows, total = await env["employees"].list(EmployeeListQuery(), actor)
    assert rows == [] and total == 0
    assert await env["actions"].sync(replace(env["context"], actor=actor)) == 0
    with pytest.raises(DomainError) as error:
        await env["employees"].dismiss(employee.id, replace(env["context"], actor=actor))
    assert error.value.status_code == 403
    access = AccessContext(
        env["user_id"],
        employee.id,
        employee.departmentId,
        (),
        (ScopeGrant("self", "EMPLOYEE", "SELF", "SELF"),),
    )
    rows, total = await env["employees"].list(
        EmployeeListQuery(), replace(env["actor"], access=access)
    )
    assert total == 1 and rows[0].id == employee.id


@pytest.mark.anyio
async def test_position_in_use_rate_and_department_change_rules(hr_env):
    env = hr_env
    await env["employees"].create(hire(env), env["context"])
    with pytest.raises(DomainError) as error:
        await env["workforce"].save_position(
            env["staff_id"],
            StaffCommand(
                "Engineer", Decimal("0.5"), Decimal("100000"), departmentId=env["department_id"]
            ),
            env["context"],
        )
    assert error.value.code == "RATE_BELOW_OCCUPIED"
    with pytest.raises(DomainError) as error:
        await env["workforce"].delete_position(env["staff_id"], env["context"])
    assert error.value.code == "POSITION_IN_USE"


@pytest.mark.anyio
@pytest.mark.parametrize(
    "change,code",
    [
        ({"employmentRate": Decimal("0")}, "INVALID_EMPLOYMENT_RATE"),
        ({"contractEndDate": "2026-01-01"}, "INVALID_CONTRACT_DATE_RANGE"),
        ({"staffScheduleId": "missing"}, "POSITION_NOT_FOUND"),
        ({"staffScheduleId": None}, "POSITION_REQUIRED"),
    ],
)
async def test_hire_validation_has_no_partial_employee_or_action(hr_env, change, code):
    env = hr_env
    with pytest.raises(DomainError) as error:
        await env["employees"].create(replace(hire(env), **change), env["context"])
    assert error.value.code == code
    async with env["sessions"]() as session:
        assert (
            await session.scalar(
                select(func.count()).select_from(Employee).where(Employee.code == env["prefix"])
            )
            == 0
        )
        assert await session.scalar(select(func.count()).select_from(PersonnelAction)) == 0


@pytest.mark.anyio
async def test_inactive_position_preservation_and_reactivation(hr_env):
    env = hr_env
    employee = await env["employees"].create(hire(env), env["context"])
    async with env["sessions"]() as session:
        await session.execute(
            update(Department).where(Department.id == env["department_id"]).values(isActive=False)
        )
        await session.commit()
    edited = await env["employees"].update(
        employee.id,
        EmployeeCommand(fullName="Changed", fields=frozenset({"fullName"})),
        env["context"],
    )
    assert edited.fullName == "Changed"
    await env["employees"].dismiss(employee.id, env["context"])
    with pytest.raises(DomainError) as error:
        await env["employees"].update(
            employee.id,
            EmployeeCommand(status="ACTIVE", fields=frozenset({"status"})),
            env["context"],
        )
    assert error.value.code == "INACTIVE_POSITION_DEPARTMENT"
    with pytest.raises(DomainError) as error:
        await env["employees"].create(hire(env, "-next"), env["context"])
    assert error.value.code == "INACTIVE_POSITION_DEPARTMENT"


@pytest.mark.anyio
async def test_promote_and_extend_are_atomic_and_keep_nontransfer_department_snapshot(hr_env):
    env = hr_env
    employee = await env["employees"].create(hire(env), env["context"])
    from app.models.timekeeping import StaffSchedule

    second_id = env["prefix"] + "-second"
    async with env["sessions"]() as session:
        session.add(
            StaffSchedule(
                id=second_id,
                position="Senior",
                departmentId=env["department_id"],
                department=env["department_id"],
                rate=2,
                salary=200000,
            )
        )
        await session.commit()
    action = await env["actions"].create(
        PersonnelActionCommand(
            type="PROMOTE",
            date="2026-10-02",
            employeeId=employee.id,
            staffScheduleId=second_id,
            employmentRate=Decimal("1.5"),
        ),
        env["context"],
    )
    assert action.newPosition == "Senior"
    async with env["factory"]() as uow:
        promoted = await uow.employees.get(employee.id)
        assert promoted.staffScheduleId == second_id and promoted.employmentRate == Decimal("1.5")
    with pytest.raises(DomainError) as error:
        await env["actions"].create(
            PersonnelActionCommand(type="EXTEND", date="2026-10-03", employeeId=employee.id),
            env["context"],
        )
    assert error.value.code == "MISSING_CONTRACT_END_DATE"
    action = await env["actions"].create(
        PersonnelActionCommand(
            type="EXTEND",
            date="2026-10-03",
            employeeId=employee.id,
            newContractEndDate="2027-01-01",
            newDepartment="ignored",
        ),
        env["context"],
    )
    assert action.newDepartment == env["department_id"]
    async with env["factory"]() as uow:
        changed = await uow.employees.get(employee.id)
        assert changed.contractEndDate == datetime(2027, 1, 1)
        assert changed.departmentId == env["department_id"]


@pytest.mark.anyio
async def test_transfer_checks_capacity_and_foreign_target_scope(hr_env):
    env = hr_env
    employee = await env["employees"].create(hire(env), env["context"])
    async with env["sessions"]() as session:
        from app.models.timekeeping import StaffSchedule

        dept = env["prefix"] + "-foreign"
        target = env["prefix"] + "-foreign-staff"
        session.add(Department(id=dept, code=dept, name=dept))
        await session.flush()
        session.add(
            StaffSchedule(
                id=target,
                position="Foreign",
                departmentId=dept,
                department=dept,
                rate=1,
                salary=100000,
            )
        )
        await session.commit()
    access = AccessContext(
        env["user_id"],
        None,
        None,
        (),
        (ScopeGrant("hr", "HR", "ASSIGNED", "NONE", (env["department_id"],)),),
    )
    context = replace(env["context"], actor=replace(env["actor"], access=access))
    with pytest.raises(DomainError) as error:
        await env["actions"].create(
            PersonnelActionCommand(
                type="TRANSFER", date="2026-10-03", employeeId=employee.id, staffScheduleId=target
            ),
            context,
        )
    assert error.value.status_code == 403
    with pytest.raises(DomainError) as error:
        await env["actions"].create(
            PersonnelActionCommand(
                type="TRANSFER",
                date="2026-10-03",
                employeeId=employee.id,
                staffScheduleId=target,
                employmentRate=Decimal("2"),
            ),
            env["context"],
        )
    assert error.value.code == "INSUFFICIENT_POSITION_RATE"
    async with env["factory"]() as uow:
        assert (await uow.employees.get(employee.id)).departmentId == env["department_id"]


@pytest.mark.anyio
async def test_profile_skills_certificates_roundtrip_and_manager_validation(hr_env):
    env = hr_env
    from app.services.dto.employees import CertificateCommand, ProfileCommand, SkillCommand

    employee = await env["employees"].create(hire(env), env["context"])
    command = ProfileCommand(
        skills=(SkillCommand("Python", 5),),
        certificates=(
            CertificateCommand("Diploma", issuedAt="2026-01-01", expiresAt="2026-01-01"),
        ),
        birthDate="1990-01-01",
        education="University",
    )
    await env["employees"].update_profile(employee.id, command, env["context"])
    profile = await env["employees"].profile(employee.id, env["actor"])
    assert profile.skills[0]["name"] == "Python"
    assert profile.certificates[0]["expiresAt"] == datetime(2026, 1, 1)
    assert profile.employee.birthDate == datetime(1990, 1, 1)
    assert profile.employee.staffSchedule.salary == Decimal("100000")
    with pytest.raises(DomainError) as error:
        await env["employees"].update_profile(
            employee.id, replace(command, managerId=employee.id), env["context"]
        )
    assert error.value.code == "INVALID_MANAGER"
    with pytest.raises(DomainError) as error:
        await env["employees"].update_profile(
            employee.id,
            replace(command, skills=(SkillCommand("Python"), SkillCommand("python"))),
            env["context"],
        )
    assert error.value.status_code == 422
    profile = await env["employees"].profile(employee.id, env["actor"])
    assert len(profile.skills) == 1


@pytest.mark.anyio
async def test_audit_failure_rolls_back_dismissal_action_and_department_head(hr_env, monkeypatch):
    env = hr_env
    from app.repositories.audit import SqlAlchemyAuditRepository

    employee = await env["employees"].create(hire(env), env["context"])
    async with env["sessions"]() as session:
        await session.execute(
            update(Department)
            .where(Department.id == env["department_id"])
            .values(headEmployeeId=employee.id)
        )
        await session.commit()

    async def fail_audit(self, record):
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(SqlAlchemyAuditRepository, "append", fail_audit)
    with pytest.raises(RuntimeError, match="audit unavailable"):
        await env["employees"].dismiss(employee.id, env["context"])
    async with env["sessions"]() as session:
        assert (
            await session.scalar(select(Employee.status).where(Employee.id == employee.id))
            == "ACTIVE"
        )
        assert (
            await session.scalar(
                select(Department.headEmployeeId).where(Department.id == env["department_id"])
            )
            == employee.id
        )
        assert (
            await session.scalar(
                select(func.count())
                .select_from(PersonnelAction)
                .where(PersonnelAction.employeeId == employee.id)
            )
            == 1
        )


@pytest.mark.anyio
async def test_profile_failure_rolls_back_replacement_and_personal_fields(hr_env, monkeypatch):
    env = hr_env
    from app.repositories.audit import SqlAlchemyAuditRepository
    from app.services.dto.employees import ProfileCommand, SkillCommand

    employee = await env["employees"].create(hire(env), env["context"])
    await env["employees"].update_profile(
        employee.id,
        ProfileCommand((SkillCommand("Python"),), (), education="Before"),
        env["context"],
    )

    async def fail_audit(self, record):
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(SqlAlchemyAuditRepository, "append", fail_audit)
    with pytest.raises(RuntimeError):
        await env["employees"].update_profile(
            employee.id,
            ProfileCommand((SkillCommand("GoLang"),), (), education="After"),
            env["context"],
        )
    profile = await env["employees"].profile(employee.id, env["actor"])
    assert profile.employee.education == "Before"
    assert profile.skills[0]["name"] == "Python"


@pytest.mark.anyio
async def test_current_forced_password_guard_is_rechecked_inside_mutation(hr_env):
    env = hr_env
    async with env["sessions"]() as session:
        await session.execute(
            update(User).where(User.id == env["user_id"]).values(mustChangePassword=True)
        )
        await session.commit()
    with pytest.raises(DomainError) as error:
        await env["employees"].create(hire(env), env["context"])
    assert error.value.code == "PASSWORD_CHANGE_REQUIRED"


@pytest.mark.anyio
async def test_salary_visibility_matches_legacy_hr_without_finance_permission(hr_env):
    env = hr_env
    employee = await env["employees"].create(hire(env), env["context"])
    access = AccessContext(
        env["user_id"],
        None,
        None,
        (),
        (ScopeGrant("hr", "HR", "ASSIGNED", "NONE", (env["department_id"],)),),
    )
    assert not access.has("finance.salary.read")
    actor = replace(env["actor"], access=access)
    profile = await env["employees"].profile(employee.id, actor)
    assert profile.employee.staffSchedule.salary == Decimal("100000")
    positions = await env["workforce"].positions(actor)
    assert positions[0].position.salary == Decimal("100000")


@pytest.mark.anyio
async def test_year_boundary_vacations_are_included_in_both_years(hr_env):
    env = hr_env
    employee = await env["employees"].create(hire(env), env["context"])
    await env["workforce"].save_vacation(
        None, VacationCommand(employee.id, "2026-12-31", "2027-01-01", "SICK_LEAVE"), env["context"]
    )
    assert len(await env["workforce"].vacations(2026, env["actor"])) == 1
    assert len(await env["workforce"].vacations(2027, env["actor"])) == 1


@pytest.mark.anyio
async def test_duplicate_employee_code_is_translated_without_partial_action(hr_env):
    env = hr_env
    employee = await env["employees"].create(
        replace(hire(env), employmentRate=Decimal(".25")), env["context"]
    )
    with pytest.raises(DomainError) as error:
        await env["employees"].create(
            replace(hire(env), employmentRate=Decimal(".25")), env["context"]
        )
    assert error.value.code == "EMPLOYEE_CODE_EXISTS"
    async with env["sessions"]() as session:
        assert (
            await session.scalar(
                select(func.count())
                .select_from(PersonnelAction)
                .where(PersonnelAction.employeeId == employee.id)
            )
            == 1
        )


@pytest.mark.anyio
async def test_expired_scope_filters_and_paginates_without_losing_active_expired_records(hr_env):
    env = hr_env
    expired = await env["employees"].create(
        replace(
            hire(env),
            contractSignedDate="2020-01-01",
            contractEndDate="2020-12-31",
            employmentRate=Decimal(".25"),
        ),
        env["context"],
    )
    await env["employees"].create(
        replace(
            hire(env, "-not-expired"), contractEndDate="2099-01-01", employmentRate=Decimal(".25")
        ),
        env["context"],
    )
    rows, total = await env["employees"].list(
        EmployeeListQuery(scope="expired", page_size=100), env["actor"]
    )
    assert total == 1 and [row.id for row in rows] == [expired.id]


@pytest.mark.anyio
async def test_project_employee_reference_scopes_salary_and_existing_members(hr_env):
    from app.models.projects import Project, ProjectMember
    from app.services.dto.employees import EmployeeReferenceQuery

    env = hr_env
    employee = await env["employees"].create(
        replace(hire(env), employmentRate=Decimal(".25")), env["context"]
    )
    second = await env["employees"].create(
        replace(hire(env, "-second"), employmentRate=Decimal(".25")), env["context"]
    )
    third = await env["employees"].create(
        replace(hire(env, "-dismissed"), employmentRate=Decimal(".25")), env["context"]
    )
    await env["employees"].dismiss(third.id, env["context"])
    project_id = env["prefix"] + "-project"
    async with env["sessions"]() as session:
        session.add(Project(id=project_id, code=project_id, name="Reference"))
        await session.flush()
        session.add(
            ProjectMember(
                projectId=project_id,
                employeeId=employee.id,
                department=employee.department,
                position="Engineer",
                rate=1,
                salary=100000,
            )
        )
        await session.commit()
    try:
        access = AccessContext(
            env["user_id"],
            None,
            None,
            (),
            (ScopeGrant("pm", "PROJECT_MANAGER", "NONE", "ASSIGNED", project_ids=(project_id,)),),
        )
        actor = replace(env["actor"], access=access)
        rows = await env["employees"].project_references(EmployeeReferenceQuery(project_id), actor)
        assert [row.id for row in rows if row.code.startswith(env["prefix"])] == [second.id]
        assert next(row for row in rows if row.id == second.id).salary == ""
        assert next(row for row in rows if row.id == second.id).rate == "0.25"
        rows = await env["employees"].project_references(
            EmployeeReferenceQuery(project_id), env["actor"]
        )
        assert next(row for row in rows if row.id == second.id).salary == "25000.00"
        with pytest.raises(DomainError) as error:
            await env["employees"].project_references(EmployeeReferenceQuery("foreign"), actor)
        assert error.value.status_code == 403
    finally:
        async with env["sessions"]() as session:
            from sqlalchemy import delete

            await session.execute(delete(Project).where(Project.id == project_id))
            await session.commit()


@pytest.mark.anyio
async def test_positionless_dismissed_employee_direct_department_snapshot_and_inactive_rules(
    hr_env,
):
    env = hr_env
    employee = await env["employees"].create(hire(env), env["context"])
    await env["employees"].dismiss(employee.id, env["context"])
    await env["employees"].update(
        employee.id,
        EmployeeCommand(staffScheduleId=None, fields=frozenset({"staffScheduleId"})),
        env["context"],
    )
    second = env["prefix"] + "-second-dept"
    async with env["sessions"]() as session:
        session.add(Department(id=second, code=second, name=second))
        await session.commit()
    edited = await env["employees"].update(
        employee.id,
        EmployeeCommand(department=second, fields=frozenset({"department"})),
        env["context"],
    )
    assert edited.department == second and edited.departmentId == second
    async with env["sessions"]() as session:
        await session.execute(
            update(Department).where(Department.id == second).values(isActive=False)
        )
        await session.execute(
            update(Department).where(Department.id == env["department_id"]).values(isActive=False)
        )
        await session.commit()
    edited = await env["employees"].update(
        employee.id,
        EmployeeCommand(department=second, fields=frozenset({"department"})),
        env["context"],
    )
    assert edited.departmentId == second
    with pytest.raises(DomainError) as error:
        await env["employees"].update(
            employee.id,
            EmployeeCommand(department=env["department_id"], fields=frozenset({"department"})),
            env["context"],
        )
    assert error.value.code == "INACTIVE_DEPARTMENT"


@pytest.mark.anyio
async def test_employees_list_uses_constant_query_count_not_n_plus_one(hr_env):
    from sqlalchemy import event

    env = hr_env
    await env["employees"].create(replace(hire(env), employmentRate=Decimal(".25")), env["context"])
    counts = []

    def count_queries(connection, cursor, statement, parameters, context, executemany):
        counts.append(statement)

    engine = env["sessions"].kw["bind"]
    event.listen(engine.sync_engine, "before_cursor_execute", count_queries)
    try:
        await env["employees"].list(EmployeeListQuery(), env["actor"])
        first = len(counts)
        event.remove(engine.sync_engine, "before_cursor_execute", count_queries)
        await env["employees"].create(
            replace(hire(env, "-second"), employmentRate=Decimal(".25")), env["context"]
        )
        await env["employees"].create(
            replace(hire(env, "-third"), employmentRate=Decimal(".25")), env["context"]
        )
        counts.clear()
        event.listen(engine.sync_engine, "before_cursor_execute", count_queries)
        rows, total = await env["employees"].list(EmployeeListQuery(), env["actor"])
        assert total == 3
        assert len(counts) == first == 4
        assert all(row.staffSchedule.department_active for row in rows)
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", count_queries)


@pytest.mark.anyio
async def test_revocation_held_actor_row_serializes_hr_mutation(hr_env):
    env = hr_env
    async with env["sessions"]() as revoker:
        await revoker.scalar(select(User).where(User.id == env["user_id"]).with_for_update())
        pending = asyncio.create_task(env["employees"].create(hire(env), env["context"]))
        await asyncio.sleep(0.03)
        assert not pending.done()
        await revoker.execute(
            update(User).where(User.id == env["user_id"]).values(sessionVersion=2)
        )
        await revoker.commit()
        with pytest.raises(DomainError) as error:
            await pending
        assert error.value.code == "UNAUTHENTICATED"
    async with env["sessions"]() as session:
        assert (
            await session.scalar(
                select(func.count()).select_from(Employee).where(Employee.code == env["prefix"])
            )
            == 0
        )


@pytest.mark.anyio
async def test_staff_delete_protects_active_zero_rate_legacy_employee(hr_env):
    env = hr_env
    employee = await env["employees"].create(hire(env), env["context"])
    async with env["sessions"]() as session:
        await session.execute(
            update(Employee).where(Employee.id == employee.id).values(employmentRate=0)
        )
        await session.commit()
    with pytest.raises(DomainError) as error:
        await env["workforce"].delete_position(env["staff_id"], env["context"])
    assert error.value.code == "POSITION_IN_USE"


@pytest.mark.anyio
async def test_profile_composes_project_salary_documents_and_mol_assets_without_mutation(hr_env):

    from app.api.routes.employees import profile_wire
    from app.models.assets import Asset
    from app.models.catalogs import AssetGroup, Mol
    from app.models.documents import Document, DocumentVersion
    from app.models.finance import SalaryEntry
    from app.models.projects import Project, ProjectMember

    env = hr_env
    employee = await env["employees"].create(hire(env), env["context"])
    project_id = env["prefix"] + "-profile-project"
    mol_id = env["prefix"] + "-profile-mol"
    asset_id = env["prefix"] + "-profile-asset"
    group_id = env["prefix"] + "-profile-group"
    document_id = env["prefix"] + "-profile-doc"
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.db.uow import create_unit_of_work_factory
    from app.services.employees import EmployeeService

    async with env["sessions"].kw["bind"].connect() as connection:
        outer = await connection.begin()
        composition_sessions = async_sessionmaker(
            connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        composition_service = EmployeeService(create_unit_of_work_factory(composition_sessions))
        async with composition_sessions() as session:
            session.add(Project(id=project_id, code=project_id, name="Project"))
            session.add(AssetGroup(id=group_id, code=group_id, name=group_id))
            session.add(
                Mol(
                    id=mol_id,
                    code=mol_id,
                    fullName="Custodian",
                    departmentId=employee.departmentId,
                    department=employee.department,
                    employeeId=employee.id,
                    storageLocation="Office",
                )
            )
            await session.flush()
            session.add(
                ProjectMember(
                    projectId=project_id,
                    employeeId=employee.id,
                    department=employee.department,
                    position="Engineer",
                    rate=1,
                    salary=100000,
                )
            )
            session.add(SalaryEntry(employeeId=employee.id, year=2026, month=10, amount=100000))
            session.add(
                Asset(
                    id=asset_id,
                    name="Laptop",
                    inventoryNumber=asset_id,
                    unitPrice=100,
                    unitOfMeasure="piece",
                    quantity=2,
                    totalCost=200,
                    recordingDate=datetime(2026, 1, 1),
                    documentType="Act",
                    documentDetails="fixture",
                    molId=mol_id,
                    groupId=group_id,
                )
            )
            await session.flush()
            session.add(
                Document(
                    id=document_id,
                    title="Linked document",
                    employeeId=employee.id,
                    projectId=project_id,
                    assetId=asset_id,
                    createdById=env["user_id"],
                )
            )
            await session.flush()
            import uuid

            session.add(
                DocumentVersion(
                    documentId=document_id,
                    versionNumber=1,
                    storageKey="aa/bb/" + str(uuid.uuid4()),
                    originalFilename="fixture.txt",
                    mimeType="text/plain",
                    extension="txt",
                    sizeBytes=1,
                    sha256="a" * 64,
                    uploadedById=env["user_id"],
                )
            )
            await session.commit()
        try:
            profile = await composition_service.profile(employee.id, env["actor"])
            result = profile_wire(profile)
            assert result["employee"]["projects"][0]["project"]["id"] == project_id
            assert result["employee"]["projects"][0]["taskCount"] == 0
            assert result["employee"]["salaryEntries"][0]["amount"] == 100000
            assert result["employee"]["mol"]["assets"][0]["quantity"] == 2
            assert result["employee"]["mol"]["assets"][0]["totalCost"] == 200
            assert result["employee"]["documents"][0]["id"] == document_id
            # HR employee access does not authorize a document linked to an unassigned project.
            access = AccessContext(
                env["user_id"],
                None,
                None,
                (),
                (ScopeGrant("hr", "HR", "ASSIGNED", "NONE", (employee.departmentId,)),),
            )
            scoped = await composition_service.profile(
                employee.id, replace(env["actor"], access=access)
            )
            assert scoped.documents == ()
            assert len(scoped.salary_entries) == 1  # preserve legacy salary field visibility
        finally:
            await outer.rollback()
