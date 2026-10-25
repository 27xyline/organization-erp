"""Ports for rendering payroll and payslip download artifacts."""

from __future__ import annotations

from typing import Any, Protocol


class PayrollWorkbookPort(Protocol):
    def build_payroll(self, year: int, month: int, rows: list[dict[str, Any]]) -> bytes: ...

    def build_payslip(self, year: int, month: int, row: dict[str, Any]) -> bytes: ...
