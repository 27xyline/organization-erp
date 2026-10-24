# Волна 4: существующие фоновые задачи и мониторинг на Python

> Для агента: выполнить только этап 13 и остановиться. Использовать `superpowers:executing-plans`; без автоматических веток/коммитов/subagents.

**Цель:** перенести текущие worker/outbox/alerts и подключить Python к существующим метрикам и traces.

**Архитектура:** `tasks` управляет циклом, `services` — обработкой, `repositories` — claiming, `integrations` — SMTP; [spec](../../specs/2026-09-28-fastapi-backend-design.md).

**Стек:** asyncio, SQLAlchemy/asyncpg, aiosmtplib, OpenTelemetry Python; имеющиеся Collector/Prometheus/Grafana/Tempo. Redis/Celery не устанавливать.

## Этап 13A. PostgreSQL outbox и Python worker

**Источники:** `src/features/notifications/application/{outbox.service,smtp.service,alert-runner,scheduled-alerts}.ts`, integration tests, `src/worker/{notification-worker,metrics}.ts`, `ops/observability/`.

**Создать:** `backend/app/domain/ports/{outbox,email}.py`, `app/services/{outbox,scheduled_alerts}.py`, `app/repositories/{outbox,scheduled_alerts}.py`, `app/tasks/{notifications,scheduled_alerts}.py`; `tests/{unit,integration}/outbox/` и `tests/integration/test_worker_shutdown.py`.

**Интерфейсы:** `process_outbox(sender: EmailSender, uow_factory: UnitOfWorkFactory, limit: int = 50) -> ProcessingResult`; `run_scheduled_alerts(context) -> AlertResult`; worker создает собственные resources в одной event loop.

- [x] Port claiming возвращает detached dataclass payload: атомарный select/update через `FOR UPDATE SKIP LOCKED`, статус PROCESSING, claim token, lease 5 минут; claim commit до SMTP.
- [x] Сохранить 5 attempts, `availableAt`, backoff `2**attempts` минут, лимит batch 1–100, terminal failed и reclaim просроченной lease. Claim completion обновляет только свой token.
- [x] SMTP отправляется без открытой DB transaction, с timeout; send failure, DB failure after accepted SMTP, crash/restart и stale worker completion покрыты тестами. Возможность повторного письма после SMTP success/DB failure явно описана.
- [x] Scheduled alerts: сохранены hourly success interval и 5-minute retry gap; гонка закрыта PostgreSQL advisory lock на выделенном connection, который освобождается в `finally`. Конкурентные runners не запускают генерацию дважды.
- [x] Цикл 30 секунд, независимые jobs, graceful SIGTERM/SIGINT; сбой одного job не останавливает другой. Worker не запускается в FastAPI lifespan.
- [x] Manual processors `/api/notifications/smtp/process` и `/generate-alerts` используют те же Python services/locks, permission `access.users.update`; actor/request ID передаются сервисам.
- [ ] Переключение processor implementation и rollback rehearsal не выполнялись; production cutover оставлен на отдельное решение после ревью.
- [ ] Python worker service добавлен в Compose с command/healthcheck и ждёт backend readiness. Прямую зависимость от `migrate` не выставлял: Compose `migrate` использует `POSTGRES_DB=project1`, а backend/worker по умолчанию используют подготовленную копию `erp_migration_20261007`. Document volume не менялся.

**Проверки:** `uv run pytest tests/unit/outbox tests/integration/outbox tests/integration/test_worker_shutdown.py -q`; реальная PostgreSQL и локальный тестовый SMTP, два worker processes, crash/restart, terminal failure. Unit mock SMTP не заменяет transport smoke test.

**Промежуточная пауза:** пройти цепочку бизнес-запись → outbox → claim → SMTP → completion. Можно остановиться здесь до 13B.

## Этап 13B. Метрики и traces

**Создать/дополнить:** `app/core/{logging,middleware,observability}.py`, `app/integrations/observability.py` при необходимости отдельного adapter, `tests/integration/test_observability.py`, `tests/unit/test_metric_attributes.py`.

**Изменить:** `docker-compose.yml`, `ops/observability/{collector.yaml,prometheus.yml,alerts.yml}`, Grafana dashboard/provisioning и README только в необходимом объёме.

- [x] Сопоставить существующие metric names/units и Python instruments; dashboard queries проверены на live метриках. Длительности опубликованы в секундах.
- [x] HTTP count/error/latency с route template, method и status; SQL duration и pool wait; worker heartbeat/jobs; outbox pending/failed/oldest age и claim expiry; scheduled alert failure.
- [x] Настроить HTTP → service → SQL и worker spans; middleware принимает request ID/traceparent. SQL bind values и персональные поля не экспортируются.
- [x] В logs только технический context, exception messages scrubbed. Labels ограничены route template, method/status, SQL operation, job и outcome.
- [x] При отключённом Collector API и worker продолжают работать; exporter/shutdown ограничены timeout. Readiness не зависит от мониторинга.
- [x] Grafana dashboard получает live HTTP/SQL/worker metrics. HTTP error burst и heartbeat loss проверены `promtool test rules`; внешний канал уведомлений не заявлен работающим.
- [ ] Stage12 baseline не повторён; доступность исходной базы/датасета в этой проверке не установлена. Пустую Stage13 test DB не использовал для несопоставимого сравнения.

**Проверки:** полный целевой Stage13 набор, `mypy app`, Ruff; `docker compose --profile observability config --quiet`; Collector `validate`, Prometheus config/rules и `promtool test rules`; live метрики прошли Collector → Prometheus → Grafana. Подробности и ограничения — [Stage 13 validation](../../../backend-migration/stage13-validation.md).

**Готово:** фоновые сценарии и observability Python, стек мониторинга существующий. **Учебная пауза:** самостоятельно воспроизвести delayed queue и объяснить метрики, затем команда на 14.
