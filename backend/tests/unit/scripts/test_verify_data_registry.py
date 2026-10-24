from sqlalchemy.orm import configure_mappers

from app.scripts.verify_data import MODEL_METADATA


def test_verify_data_cli_loads_complete_mapper_registry_without_database() -> None:
    configure_mappers()

    assert "assets" in MODEL_METADATA.tables
    assert "mols" in MODEL_METADATA.tables
    assert "documents" in MODEL_METADATA.tables
