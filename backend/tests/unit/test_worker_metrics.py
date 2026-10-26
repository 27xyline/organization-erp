from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader

from app.core.metrics import NotificationWorkerMetrics


def test_notification_worker_metrics_keep_bounded_job_and_database_values() -> None:
    reader = InMemoryMetricReader()
    provider = MeterProvider(metric_readers=[reader])
    worker = NotificationWorkerMetrics(provider.get_meter("worker-metrics-test"))
    worker.heartbeat(1_800_000_000.0)
    worker.record_job("scheduled_alerts", succeeded=False)
    worker.update_outbox_snapshot(
        pending=4,
        oldest_age_seconds=12.5,
        terminal_failed=2,
        expired_leases=1,
        generation_last_success_timestamp_seconds=1_799_999_000.0,
    )

    data = reader.get_metrics_data()
    assert data is not None
    metrics = {
        metric.name: metric
        for resource in data.resource_metrics
        for scope in resource.scope_metrics
        for metric in scope.metrics
    }

    assert metrics["erp_notification_outbox_pending"].data.data_points[0].value == 4
    assert metrics["erp_notification_outbox_oldest_age_seconds"].data.data_points[0].value == 12.5
    assert metrics["erp_notification_outbox_expired_leases"].data.data_points[0].value == 1
    job_point = metrics["erp_notification_worker_jobs_total"].data.data_points[0]
    assert job_point.value == 1
    assert job_point.attributes == {"job": "scheduled_alerts", "outcome": "error"}
    assert metrics["erp_notification_generation_failures_total"].data.data_points[0].value == 1

    provider.shutdown()
