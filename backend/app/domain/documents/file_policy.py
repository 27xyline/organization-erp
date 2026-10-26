"Правила имени файла, MIME-типа и размера, не зависящие от транспорта."

import re
import unicodedata
from dataclasses import dataclass
from pathlib import PurePosixPath

from app.domain.errors import DomainError

MIMES = {
    "pdf": ("application/pdf",),
    "doc": ("application/msword",),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document",),
    "xls": ("application/vnd.ms-excel",),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",),
    "csv": ("text/csv", "application/csv", "application/vnd.ms-excel"),
    "txt": ("text/plain",),
    "png": ("image/png",),
    "jpg": ("image/jpeg",),
    "jpeg": ("image/jpeg",),
    "zip": ("application/zip", "application/x-zip-compressed"),
}


@dataclass(frozen=True, slots=True)
class FileMetadata:
    filename: str
    extension: str
    mime_type: str


def validate_file(filename: str, mime: str | None, size: int | None, maximum: int) -> FileMetadata:
    if size is not None:
        if size <= 0:
            raise DomainError("EMPTY_FILE", "Файл пуст", 422)
        if size > maximum:
            raise DomainError(
                "FILE_TOO_LARGE", f"Размер файла превышает {maximum // 1048576} МБ", 422
            )
    name = re.sub(
        r"[\x00-\x1f\x7f]",
        "",
        unicodedata.normalize("NFC", filename.replace("\\", "/").split("/")[-1]).strip(),
    )
    if not name or name in (".", "..") or len(name) > 255:
        raise DomainError("INVALID_FILENAME", "Некорректное имя файла", 422)
    extension = PurePosixPath(name).suffix[1:].lower()
    if extension not in MIMES:
        raise DomainError(
            "UNSUPPORTED_EXTENSION",
            "Поддерживаются PDF, DOC/DOCX, XLS/XLSX, CSV, TXT, PNG, JPG и ZIP",
            422,
        )
    declared = (mime or "").split(";")[0].strip().lower() or MIMES[extension][0]
    if declared not in MIMES[extension]:
        raise DomainError("MIME_MISMATCH", "Тип файла не соответствует его расширению", 422)
    return FileMetadata(name, extension, declared)
