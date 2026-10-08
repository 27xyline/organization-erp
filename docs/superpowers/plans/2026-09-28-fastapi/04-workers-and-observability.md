# Волна 4: существующие фоновые задачи и мониторинг на Python

> Для агента: выполнить только этап 13 и остановиться. Использовать `superpowers:executing-plans`; без автоматических веток/коммитов/subagents.

**Цель:** перенести текущие worker/outbox/alerts и подключить Python к существующим метрикам и traces.

**Архитектура:** `tasks` управляет циклом, `services` — обработкой, `repositories` — claiming, `integrations` — SMTP; [spec](../../specs/2026-09-28-fastapi-backend-design.md).

**Стек:** asyncio, SQLAlchemy/asyncpg, aiosmtplib, OpenTelemetry Python; имеющиеся Collector/Prometheus/Grafana/Tempo. Redis/Celery не устанавливать.

## Этап 13A. PostgreSQL outbox и Python worker

**Источники:** `src/features/notifications/application/{outbox.service,smtp.service,alert-runner,scheduled-alerts}.ts`, integration tests, `src/worker/{notification-worker,metrics}.ts`, `ops/observability/`.

**Создать:** `backend/app/domain/ports/{outbox,email}.py`, `app/services/{outbox,scheduled_alerts}.py`, `app/repositories/{outbox,scheduled_alerts}.py`, `app/tasks/{notifications,scheduled_alerts}.py`; `tests/{unit,integration}/outbox/` и `tests/integration/test_worker_shutdown.py`.

**Интерфейсы:** `process_outbox(sender: EmailSender, uow_factory: UnitOfWorkFactory, limit: int = 50) -> ProcessingResult`; `run_scheduled_alerts(context) -> AlertResult`; worker создает собственные resources в одной event loop.

- [ ] Port claiming возвращает detached dataclass payload: атомарный select/update через `FOR UPDATE SKIP LOCKED`, статус PROCESSING, claim token, lease 5 минут; claim commit до SMTP.
- [ ] Сохранить 5 attempts, `availableAt`, backoff `2**attempts` минут, лимит batch 1–100, terminal failed и reclaim просроченной lease. Claim completion обновляет только свой token.
- [ ] SMTP отправляется без открытой DB transaction, с timeout; send failure, DB failure after accepted SMTP, crash before send и stale worker completion покрыты тестами. Возможность повторного письма после SMTP success/DB failure явно описана.
- [ ] Scheduled alerts: сохранить hourly success interval и 5-minute retry gap. Исправить check-then-upsert гонку атомарным PG advisory-lock/row-lock протоколом; для advisory lock выделенный connection держится только на время генерации и освобождается в finally. Тест с двумя workers не создаёт дублей alert events.
- [ ] Цикл 30 секунд, независимые jobs, graceful SIGTERM/SIGINT; ошибка SMTP не останавливает alerts. Не запускать worker в FastAPI lifespan каждого API process.
- [ ] Manual processors `/api/notifications/smtp/process` и `/generate-alerts` используют тот же Python service и locks, с прежними permissions. Request actor/request ID сохраняются.
- [ ] Переключение: остановить TS worker, дать завершить текущую работу, проверить active leases, включить Python worker. При rollback сначала остановить Python. Одновременно один выбранный processor implementation; несколько Python replicas допускаются после concurrency тестов.
- [ ] Добавить Python worker service в Compose со своим command, health/heartbeat, зависимостью от migrations; не менять document volume.

**Проверки:** `uv run pytest tests/unit/outbox tests/integration/outbox tests/integration/test_worker_shutdown.py -q`; реальная PostgreSQL и локальный тестовый SMTP, два worker processes, crash/restart, terminal failure. Unit mock SMTP не заменяет transport smoke test.

**Промежуточная пауза:** пройти цепочку бизнес-запись → outbox → claim → SMTP → completion. Можно остановиться здесь до 13B.

## Этап 13B. Метрики и traces

**Создать/дополнить:** `app/core/{logging,middleware,observability}.py`, `app/integrations/observability.py` при необходимости отдельного adapter, `tests/integration/test_observability.py`, `tests/unit/test_metric_attributes.py`.

**Изменить:** `docker-compose.yml`, `ops/observability/{collector.yaml,prometheus.yml,alerts.yml}`, Grafana dashboard/provisioning и README только в необходимом объёме.

- [ ] Сопоставить существующие metric names/units и Python instruments; сохранить dashboard queries либо явно обновить их с проверкой. Не смешать секунды и миллисекунды.
- [ ] HTTP count/error/latency с route template, method и status; SQL query duration и pool wait; worker heartbeat/success/failure; outbox pending/failed/oldest age, claim expiry; scheduled alert failure.
- [ ] Настроить HTTP → service → SQL и worker spans; перенести request ID/traceparent через BFF. SQL bind values и персональные поля не пишутся в exporter/logs.
- [ ] В logs только технический context, scrub exception messages. Проверить labels: нет raw URL, user/employee IDs, email, password и бесконечной кардинальности.
- [ ] Collector выключен: API, worker, SMTP продолжают работу; exporter timeout/shutdown ограничены. Readiness не зависит от мониторинга.
- [ ] Dashboard получает реальные метрики после нескольких запросов и outbox processing. Проверить error burst и heartbeat loss alert на стенде; внешний канал уведомлений не заявлять работающим без отдельного теста.
- [ ] Повторить одинаковый baseline workload из 12; записать latency/SQL count/dataset/environment. Ускорение без измерения не заявлять.

**Проверки:** `uv run pytest tests/integration/test_observability.py tests/unit/test_metric_attributes.py -q`; `docker compose --profile observability config --quiet`; существующие Collector/promtool validation commands из `ops/observability/README.md`; HTTP/SQL spans и dashboard видны; Collector outage проверен.

**Готово:** фоновые сценарии и observability Python, стек мониторинга существующий. **Учебная пауза:** самостоятельно воспроизвести delayed queue и объяснить метрики, затем команда на 14.
