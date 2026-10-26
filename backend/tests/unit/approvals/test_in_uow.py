from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.context import Actor, RequestContext
from app.domain.enums import ApprovalRequestStatus
from app.domain.ports.notifications import NotificationDeliveryPlan, NotificationProduceResult
from app.services.approvals import decide_approval_in_uow
from app.services.dto.approvals import ApprovalDecisionCommand


@pytest.mark.anyio
async def test_decide_approval_in_uow_keeps_state_audit_notification_in_caller_transaction() -> (
    None
):
    request = {
        "id": "s10-approval-1",
        "status": "PENDING",
        "currentStep": 1,
        "lockVersion": 2,
        "requestedById": "s10-requester",
        "title": "Tabель",
        "documentId": None,
        "steps": [
            {"id": "s10-step-1", "sequence": 1, "status": "PENDING", "approverId": "s10-approver"}
        ],
    }
    approvals = SimpleNamespace(
        get_for_update=AsyncMock(return_value=request),
        update_step=AsyncMock(),
        update_request=AsyncMock(),
        update_waiting_steps=AsyncMock(),
        set_document_status=AsyncMock(),
    )
    notifications = SimpleNamespace(
        deliveries=AsyncMock(
            return_value=NotificationDeliveryPlan(
                active_user_ids=("s10-requester",),
                deliveries=(("s10-requester", "IN_APP"),),
            )
        ),
        enqueue=AsyncMock(return_value=NotificationProduceResult(created=1, email_queued=0)),
    )
    uow = SimpleNamespace(
        approvals=approvals,
        notifications=notifications,
        audit=SimpleNamespace(append=AsyncMock()),
        commit=AsyncMock(),
    )
    context = RequestContext(
        request_id="s10-request", actor=Actor(actor_id="s10-approver", is_authenticated=True)
    )

    result = await decide_approval_in_uow(
        "s10-approval-1", ApprovalDecisionCommand(decision="APPROVE"), context, uow
    )

    assert result["status"] == ApprovalRequestStatus.APPROVED.value
    approvals.update_step.assert_awaited_once()
    approvals.update_request.assert_awaited_once()
    uow.audit.append.assert_awaited()
    notifications.enqueue.assert_awaited_once()
    uow.commit.assert_not_awaited()
