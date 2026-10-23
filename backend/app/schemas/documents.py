"""Document transport validation; application commands remain plain dataclasses."""

from dataclasses import asdict
from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, ValidationInfo, field_validator

from app.domain.documents.records import DocumentRecord

Category = Literal[
    "GENERAL", "CONTRACT", "ORDER", "ACT", "INVOICE", "PERSONNEL", "PROJECT", "ASSET", "OTHER"
]
Status = Literal["DRAFT", "IN_REVIEW", "APPROVED", "SIGNED", "ARCHIVED"]
Title = Annotated[str, Field(min_length=1, max_length=200)]
Identifier = Annotated[str, Field(min_length=1, max_length=100)]


class Input(BaseModel):
    @field_validator("*", mode="before")
    @classmethod
    def normalize(cls, value: object, info: ValidationInfo) -> object:
        if info.field_name == "date" and (value is None or isinstance(value, (int, float, bool))):
            try:
                return datetime.fromtimestamp(float(value or 0) / 1000, UTC)
            except (ValueError, OverflowError):
                raise ValueError("Invalid date") from None
        if info.field_name in ("lockVersion", "page", "pageSize") and value is None:
            return 0
        if info.field_name in ("projectId", "employeeId", "assetId"):
            if value == "":
                return None
            if value is None or not isinstance(value, str):
                raise ValueError("Invalid input")
        if value is None and info.field_name != "date":
            raise ValueError("Expected string, received null")
        if isinstance(value, str) and info.field_name not in (
            "filename",
            "template",
            "format",
            "category",
            "status",
            "archived",
        ):
            value = value.strip()
        return value


class Links(Input):
    projectId: Identifier | None = None
    employeeId: Identifier | None = None
    assetId: Identifier | None = None


class DocumentInput(Links):
    title: Title
    filename: Annotated[str, Field(min_length=1, max_length=1024)]
    description: Annotated[str, Field(max_length=2000)] | None = None
    category: Category = "GENERAL"


class VersionInput(Input):
    filename: Annotated[str, Field(min_length=1, max_length=1024)]
    comment: Annotated[str, Field(max_length=500)] | None = None
    lockVersion: Annotated[int, Field(gt=0)]


class ArchiveInput(Input):
    lockVersion: Annotated[int, Field(gt=0)]


class StatusInput(ArchiveInput):
    status: Literal["DRAFT", "IN_REVIEW", "APPROVED", "SIGNED"]


class GenerateInput(Links):
    template: Literal["PERSONNEL_ORDER", "ACCEPTANCE_ACT"]
    title: Title
    number: Annotated[str, Field(min_length=1, max_length=50)]
    date: datetime
    subject: Annotated[str, Field(min_length=1, max_length=500)]
    details: Annotated[str, Field(min_length=1, max_length=5000)]
    basis: Annotated[str, Field(max_length=1000)] | None = None
    format: Literal["docx", "pdf"] = "docx"


class QueryInput(Links):
    page: Annotated[int, Field(ge=1)] = 1
    pageSize: Annotated[int, Field(ge=1, le=100)] = 25
    search: Annotated[str, Field(max_length=200)] | None = None
    status: Status | None = None
    category: Category | None = None
    archived: Literal["true", "false"] = "false"


def document_values(record: DocumentRecord) -> dict[str, object]:
    """Map detached typed records to the original HTTP names and bigint strings."""
    result = asdict(record)
    result["versions"] = [
        {**asdict(version), "sizeBytes": str(version.sizeBytes)} for version in record.versions
    ]
    return result
