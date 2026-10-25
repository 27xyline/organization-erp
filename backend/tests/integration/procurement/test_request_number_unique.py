from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest

from app.core.context import Actor, RequestContext
from app.db.uow import SqlAlchemyUnitOfWorkFactory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.errors import DomainError
from app.models.users import User
from app.services.dto.procurement import ProcurementCommand, ProcurementItemCommand
from app.services.procurement import ProcurementService


@pytest.mark.anyio
async def test_duplicate_request_number_maps_unique_constraint_to_contract_error(
    db_session_factory,
) -> None:
    suffix = uuid4().hex[:10]
    user_id = f"number-user-{suffix}"
    async with db_session_factory() as session:
        session.add(
            User(
                id=user_id,
                username=user_id,
                name="Закупщик",
                passwordHash="hash",
                mustChangePassword=False,
            )
        )
        await session.commit()

    context = RequestContext(
        request_id=f"number-{suffix}",
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
                grants=(ScopeGrant("scope", "ADMIN", "ALL", "ALL"),),
            ),
        ),
    )
    service = ProcurementService(SqlAlchemyUnitOfWorkFactory(db_session_factory))
    command = ProcurementCommand(
        number=f"UNIQUE-{suffix}",
        title="Заявка с уникальным номером",
        budgetLimit=Decimal("10"),
        items=(ProcurementItemCommand("Кабель", Decimal("1"), "шт", Decimal("10")),),
    )
    await service.create(command, context)
    with pytest.raises(DomainError) as error:
        await service.create(command, context)
    assert error.value.code == "PROCUREMENT_NUMBER_EXISTS"
    assert error.value.status_code == 409
