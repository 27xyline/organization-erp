"Операционные сценарии чтения и заполнения данными, доступные через явные точки входа CLI."

from __future__ import annotations

from app.domain.ports.cli import DemoSeedPort, DocumentFileVerificationPort, VerifyDataPort


class DemoSeedService:
    "Заполнить предсказуемый учебный набор данных; при запуске приложения не вызывается."

    def __init__(self, seed_port: DemoSeedPort) -> None:
        self._seed_port = seed_port

    async def seed(self) -> dict[str, int]:
        return await self._seed_port.seed_training_dataset()


class VerifyDataService:
    "Выполнить проверки связей и сохранённых файлов только для чтения через порты."

    def __init__(
        self, verify_port: VerifyDataPort, document_files: DocumentFileVerificationPort
    ) -> None:
        self._verify_port = verify_port
        self._document_files = document_files

    async def verify(self) -> dict[str, int]:
        snapshot = await self._verify_port.verify_data()
        result = dict(snapshot.counters)
        missing_or_corrupt = 0
        for reference in snapshot.document_files:
            if not await self._document_files.verify(reference):
                missing_or_corrupt += 1
        result["missingOrCorruptDocumentFiles"] = missing_or_corrupt
        return result
