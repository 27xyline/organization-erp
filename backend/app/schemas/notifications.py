from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator


class NotificationQueryInput(BaseModel):
    page: int = Field(default=1, ge=1)
    pageSize: int = Field(default=20, ge=1, le=100)
    unreadOnly: bool = False

    @field_validator("unreadOnly", mode="before")
    @classmethod
    def parse_boolean_query(cls, value: object) -> bool:
        if isinstance(value, bool):
            return value
        if value == "true":
            return True
        if value == "false":
            return False
        raise ValueError("Invalid boolean query")


class NotificationStateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    read: StrictBool


class NotificationPreferenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    eventType: Literal[
        "SYSTEM",
        "CONTRACT_EXPIRING",
        "TASK_OVERDUE",
        "ASSET_DISPOSAL_DUE",
        "ASSET_MAINTENANCE_DUE",
        "BUDGET_OVERRUN",
        "APPROVAL_REQUESTED",
        "APPROVAL_DECIDED",
    ]
    channel: Literal["IN_APP", "EMAIL"]
    enabled: StrictBool


class NotificationPreferencesInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    preferences: list[NotificationPreferenceInput] = Field(max_length=20)

    @model_validator(mode="after")
    def unique_pairs(self) -> "NotificationPreferencesInput":
        keys = [(item.eventType, item.channel) for item in self.preferences]
        if len(keys) != len(set(keys)):
            raise ValueError("Настройка канала указана повторно")
        return self


class SmtpSettingsInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    host: str = Field(min_length=1)
    port: int = Field(gt=0)
    username: str = Field(min_length=1)
    password: str = ""
    secure: bool = False
    fromEmail: str = Field(min_length=3)

    @field_validator("fromEmail")
    @classmethod
    def valid_email(cls, value: str) -> str:
        if "@" not in value:
            raise ValueError("Invalid email")
        return value
