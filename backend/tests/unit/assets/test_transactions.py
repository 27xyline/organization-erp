"""Retries only follow real UoW rollback/close on recognized database failures."""

from types import SimpleNamespace

import pytest
from sqlalchemy.exc import DBAPIError

from app.core.context import Actor, RequestContext
from app.db.uow import SqlAlchemyUnitOfWork
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.errors import RetryableTransactionError
from app.services.assets import AssetService, asset_json


class DriverFailure(Exception):
    def __init__(self, state):
        self.sqlstate = state


class Session:
    def __init__(self):
        self.events = []

    async def begin(self):
        self.events.append("begin")

    async def execute(self, statement):
        self.events.append("isolation")

    async def rollback(self):
        self.events.append("rollback")

    async def close(self):
        self.events.append("close")

    async def commit(self):
        self.events.append("commit")


class Users:
    async def get(self, actor_id, for_update=False):
        return SimpleNamespace(is_active=True, session_version=1)


@pytest.mark.anyio
@pytest.mark.parametrize("state,retries", [("40001", 3), ("40P01", 3), ("23505", 1)])
async def test_retryable_errors_use_fresh_sessions_and_rollback_each_attempt(state, retries):
    sessions = []

    def factory():
        session = Session()
        sessions.append(session)
        uow = SqlAlchemyUnitOfWork(lambda: session)
        uow.users = Users()
        return uow

    actor = Actor(
        "actor",
        is_authenticated=True,
        session_version=1,
        access=AccessContext(
            "actor", None, None, (), (ScopeGrant("grant", "ADMIN", "ALL", "ALL"),)
        ),
    )

    async def failure(uow, actor):
        raise DBAPIError("statement", {}, DriverFailure(state), False)

    with pytest.raises(RetryableTransactionError if retries == 3 else DBAPIError):
        await AssetService(factory).mutate(
            RequestContext("req", actor=actor), "assets.create", failure
        )
    assert len(sessions) == retries
    assert all(
        session.events == ["begin", "isolation", "rollback", "close"] for session in sessions
    )


@pytest.mark.anyio
async def test_arbitrary_external_failure_is_never_retried():
    sessions = []

    def factory():
        session = Session()
        sessions.append(session)
        uow = SqlAlchemyUnitOfWork(lambda: session)
        uow.users = Users()
        return uow

    actor = Actor(
        "actor",
        is_authenticated=True,
        session_version=1,
        access=AccessContext(
            "actor", None, None, (), (ScopeGrant("grant", "ADMIN", "ALL", "ALL"),)
        ),
    )

    async def failure(uow, actor):
        raise RuntimeError("external effect failed")

    with pytest.raises(RuntimeError):
        await AssetService(factory).mutate(
            RequestContext("req", actor=actor), "assets.create", failure
        )
    assert len(sessions) == 1
    assert sessions[0].events[-2:] == ["rollback", "close"]


def test_decimal_nullable_and_date_json_match_prisma():
    from datetime import date, datetime
    from decimal import Decimal

    assert asset_json(
        {
            "quantity": Decimal("0.10"),
            "zero": Decimal("0.00"),
            "date": date(2026, 10, 1),
            "time": datetime(2026, 10, 1, 1, 2, 3),
            "null": None,
        }
    ) == {
        "quantity": "0.1",
        "zero": "0",
        "date": "2026-10-01T00:00:00.000Z",
        "time": "2026-10-01T01:02:03.000Z",
        "null": None,
    }
