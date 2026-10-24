# Stage 14C: rehearsal переключения

Статус: **runtime rehearsal выполнена в disposable окружении; полный acceptance ожидает решения по оставшимся gates**. Полный Playwright и restart verification прошли; backend pytest оставляет один architecture guard failure. Документ не разрешает production cutover.

## Изоляция и baseline

Использовать только Compose project `org-erp-stage14c-rehearsal-20261024`, БД `erp_stage14c_e2e` на опубликованном `127.0.0.1:55442`, приложение `127.0.0.1:3301` и отдельный disposable document volume. Не подключать `project1` и не монтировать внешние volumes. PostgreSQL image — `postgres:18.6-alpine`; PG18 volume target — `/var/lib/postgresql`.

Перед восстановлением сохранить fingerprint БД (версию PostgreSQL, `alembic_version`, число `_prisma_migrations`, row count каждой таблицы, ключевые FK-связи, агрегаты payroll/procurement/assets, audit и outbox) и document volume (relative path, size, SHA-256 каждого файла, totals). Сохранить JSON до/после вне volume данных. Источник файлов Stage00 проверен по ключам, размеру и SHA: **66/66**, 15 980 байт, изменений/пропусков/лишних файлов нет. Это не доказывает соответствие БД снимку: исходный dump датирован 7 октября и его counts отличаются от поздних Stage12 baseline.

```sh
docker compose -p org-erp-stage14c-rehearsal-20261024 ps
# Загрузить локальный disposable env: DATABASE_URL и STAGE14C_E2E_DATABASE_URL
# должны вести в одну и ту же БД erp_stage14c_e2e. Не выводить env в терминал.
set -a
source /path/to/rehearsal.env
set +a
export PLAYWRIGHT_BASE_URL='http://127.0.0.1:3301'
npx playwright test --config=playwright.stage14c.config.ts
```

Подставить секрет из локального disposable Compose env; не копировать пароль в отчёт. Config откажется работать, если URL ведут не в `erp_stage14c_e2e`. Перед первым запуском проверить, что storage указывает только в `.runtime/stage14c/e2e`.

## Фактические результаты rehearsal

- Maintenance fence вернул 503 `MAINTENANCE` для unsafe POST, readiness GET продолжал отвечать 200.
- Активных DB sessions и outbox claims перед migration не было. `migrate` запущен один раз; schema verifier завершился сообщением `Schema catalog matches the configured expected catalog.`
- App/backend/worker использовали одну disposable БД. После переключения Stage06/07/08/09/10/12/14B и Stage14C Playwright suite прошёл: **8 passed, 1 skipped** до рестарта.
- После рестарта app/backend/worker persisted-state Playwright прошёл: **1 passed**. `verify_data` вернул нулевые значения для всех проверок.
- Между counts до/после рестарта изменились только `user_sessions` +1 (verify-only login) и `audit_logs` +1 (контрольный `DOCUMENT_DOWNLOADED`); все остальные 52 table counts совпали. Document manifest: **74/74 файлов**, 16 344 байта, SHA-256 совпадает.
- Prometheus `otel-collector` target был `up`; `up` query вернула 1; Grafana health вернул `database: ok`.

## Окно переключения

1. Включить maintenance mode для пользователей и запретить новые unsafe requests на ingress. Не принимать утверждение «maintenance» по одной переменной: проверить реальным 503/maintenance response на write route.
2. Дождаться завершения активных HTTP requests и проверить worker queues/leases. Остановить TS и Python processors до выбора одного владельца; нельзя запускать оба notification scheduler одновременно.
3. Проверить восстановленную disposable БД и document volume. Запустить Alembic migration job один раз, дождаться успешного `upgrade head`; сверить revision, миграционный history и ограничения. Prisma DDL не запускать.
4. Включить Next BFF → FastAPI transport и Python backend/session. Проверить `/api/health/ready`, login, SSR `/api/account/me`, CSRF для unsafe methods. Пользователи с NextAuth cookie выполняют новый вход: cookie Python session несовместима.
5. Снять fingerprint до сценария. Запустить сценарии по одному тестовому пользователю; записать ID искусственных записей.
6. Проверить полную последовательность: employee → project → task → procurement → approval → contract/delivery → capitalization asset → attached document; затем time entry → employee timesheet submit → approver decision → payroll export → payroll period close. Проверить scoped access, admin access, search/report exports и in-app notifications. Не отправлять внешнюю почту: SMTP должен быть локальным sink/отключённым.
7. Перезапустить app/backend/worker из того же disposable Compose project, не удаляя volume. При загруженном disposable env запустить только persisted-state check: `STAGE14C_VERIFY_ONLY=1 npx playwright test --config=playwright.stage14c.config.ts --grep "Stage 14C persistence survives"`; проверить IDs, статусы, payroll close и ETag/SHA-256 скачанного документа. Выполнить `docker exec <rehearsal-backend> python -m app.scripts.verify_data`, чтобы проверка использовала DB и `DOCUMENT_STORAGE_ROOT` контейнера; повторно снять fingerprints/aggregates/audit/outbox/document hashes.
8. Сравнить до/после структурно: учесть только известные синтетические записи и audit/outbox события. Любая неожиданная разница, потерянная связь или не совпадающий файл блокирует acceptance.

Полный pytest, frontend lint/typecheck/build и Compose/metrics validation выполнены отдельно от окна переключения. Последний полный pytest: **477 passed, 1 failed** — architecture guard на 17 зависимостей из `services.*`; Stage14C acceptance из-за этого gate пока pending. Целевые три Stage10 finance tests после очистки только `erp_stage10_test` прошли. Lint/typecheck/build, полный Playwright, Compose/metrics и data verifier прошли.

## Критерий завершения

Фактические выводы Compose, миграции, сценария до/после рестарта, DB/file fingerprint и DB/document restore записаны в [acceptance-report.md](acceptance-report.md) и [rollback-runbook.md](rollback-runbook.md). Architecture guard остаётся красным, а route rollback не переключался; пока эти ограничения не рассмотрены, этап остаётся pending. Этот документ не разрешает переключать production.
