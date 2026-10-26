from app.db.uow import SqlAlchemyUnitOfWork


def test_uow_exposes_procurement_repository() -> None:
    uow = SqlAlchemyUnitOfWork(lambda: None)  # type: ignore[arg-type]
    assert uow.procurement is not None
