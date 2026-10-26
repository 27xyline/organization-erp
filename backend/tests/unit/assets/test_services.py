from datetime import datetime
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.core.context import Actor, RequestContext
from app.services.assets import AssetService
from app.services.dto.assets import MovementCommand


@pytest.mark.anyio
async def test_missing_permission_cannot_reach_persistence() -> None:
    factory = AsyncMock()
    with pytest.raises(Exception) as error:
        await AssetService(factory).dispose(
            "asset",
            MovementCommand("mol", Decimal("1"), datetime(2026, 1, 1), "Акт", "Основание"),
            RequestContext("request", actor=Actor("user")),
        )
    assert error.value.code == "UNAUTHENTICATED"
    factory.assert_not_called()
