from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest

from app.core.context import Actor, RequestContext
from app.db.uow import SqlAlchemyUnitOfWorkFactory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.models.enums import UserRole
from app.models.users import User
from app.services.dto.procurement import (
    ProcurementCommand,
    ProcurementItemCommand,
    ProcurementQuery,
)
from app.services.procurement import ProcurementService


@pytest.mark.anyio
async def test_list_summary_counts_full_filtered_result_before_pagination(
    db_session_factory,
) -> None:
    suffix = uuid4().hex[:10]
    user_id = f"list-user-{suffix}"
    async with db_session_factory() as session:
        session.add(
            User(
                id=user_id,
                username=user_id,
                name="Закупщик",
                passwordHash="hash",
                role=UserRole.ADMIN,
                mustChangePassword=False,
            )
        )
        await session.commit()

    context = RequestContext(
        request_id=f"list-{suffix}",
        actor=Actor(
            actor_id=user_id,
            roles=("ADMIN",),
            is_authenticated=True,
            session_version=1,
            access=AccessContext(
                user_id=user_id,
                employee_id=None,
                employee_department_id=None,
                member_project_ids=(),
                grants=(ScopeGrant("admin", "ADMIN", "ALL", "ALL"),),
            ),
        ),
    )
    service = ProcurementService(SqlAlchemyUnitOfWorkFactory(db_session_factory))
    for index, budget in enumerate((Decimal("120"), Decimal("80")), start=1):
        await service.create(
            ProcurementCommand(
                number=f"LIST-{suffix}-{index}",
                title=f"Список {suffix} {index}",
                budgetLimit=budget,
                items=(ProcurementItemCommand("Кабель", Decimal("1"), "шт", Decimal("10")),),
            ),
            context,
        )

    result = await service.list(
        ProcurementQuery(page=2, pageSize=1, search=suffix),
        context,
    )

    assert result["total"] == 2
    assert len(result["requests"]) == 1
    assert result["summary"] == {
        "active": 2,
        "awaiting": 0,
        "overdue": 0,
        "budget": Decimal("200.00"),
    }
