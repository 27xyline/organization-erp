from tests.conftest import _stage02_database_url


def test_stage11_test_database_is_allowed(monkeypatch) -> None:
    monkeypatch.setenv(
        "STAGE11_TEST_DATABASE_URL",
        "postgresql://tester:secret@localhost/erp_stage11_test",
    )
    for name in (
        "STAGE10_TEST_DATABASE_URL",
        "STAGE09_TEST_DATABASE_URL",
        "STAGE08_TEST_DATABASE_URL",
        "STAGE07_TEST_DATABASE_URL",
        "STAGE06_TEST_DATABASE_URL",
        "STAGE05_TEST_DATABASE_URL",
        "STAGE04_TEST_DATABASE_URL",
        "STAGE03_TEST_DATABASE_URL",
        "STAGE02_TEST_DATABASE_URL",
    ):
        monkeypatch.delenv(name, raising=False)
    assert _stage02_database_url() == (
        "postgresql+asyncpg://tester:secret@localhost/erp_stage11_test"
    )
