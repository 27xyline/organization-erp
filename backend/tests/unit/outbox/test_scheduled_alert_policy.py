from datetime import datetime, timedelta

from app.services.scheduled_alerts import should_run


def test_hourly_success_suppresses_generation_until_interval_expires() -> None:
    now = datetime(2026, 1, 1, 12)

    assert not should_run(now, None, now - timedelta(minutes=59))
    assert should_run(now, None, now - timedelta(hours=1))


def test_failed_attempt_retry_gap_is_five_minutes() -> None:
    now = datetime(2026, 1, 1, 12)

    assert not should_run(now, now - timedelta(minutes=4), None)
    assert should_run(now, now - timedelta(minutes=5), None)


def test_manual_force_bypasses_intervals() -> None:
    now = datetime(2026, 1, 1, 12)

    assert should_run(now, now, now, force=True)
