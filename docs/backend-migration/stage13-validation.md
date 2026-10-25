# Stage 13 validation — 24 октября 2026

## Результат

Worker/outbox и observability реализованы и проверены изолированно. Next BFF handlers ручных processors теперь направляют вызовы в Python. Production runtime cutover не выполнялся: active leases/worker и внешняя SMTP-конфигурация целевого окружения не проверялись, реальные письма не отправлялись. TypeScript worker оставлен как source rollback path; его нельзя запускать одновременно с Python scheduled-alert worker.

## Реализация

- Outbox claim атомарно выбирает записи через `FOR UPDATE SKIP LOCKED`, выдаёт claim token и 5-minute lease, затем завершает/повторяет только собственный claim. Сохранены пять попыток, `2**attempts` минут backoff, terminal failure и reclaim просроченной lease.
- SMTP вынесен за DB transaction и работает асинхронно с ограниченными timeout. Доставка остаётся at-least-once: если SMTP принял письмо, а `SENT` не сохранился, после истечения lease возможна повторная отправка.
- Scheduled alerts сохраняют hourly success interval и 5-minute retry gap. PostgreSQL advisory lock сериализует генерацию; выделенное соединение освобождается после работы.
- Python worker создаёт собственные engine/session resources и event loop, независимо запускает outbox и alerts, обрабатывает SIGTERM/SIGINT и не стартует из FastAPI lifespan.
- Compose worker настроен на `stop_grace_period: 90s`: этого достаточно для SMTP timeout до 65 секунд и последующего завершения in-flight jobs при штатном SIGTERM.
- API/worker публикуют HTTP, SQL, pool wait, heartbeat, queue, job и alert metrics/traces. Длительности измеряются в секундах; Collector очищает span attributes и exception text.

## Проверки

| Проверка | Результат |
|---|---|
| PostgreSQL `18.6-alpine`, disposable `erp_stage13_test`; Prisma применил 41 миграцию только в этой БД | Успешно; без bind/named volume |
| `uv run pytest tests/unit/outbox tests/integration/outbox tests/integration/test_worker_shutdown.py tests/integration/test_observability.py tests/unit/test_metric_attributes.py tests/unit/test_logging.py tests/unit/test_uow_observability.py tests/unit/test_worker_metrics.py tests/contracts/notifications/test_manual_processors.py -q` | `30 passed` |
| Focused Next BFF route Vitest для двух manual processors | `2 files, 4 passed`; auth denial не проксирует запрос, authorized POST передаёт user/sessionVersion/requestId в matching Python path |
| TypeScript quality checks для изменённых BFF routes | ESLint и `npx tsc --noEmit` прошли |
| Ruff check для backend app и целевых Stage13 tests | Пройдено |
| Ruff format check изменённых Stage13 Python файлов | `39 files already formatted` |
| `mypy app` | `Success: no issues found in 246 source files` |
| `docker compose --profile observability config --quiet` | Exit 0 |
| Collector `0.123.0` `validate --config=collector.yaml` | Exit 0 |
| Prometheus `3.2.1` config/rules validation | Успешно; найдено 7 правил |
| `promtool test rules` для HTTP 5xx burst и worker heartbeat loss | Оба сценария успешны |
| `docker compose -p stage13-worker-smoke build backend worker` | Оба image собраны |
| Isolated Compose run для `postgres`, `migrate`, `backend`, `worker` с явно выровненным disposable DB target | `41` Prisma migrations; PostgreSQL, backend и worker стали healthy; это не подтверждает migration-order guarantee в default config (см. gate 2); project networks/volumes удалены |
| Isolated API/worker → Collector → Prometheus | API `/live` и `/ready` — 200; Prometheus получил HTTP, SQL и worker heartbeat/outbox metrics |
| Grafana | Dashboard `erp-overview` загружен, 13 панелей; datasource proxy вернул реальную heartbeat metric |
| Выключение только временного Collector | API сохранил `/live` и `/ready` 200; worker остался запущен. OTLP exporter записал timeout/retry ошибки, job loop продолжился |
| SMTP transport smoke | Локальный тестовый SMTP принял письмо; внешнего SMTP/email не использовали |

Первый PostgreSQL integration run выявил `CASE` type mismatch для enum статуса и nullable timestamp при retry. SQL получил явные PostgreSQL casts; retry test и затем весь целевой набор прошли.

PostgreSQL тесты запускались только против `erp_stage13_test` в временном PostgreSQL 18.6 Alpine контейнере. Наблюдаемость проверялась отдельным Compose project `stage13-observability`, с временными ports и volumes. После проверок контейнеры, сеть и volumes этого проекта, API/worker smoke containers и disposable PostgreSQL удалены адресно; соседние ERP/CRM контейнеры и volumes не изменялись.

Для первоначального runtime smoke использовался Compose service graph с одной явно выровненной БД `erp_stage13_rehearsal`; на тот момент штатный файл Compose не менялся, а `migrate` и backend/worker выбирали разные БД при явном `.env.example` override. Это исторический снимок до исправления 25 октября ниже. Краткий PG18.6 image override выявил несовместимость с текущим Compose volume target `/var/lib/postgresql/data`; PG18 требует отдельный layout/upgrade. Неудачный временный project и его volumes удалены; основной Compose по-прежнему использует PostgreSQL 15.

Для повтора Stage12 baseline найденный `.runtime/migration-baseline/2026-10-07/source-backup.dump` был восстановлен только в отдельный PostgreSQL 18.6 контейнер `stage13-baseline-pg18` с read-only mount архива; Prisma довёл эту БД до 41 миграции. Получены counts `departments=10, employees=40, staff_schedule=30, salary_entries=240, finance_plan_entries=240, projects=25, tasks=196, assets=120, vacations=14, personnel_actions=10`. Они отличаются от сохранённого Stage12 baseline (`17, 0, 0, 0, 0, 14, 0, 16, 0, 0` соответственно), поэтому latency на этом dump не измерялась как сравнимый baseline. Временный контейнер удалён; исходный архив и остальные контейнеры не менялись.

## Дополнение после возврата к Stage 13 — 25 октября 2026

Локальная приёмка закрыта без подключения к production target:

| Проверка | Результат |
|---|---|
| Compose target с `.env.example` | `migrate`, backend и worker используют `postgres/project1`; backend ждёт `service_completed_successfully` от migrate, worker — `service_healthy` от backend. `docker compose --profile observability config --quiet` прошёл. Host-run `BACKEND_DATABASE_URL` оставлен отдельным. |
| Изолированный worker ownership handoff на `erp_stage13_worker_rehearsal` | Python → SIGINT/exit 0 → TypeScript → SIGINT/exit 0 → Python → SIGINT/exit 0. Процессы не работали одновременно; SMTP не настроен; после smoke outbox=0 и active claims=0. In-flight shutdown также покрыт тестом `test_shutdown_waits_for_both_in_flight_jobs`. |
| Stage 13 Python regression selection | `30 passed in 3.37s` на выделенной `erp_stage13_test`. |
| Focused Next BFF Vitest | `2 files, 4 passed`. |
| Повтор reporting baseline method | Тот же `backend/app/scripts/reporting_baseline.py`, ADMIN scope, 2026 calendar year, null filters, 10 iterations на `erp_stage11_test`: departments=15, projects=12, assets=15; dashboard 13 SQL/iteration, median 4.20 ms; turnover 2 SQL/iteration, median 0.97 ms. Stage12 saved sample был departments=17, projects=14, assets=16; latency delta несопоставим и не заявляется. |

## Оставшиеся deployment/measurement границы

1. **Production runtime cutover и rollback rehearsal не выполнялись.** Target, его active leases и SMTP не проверялись; реальные письма не отправлялись. Перед активацией нужно остановить TypeScript worker, проверить drain/rollback порядок и включить только один scheduled-alert owner. Изолированный последовательный smoke не доказывает production readiness.
2. **Сопоставимый Stage12 performance delta недоступен.** Метод измерения повторён на имеющемся изолированном dataset, но counts отличаются от сохранённой Stage12 выборки; исходное состояние не синтезировалось.
3. **Внешний alert канал не проверялся.** Prometheus rules валидированы и протестированы локально; доставка через Alertmanager/email не заявлена.

`next-env.d.ts` содержит пользовательское изменение и исключён из Stage13 коммита.
