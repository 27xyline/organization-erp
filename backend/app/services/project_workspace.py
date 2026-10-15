"""Permission-filtered project activity without document mutation ownership."""

from app.core.context import Actor
from app.domain.ports.projects import ActivityRecord
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.employees import authorize
from app.services.projects import project_error


class ProjectWorkspaceService:
    def __init__(self, factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._factory = factory

    async def activity(self, project_id: str, actor: Actor) -> tuple[ActivityRecord, ...]:
        authorize(actor, "projects.read", {"projectId": project_id})
        assert actor.access is not None
        async with self._factory() as uow:
            if await uow.projects.get(project_id) is None:
                raise project_error()
            all_events = actor.access.has("auditLogs.read")
            return await uow.projects.activity(
                project_id,
                all_events or actor.access.allows("tasks.read", {"projectId": project_id}),
                all_events
                or actor.access.allows("documents.read", {"documentProjectId": project_id}),
            )
