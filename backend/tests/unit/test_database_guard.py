import pytest

from tests.database import test_database_url as resolve_test_database_url


def test_database_url_normalizes_postgresql_driver(monkeypatch) -> None:
    monkeypatch.setenv(
        "BACKEND_TEST_DATABASE_URL", "postgresql://tester:secret@localhost/organization_erp_test"
    )
    assert (
        resolve_test_database_url()
        == "postgresql+asyncpg://tester:secret@localhost/organization_erp_test"
    )


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://tester:secret@localhost/organization_erp_dev",
        "postgresql://tester:secret@localhost/organization_erp_e2e",
        "sqlite:///organization_erp_test",
    ],
)
def test_database_url_rejects_non_test_targets(monkeypatch, url: str) -> None:
    monkeypatch.setenv("BACKEND_TEST_DATABASE_URL", url)
    with pytest.raises(ValueError, match="organization_erp_test"):
        resolve_test_database_url()


def test_database_url_requires_explicit_test_configuration(monkeypatch) -> None:
    monkeypatch.delenv("BACKEND_TEST_DATABASE_URL", raising=False)
    monkeypatch.setenv(
        "BACKEND_DATABASE_URL", "postgresql://tester:secret@localhost/organization_erp_dev"
    )
    with pytest.raises(ValueError, match="BACKEND_TEST_DATABASE_URL"):
        resolve_test_database_url()
