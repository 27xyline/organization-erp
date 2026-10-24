# Stage 13 validation — 24 октября 2026

## Результат

Worker/outbox и observability реализованы и проверены изолированно. Production cutover не выполнялся: TS processors не переключались на Python, реальные письма не отправлялись.

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
| Ruff check для backend app и целевых Stage13 tests | Пройдено |
| Ruff format check изменённых Stage13 Python файлов | `39 files already formatted` |
| `mypy app` | `Success: no issues found in 246 source files` |
| `docker compose --profile observability config --quiet` | Exit 0 |
| Collector `0.123.0` `validate --config=collector.yaml` | Exit 0 |
| Prometheus `3.2.1` config/rules validation | Успешно; найдено 7 правил |
| `promtool test rules` для HTTP 5xx burst и worker heartbeat loss | Оба сценария успешны |
| `docker compose -p stage13-worker-smoke build backend worker` | Оба image собраны |
| Isolated API/worker → Collector → Prometheus | API `/live` и `/ready` — 200; Prometheus получил HTTP, SQL и worker heartbeat/outbox metrics |
| Grafana | Dashboard `erp-overview` загружен, 13 панелей; datasource proxy вернул реальную heartbeat metric |
| Выключение только временного Collector | API сохранил `/live` и `/ready` 200; worker остался запущен. OTLP exporter записал timeout/retry ошибки, job loop продолжился |
| SMTP transport smoke | Локальный тестовый SMTP принял письмо; внешнего SMTP/email не использовали |

Первый PostgreSQL integration run выявил `CASE` type mismatch для enum статуса и nullable timestamp при retry. SQL получил явные PostgreSQL casts; retry test и затем весь целевой набор прошли.

PostgreSQL тесты запускались только против `erp_stage13_test` в временном PostgreSQL 18.6 Alpine контейнере. Наблюдаемость проверялась отдельным Compose project `stage13-observability`, с временными ports и volumes. После проверок контейнеры, сеть и volumes этого проекта, API/worker smoke containers и disposable PostgreSQL удалены адресно; соседние ERP/CRM контейнеры и volumes не изменялись.

## Открытые gates

1. **Production cutover не выполнялся.** TS worker/processors не останавливались и не переключались; реальные письма не отправлялись. Перед переключением нужно подтвердить активные leases, SMTP, выбранный processor и rollback порядок.
2. **Compose migration ordering требует отдельного решения.** Текущий Compose `migrate` направлен на `POSTGRES_DB` (по умолчанию `project1`), а backend/worker по умолчанию используют подготовленную копию `erp_migration_20261007`. Worker ждёт backend readiness, но прямую зависимость от `migrate` не добавлял, потому что тот применяет миграции к другой БД. Stage14 migration work должен определить единый безопасный target.
3. **Stage12 reporting baseline не повторён.** Доступность исходной БД/датасета в этой проверке не установлена. Stage13 smoke DB была пустой до тестов; её latency несопоставима с сохранённым baseline. Ускорение не заявляется.
4. **Внешний alert канал не проверялся.** Prometheus rules валидированы и протестированы локально; доставка через Alertmanager/email не заявлена.

`next-env.d.ts` содержит пользовательское изменение и исключён из Stage13 коммита.
