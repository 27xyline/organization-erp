from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True, slots=True)
class ApprovalStepCommand:
    approverId: str
    name: str


@dataclass(frozen=True, slots=True)
class ApprovalCommand:
    title: str
    steps: tuple[ApprovalStepCommand, ...]
    description: str | None = None
    documentId: str | None = None
    projectId: str | None = None
    entityType: str | None = None
    entityId: str | None = None
    dueAt: datetime | None = None


@dataclass(frozen=True, slots=True)
class ApprovalDecisionCommand:
    decision: str
    comment: str | None = None
