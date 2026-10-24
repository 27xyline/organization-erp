"""Output boundary for rendering authorized report projections."""

from __future__ import annotations

from typing import Any, Protocol


class DashboardExportRenderer(Protocol):
    async def render(self, output_format: str, data: dict[str, Any]) -> bytes: ...
