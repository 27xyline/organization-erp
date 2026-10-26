from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class CredentialResult:
    id: str
    name: str
    username: str
    role: str
    roles: tuple[str, ...]
    sessionVersion: int
    mustChangePassword: bool
