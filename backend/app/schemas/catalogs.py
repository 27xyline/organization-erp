"""HTTP payloads for asset catalogs."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


class GroupInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    code: Annotated[str, StringConstraints(min_length=1, max_length=50)]
    description: Annotated[str | None, StringConstraints(max_length=500)] = None


class MolInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: Annotated[str, StringConstraints(min_length=1, max_length=50)]
    department_id: Annotated[
        str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
    ] = Field(default=None, alias="departmentId")
    department: Annotated[
        str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
    ] = None
    full_name: Annotated[str, StringConstraints(min_length=1, max_length=200)] = Field(
        alias="fullName"
    )
    storage_location: Annotated[str, StringConstraints(min_length=1, max_length=300)] = Field(
        alias="storageLocation"
    )
    photo: str | None = None

    @model_validator(mode="after")
    def require_department_reference(self) -> "MolInput":
        if not self.department_id and not self.department:
            raise ValueError("Подразделение обязательно")
        return self
