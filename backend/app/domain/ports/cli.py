"""Ports for explicit operational CLI use cases."""

from __future__ import annotations

from typing import Protocol


class DemoSeedPort(Protocol):
    async def seed_training_dataset(self) -> dict[str, int]: ...


class VerifyDataPort(Protocol):
    async def verify_data(self) -> dict[str, int]: ...
