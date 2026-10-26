"Порты преобразования данных книги активов в байты XLSX и обратно."

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Protocol

from app.domain.assets.importing import ParsedAssetImportRow


class AssetWorkbookPort(Protocol):
    def parse_workbook(self, payload: bytes) -> tuple[ParsedAssetImportRow, ...]: ...

    def build_import_template(
        self,
        mols: Sequence[Mapping[str, object]],
        groups: Sequence[Mapping[str, object]],
    ) -> bytes: ...

    def build_export(
        self,
        headers: Sequence[str],
        rows: Sequence[Mapping[str, object]],
    ) -> bytes: ...
