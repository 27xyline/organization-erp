"""Operational read/seed use cases behind explicit CLI entry points."""

from __future__ import annotations

from app.domain.ports.cli import DemoSeedPort, VerifyDataPort


class DemoSeedService:
    """Seed the deterministic training dataset; never invoked by app startup."""

    def __init__(self, seed_port: DemoSeedPort) -> None:
        self._seed_port = seed_port

    async def seed(self) -> dict[str, int]:
        return await self._seed_port.seed_training_dataset()


class VerifyDataService:
    """Run read-only relational checks through a persistence port."""

    def __init__(self, verify_port: VerifyDataPort) -> None:
        self._verify_port = verify_port

    async def verify(self) -> dict[str, int]:
        return await self._verify_port.verify_data()
