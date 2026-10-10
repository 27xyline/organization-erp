from pydantic import BaseModel, ConfigDict, Field, field_validator


class CredentialsInput(BaseModel):
    model_config = ConfigDict(strict=True)
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=512)

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value
