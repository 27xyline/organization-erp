# Прогресс переноса

План создан 28 сентября 2026. Этап 00 выполнен 7 октября 2026: инвентаризация и изолированные baseline-копии готовы. Пользовательская команда перейти к этапу 01 закрыла учебную паузу этапа 00. Этап 01 реализован и проверен 8 октября 2026; теперь он ожидает разбора пользователя. Этап 02 и все последующие этапы не начаты и ждут отдельного разрешения.

| Этап | Статус | Проверки | Учебная пауза |
|---|---|---|---|
| 00 Контракты и writers | Выполнен; baseline defects записаны | Unit 308, E2E 5; DB 3/5; copy/restore verified | Закрыта командой пользователя перейти к этапу 01 |
| 01 Основа FastAPI | Выполнен; ждёт разбора пользователя | Python 25/25 на real PG; Ruff/mypy; Compose build и concurrent HTTP smoke | Ожидает разбора пользователя |
| 02 ORM и UoW | Не начат | Не запускались | Впереди |
| 03 Auth/RBAC/bridge | Не начат | Не запускались | Впереди |
| 04 Подразделения/справочники | Не начат | Не запускались | Впереди |
| 05 Кадры | Не начат | Не запускались | Впереди |
| 06 Проекты/задачи | Не начат | Не запускались | Впереди |
| 07 Имущество | Не начат | Не запускались | Впереди |
| 08 Документы | Не начат | Не запускались | Впереди |
| 09 Согласования/уведомления | Не начат | Не запускались | Впереди |
| 10 Табель/финансы | Не начат | Не запускались | Впереди |
| 11 Закупки | Не начат | Не запускались | Впереди |
| 12 Отчёты/поиск/экспорт | Не начат | Не запускались | Впереди |
| 13 Worker/observability | Не начат | Не запускались | Впереди |
| 14 Alembic/auth/полное переключение | Не начат | Не запускались | Впереди |

## Запись после этапа

Копировать этот шаблон при фактическом выполнении:

```text
Этап и дата:
Сделано, точные файлы:
Владелец API / SSR / worker:
Команды проверки и результаты:
Проверки, которые не удалось выполнить, и причина:
Изменения схемы и владельца миграций:
Rollback, который действительно проверен:
Новые решения и расхождения с планом:
Расход input/cached/output/reasoning, если доступен:
Что объяснено пользователю:
Самостоятельное упражнение:
Статус: реализация проверена / ожидает учебного разбора / требует исправления.
Явная команда пользователя на следующий этап:
```

Не записывать разрешение на продолжение заранее. Реализация этапа и завершение учебной паузы — разные события.

## Этап 00 — 7 октября 2026

- Подготовлены `docs/backend-migration/api-contracts.md/json`, `schema-inventory.md/json`, `frontend-callers.md/json`, `write-owners.md/json`, `baseline-validation.md`, README и 10 synthetic fixtures в `backend/tests/contracts/fixtures/`.
- Покрытие: 102 route-файла / 148 HTTP методов; 51 модель / 29 enums / 41 migration; 43 page/layout/section файла, 50 browser caller files, 105 writer functions/entrypoints.
- Текущий владелец API/SSR/worker/DDL — TypeScript/Next.js/Prisma. Ни один маршрут на Python не переключался.
- Проверки: lint exit0 (0 errors/93 warnings), typecheck exit0, unit 308 passed + 5 DB tests skipped; E2E 5 passed на отдельной копии.
- DB-tests на старой схеме: 5 failed; после миграций копии и serial run: 3 passed/2 failed outbox. Точная причина двух remaining failures не доказана; source/tests не исправлялись. Полные результаты и ограничения — [baseline](../../../backend-migration/baseline-validation.md).
- `project1` остаётся с исходными 38 migration records и 50 public tables; подготовлены `erp_migration_20261007`, `erp_stage00_test_20261007`, `erp_stage00_e2e_20261007`, только они получили три pending migrations. DDL owner не менялся.
- Backup/restore: logical fingerprints всех исходных таблиц совпали; после тестов повторно подтверждена неизменность `project1`. Document root скопирован: 66 files / 15 980 bytes, SHA-256 совпал; источник сохранился.
- Артефакты локально под `.runtime/migration-baseline/2026-10-07/`, credentials/backup не добавлены в документы/Git. `.env.migration` направлен на отдельную БД и копию файлов.
- Пользовательское изменение `next-env.d.ts` сохранено. Generated Next edits/cache/agent files вынесены из активного source tree. Ветки/коммиты/push не создавались. Для аудита использованы разрешённые пользователем субагенты.
- Независимый review и автоматическая сверка полноты завершены: counts/199source hashes/paths/fixture JSON проверены, замечания документации исправлены; runtime coverage ограничена указанным baseline.
- Учебный разбор: путь PATCH переименования подразделения и его общей транзакции описан в write-owners; сравнить с несколькими транзакциями procurement.
- Самостоятельное упражнение: проследить один другой route от browser caller до SQL и ответа, указать права и побочные эффекты.
- Статус на 7 октября: этап 00 выполнен, ожидал учебного разбора; позднее пользователь закрыл паузу явной командой перейти к этапу 01.

## Этап 01 — 8 октября 2026

- Созданы Python 3.13.14 backend runtime, FastAPI factory, health endpoints, error envelope, config/lifespan, DB engine/session lifecycle, request/trace context, minimal OTEL, AST import-boundary test, Dockerfile и uv lock. Next.js остаётся владельцем бизнес API/SSR/worker/Prisma DDL; Python не получил бизнес-маршрутов.
- Изменены Compose, dev overlay, `.env.example`, `.gitignore` и GitHub Actions. Python CI выделен в отдельный job с собственной PostgreSQL `erp_stage01_test`; конфигурация remote GitHub Actions не запускалась.
- Полный Python набор: 25 passed на real PostgreSQL `erp_stage01_test`. После архитектурного review regression на aliased package import воспроизведён: focused AST command дал 1 failed / 3 passed; после исправления архитектурный файл прошёл 7/7. Ruff check/format прошли на 29 файлах; mypy прошёл по 22 файлам.
- Docker image `organization-erp-backend:latest` собран. Одновременный Next 3001 / Python 8000 smoke прошёл: Next readiness 200; Python live/ready 200, `/openapi.json` 200, `/docs` и `/redoc` 404 в production. OTEL был включён без Collector: появились exporter retries/errors, но API сохранил startup и health.
- Python runtime и тесты ходили только в `erp_migration_20261007` и `erp_stage01_test`; исходная `project1` не использовалась. Ни одна миграция или схема не применялась. `erp_stage01_test` создана, потому что БД отсутствовала; после проверок остановлены только запущенные для stage01 процессы и PostgreSQL service, volume/БД сохранены.
- Stage 00 baseline остаётся прежним: два Node DB outbox failure (из 5) не исправлялись и Node DB/полный frontend suite на этапе 01 повторно не запускались.
- Пользовательская модификация `next-env.d.ts` сохранена (SHA-256 `d55d89a99f49bee7df149125eb311367460827b1d986ae98ca3129e10caa478`); SHA `tsconfig.json` также не изменился. Next-сгенерированные `AGENTS.md`/`CLAUDE.md` убраны в ignored scratch.
- Проверки и ограничения подробно записаны в [stage01-validation.md](../../../backend-migration/stage01-validation.md). История ветки включает базовый commit этапа 00, runtime commit и отдельный инфраструктурно-документационный commit этапа 01.
- Модели: implementer инфраструктуры — Luna Medium; implementer runtime и независимый reviewer — Luna High.
- Статус: реализация этапа 01 проверена, ожидает разбора пользователя. Этап 02 не начат; требуется отдельная команда пользователя.
