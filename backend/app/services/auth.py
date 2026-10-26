from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from app.core.context import Actor
from app.domain.auth.rules import AccessContext, expand_descendants
from app.domain.errors import DomainError
from app.domain.ports.passwords import PasswordHasher
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.dto.auth import CredentialResult

DUMMY_PASSWORD_HASH = (
    "$argon2id$v=19$m=19456,t=2,p=1$+36IIFx11COz7QN/lSuvTw$"
    "mH1nOGOKWcF2DybAY21pMM2Wetr5VL1IleeYHCasrfs"
)


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class AuthService:
    def __init__(
        self,
        uow_factory: UnitOfWorkFactory[UnitOfWork],
        passwords: PasswordHasher,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self._uow_factory = uow_factory
        self._passwords = passwords
        self._clock = clock

    async def authenticate_credentials(
        self, username: str, password: str
    ) -> CredentialResult | None:
        username = username.strip().lower()
        if not 1 <= len(username) <= 100 or not 1 <= len(password) <= 512:
            return None
        async with self._uow_factory() as uow:
            user = await uow.users.by_username_for_update(username)
            now = self._clock()
            if (
                user is None
                or not user.is_active
                or (user.locked_until and user.locked_until > now)
            ):
                await self._passwords.verify(DUMMY_PASSWORD_HASH, password)
                return None
            attempts = (
                0 if user.locked_until and user.locked_until <= now else user.failed_login_attempts
            )
            valid = await self._passwords.verify(user.password_hash, password)
            if not valid:
                attempts += 1
                await uow.users.update_auth(
                    user.id,
                    {
                        "failedLoginAttempts": attempts,
                        "lockedUntil": now + timedelta(minutes=15) if attempts >= 5 else None,
                    },
                )
                await uow.commit()
                return None
            values: dict[str, object] = {
                "failedLoginAttempts": 0,
                "lockedUntil": None,
                "lastLoginAt": now,
            }
            if self._passwords.needs_rehash(user.password_hash):
                values["passwordHash"] = await self._passwords.hash(password)
            await uow.users.update_auth(user.id, values)
            await uow.commit()
            return CredentialResult(
                user.id,
                user.name,
                user.username,
                user.role,
                tuple(g.role for g in user.grants),
                user.session_version,
                user.must_change_password,
            )

    async def resolve_actor(self, user_id: str, session_version: int) -> Actor:
        async with self._uow_factory() as uow:
            user = await uow.users.get(user_id, for_update=True)
            if not user or not user.is_active or user.session_version != session_version:
                raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
            departments = (
                await uow.users.departments()
                if any(g.department_scope_mode == "ASSIGNED" for g in user.grants)
                else ()
            )
            from dataclasses import replace

            grants = tuple(
                replace(g, department_ids=expand_descendants(g.department_ids, departments))
                if g.department_scope_mode == "ASSIGNED"
                else g
                for g in user.grants
            )
            access = AccessContext(
                user.id,
                user.employee_id,
                user.employee_department_id,
                user.member_project_ids,
                grants,
            )
            return Actor(
                actor_id=user.id,
                roles=access.roles,
                is_authenticated=True,
                employee_id=user.employee_id,
                session_version=user.session_version,
                permissions=access.permissions,
                must_change_password=user.must_change_password,
                username=user.username,
                name=user.name,
                role=user.role,
                access=access,
            )
