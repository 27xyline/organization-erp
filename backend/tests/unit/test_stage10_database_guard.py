from tests.conftest import _stage02_database_url


def test_stage10_test_url_is_explicitly_restricted_to_stage10_database(monkeypatch) -> None:
    monkeypatch.setenv(
        "STAGE10_TEST_DATABASE_URL", "postgresql://tester:secret@localhost/erp_stage10_test"
    )
    for name in (
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

    assert _stage02_database_url().endswith("/erp_stage10_test")


def test_stage10_url_cannot_target_another_database(monkeypatch) -> None:
    monkeypatch.setenv(
        "STAGE10_TEST_DATABASE_URL", "postgresql://tester:secret@localhost/erp_stage09_test"
    )
    for name in (
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

    try:
        _stage02_database_url()
    except BaseException as error:
        assert "erp_stage10_test" in str(error)
    else:
        raise AssertionError("non-Stage10 database URL must be rejected")
