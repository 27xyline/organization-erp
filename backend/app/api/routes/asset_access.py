"""Приоритет legacy-авторизации перед проверкой тела запроса."""

from typing import Annotated

from fastapi import Depends, Request

from app.api.dependencies import get_authenticated_context
from app.core.context import RequestContext
from app.services.catalogs import _authorize


async def get_asset_context(
    request: Request,
    context: Annotated[RequestContext, Depends(get_authenticated_context)],
) -> RequestContext:
    path = request.url.path
    method = request.method
    permission = "assets.read"
    if path.startswith("/api/operations"):
        permission = "operations.read"
    elif path.startswith("/api/export"):
        permission = "assets.export"
    elif "/inventories" in path:
        permission = "assets.inventory.manage"
    elif "/import/" in path:
        permission = "assets.create"
    elif "/saved-views" in path or path.endswith("/qr"):
        permission = "assets.read"
    elif path.endswith("/transfers"):
        permission = "assets.transfer"
    elif path.endswith("/disposals"):
        permission = "assets.dispose"
    elif path.endswith("/archive"):
        permission = "assets.archive"
    elif path.endswith("/restore"):
        permission = "assets.restore"
    elif "/maintenance" in path:
        permission = "assets.read" if method == "GET" else "assets.update"
    elif path == "/api/assets" and method == "POST":
        permission = "assets.create"
    elif method == "PUT":
        permission = "assets.update"
    assert context.actor is not None
    _authorize(context.actor, permission)
    return context
