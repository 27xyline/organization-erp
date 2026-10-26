from app.core.context import Actor, RequestContext
from app.domain.errors import DomainError, PersistenceConflict
from app.domain.ports.assets import SavedViewRecord
from app.domain.ports.uow import UnitOfWork
from app.services.assets import AssetService
from app.services.catalogs import _authorize
from app.services.dto.assets import SavedViewCommand


class SavedViewService(AssetService):
    async def list_views(self, actor: Actor) -> tuple[SavedViewRecord, ...]:
        _authorize(actor, "assets.read")
        async with self.factory() as uow:
            return await uow.assets.views(actor.actor_id)

    async def create_view(
        self, command: SavedViewCommand, context: RequestContext
    ) -> SavedViewRecord:
        async def work(uow: UnitOfWork, actor: Actor) -> SavedViewRecord:
            try:
                return await uow.assets.create_view(actor.actor_id, command.name, command.filters)
            except PersistenceConflict as error:
                if error.constraint == "asset_saved_views_userId_name_key":
                    raise DomainError(
                        "SAVED_VIEW_EXISTS",
                        "Представление с таким названием уже существует",
                        409,
                    ) from error
                raise

        return await self.mutate(context, "assets.read", work, serializable=False)

    async def delete_view(self, view_id: str, context: RequestContext) -> bool:
        async def work(uow: UnitOfWork, actor: Actor) -> bool:
            return await uow.assets.delete_view(actor.actor_id, view_id)

        return await self.mutate(context, "assets.read", work, serializable=False)
