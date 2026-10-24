# Прогресс переноса

План создан 28 сентября 2026. Этап 00 выполнен 7 октября 2026: инвентаризация и изолированные baseline-копии готовы. Пользовательские команды закрыли учебные паузы этапов 00–05 по мере продолжения работ; Stage 05 завершён и проверен 15 октября 2026. Stage 06 реализован и проверен 15 октября 2026; пользователь закрыл его паузу 16 октября, самостоятельное упражнение остаётся учебной задачей. Stage 07 реализован и прошёл локальные проверки 16 октября 2026; пользовательской командой перейти к Stage 08 его учебная пауза закрыта. Stage 08 реализован, прошёл code/spec review и все отложенные Docker integration gates 23 октября 2026. Stage 09 реализован и проверен 23 октября 2026; реальное SMTP подключение осталось внешней непроверенной интеграцией. Stage 10 полностью реализован и проверен 24 октября 2026. Stage 11 реализован и прошёл плановый backend-набор 24 октября 2026; review finding по scope МОЛ исправлен и покрыт integration-тестом; полный browser-level цикл закупки не запускался. Stage 14A выполнен 24 октября 2026 и остановлен на обязательной пользовательской паузе перед 14B; по запросу пользователя Stage 13 будет завершён после этапа 14.

| Этап | Статус | Проверки | Учебная пауза |
|---|---|---|---|
| 00 Контракты и writers | Выполнен; baseline defects записаны | Unit 308, E2E 5; DB 3/5; copy/restore verified | Закрыта командой пользователя перейти к этапу 01 |
| 01 Основа FastAPI | Выполнен; учебная пауза закрыта командой пользователя продолжить | Python 25/25 на real PG; Ruff/mypy; Compose build и concurrent HTTP smoke | Закрыта командой пользователя продолжить работу |
| 02 ORM и UoW | Реализован и проверен | Python 40/40 на real PG; Ruff check/format; mypy; read-only metadata comparison без diff | Закрыта явной авторизацией пользователя продолжить на этап 03 от 10 октября |
| 03 Auth/RBAC/bridge | Реализован и проверен | Python 71; Vitest 313 passed/5 skipped; E2E 6/6; Webpack build; Docker readiness 200 | Закрыта явной авторизацией пользователя на Stage 04 от 10 октября |
| 04 Подразделения/справочники | Реализован и проверен | Python 95; Vitest 309 passed/5 skipped; Playwright 7/7; typecheck/ESLint; Webpack build; Docker app/backend readiness 200; legacy parity 9 audit events | Закрыта командой пользователя 13 октября 2026 |
| 05 Кадровые процессы | Реализован и проверен | Python 154; Vitest 294 passed/5 skipped; Playwright 8/8; typecheck/ESLint; Webpack build 48 pages; Docker app/backend build и readiness 200 на `erp_stage05_e2e`; 8 audit events, outbox 0 | Закрыта пользовательской командой продолжить работу 15 октября 2026 |
| 06 Проекты/задачи | Реализован и проверен | Python 173; Vitest 284 passed/5 skipped; Playwright 9/9; typecheck; changed-file ESLint 0 errors; Webpack и Docker app/backend build; app/backend readiness 200; 8 parity audit payloads; Stage06 outbox 0 | Закрыта 16 октября командой продолжить; deadline exercise не реализовано |
| 07 Имущество | Реализован и проверен | Python 215; golden replay 5 + affected replay 1; Vitest 273/5 skipped; Playwright 10/10; typecheck/changed-file ESLint; Docker builds и live/ready 200; parity | Закрыта командой пользователя перейти к Stage 08; exercise на две передачи не реализовано |
| 08 Документы | Реализован; code/spec review clean; Docker integration gates пройдены | Python 279; Vitest 273 passed/5 skipped; focused fix 9/9; Playwright 11/11 + docs-only 1/1; typecheck/ESLint; host Webpack и app/backend Docker builds; readiness 200; authenticated BFF 200; cross-image volume smoke под uid 1001 | Реализация готова; ждёт разбора пользователя |
| 09 Согласования/уведомления | Реализован и проверен | Python 13; PostgreSQL integration 9; Playwright 1; typecheck/ESLint; Vitest 6; Ruff/mypy | Учебная пауза впереди |
| 10 Табель/финансы | Реализован и проверен; acceptance пункты отмечены; HR master data для исторических расчётов остаются текущими по legacy-семантике | PostgreSQL 18.6 Stage10 acceptance 54; browser workflow 1; export, BFF, typecheck/ESLint, Ruff/mypy | Впереди |
| 11 Закупки | Реализован и проверен; полный browser-level цикл закупки не запускался | PostgreSQL 18.6 procurement suite 13; procurement Vitest 6; typecheck; Ruff/mypy; independent code review scope issue fixed | Впереди |
| 12 Отчёты/поиск/экспорт | Реализован и принят на изолированной БД | Backend `21 passed`; CLI `4 passed`; idempotent seed + verify; Playwright `1 passed`; Ruff/mypy/typecheck/ESLint | Впереди |
| 13 Worker/observability | Реализован и проверен изолированно; manual processor BFF направляет в Python; production runtime cutover и сопоставимый baseline не выполнены | Python `30 passed`; focused Vitest `4 passed`; Ruff/format/mypy/ESLint/typecheck; PostgreSQL 18.6 outbox concurrency + crash/restart; isolated Compose PG15 smoke: 41 migrations, backend/worker healthy; local SMTP; live metrics в Grafana; Collector outage; Prometheus alerts `2 passed` | Код готов к ревью; runtime cutover ждёт target DB/SMTP и rollback rehearsal |
| 14 Alembic/auth/полное переключение | 14A выполнен; пауза на ревью перед 14B | PostgreSQL 15 rehearsal: empty upgrade + seed + verify; existing restore + legacy verify/stamp/upgrade; catalog checks; `alembic check`; migration integration 6/6 на обоих disposable targets | Требуется ревью ownership DDL и migration/stamp перед 14B |

## Запись Stage 08 — 23 октября 2026

- Документы BFF, SSR и project workspace переведены на FastAPI; TypeScript runtime document writer/service удалены. Ownership и обязательные исключения перечислены в [Stage 08 ownership](../../../backend-migration/stage08-ownership.md); verification и runtime ограничения — в [Stage 08 validation](../../../backend-migration/stage08-validation.md).
- Проверки: backend Python `279 passed`; Vitest `273 passed, 5 skipped`; Stage08 review fixes `9 passed`; Playwright `11 passed` плюс documents-only rerun `1 passed`; typecheck, changed-file ESLint и локальная Next Webpack production build прошли. Коммиты: backend `332ee33`, BFF/docs `6aca5d6`.
- Docker: штатные app runner и backend images собраны без Dockerfile/lockfile изменений; повторный app build прошёл после прежнего сетевого `ECONNRESET`. App/backend readiness — `200`, credentials login и authenticated documents BFF через backend bridge — `200`. App и backend с UID/GID 1001 проверили двустороннюю запись/чтение в новом shared volume; тестовые файлы удалены. Использована только выделенная `erp_stage08_e2e`, без миграций, worker, observability и настоящего document volume. Подробности — [Stage 08 validation](../../../backend-migration/stage08-validation.md). Stage 09 завершён; см. запись ниже.

## Запись Stage 06 — 15 октября 2026

- Проектные и task API/SSR перенесены на FastAPI с browser BFF, workspace/activity read API и project references. Документы продолжают читать через отдельно авторизованные TS endpoints до Stage 08; project payroll остаётся TS до Stage 10. Полная ownership-матрица и validation evidence: [Stage 06 ownership](../../../backend-migration/stage06-ownership.md), [Stage 06 validation](../../../backend-migration/stage06-validation.md).
- Финальная локальная проверка: Python `173 passed`; Vitest `284 passed, 5 skipped`; Playwright `9 passed`; typecheck passed; changed-file ESLint `0 errors`; Webpack Next build passed; app/backend Docker runner images собраны и оба readiness endpoint вернули `200`. Remote CI не запускался.
- Legacy workflow parity сравнила нормализованные DTO, state и все 8 audit payloads; outbox остался пуст. Зафиксированы ограничения/решения: malformed nonempty project/task dates сохраняют legacy HTTP 500, duplicate project code POST=409/PUT=500, member mutation не создаёт audit/outbox. См. отчёт и ledger.
- Операционный incident: по ошибке был кратковременно запущен default Dockerfile target (notification worker) на изолированной `erp_stage06_e2e`; stdout говорит `SMTP settings not configured, skipping outbox processing`. Контейнер немедленно остановлен/удалён; последующая read-only проверка подтвердила outbox total=0 (pending/processing/sent/failed=0). Полный факт и ограничения указаны в validation report.
- База создавалась как template-copy `erp_migration_20261007` с локальной очисткой только изолированных Stage06 копий; это не `pg_dump --schema-only`. Источники и миграции не использовались как targets. Docker smoke storage был отдельным writable volume.
- Коммит API: `827fa102160ee5f58fdca0075d330830c0b3a3d8` — «Перенести проекты и задачи на FastAPI». Frontend/BFF и Stage06 отчёты входят в отдельный завершающий коммит этого этапа; push и удалённые CI проверки не выполнялись. Stage 07 остаётся не начатым.

## Запись Stage 07 — 16 октября 2026

- Browser asset API и SSR callers переключены на typed FastAPI bridge; маршруты сохраняют публичные URL, auth/Origin/Zod/resource prechecks и не имеют TS fallback. Ownership и оставшееся исключение закупочной капитализации описаны в [Stage 07 ownership](../../../backend-migration/stage07-ownership.md).
- Legacy baseline изолированно capture-нут: 46 вызовов и 14 audit payloads. Golden replay подтвердил 31 success DTO shape, 42 HTTP status assertions, оба binary header contracts, persisted state, все 14 audit payloads и outbox delta 0; два legacy XLSX 500 исправлены на рабочий Python export. Подробности и ограничения — [Stage 07 validation](../../../backend-migration/stage07-validation.md).
- Проверки: Python 215 passed; replay 5 passed плюс затронутый строгий replay после test-only assertions 1 passed; Ruff, format 196 files, mypy 130 modules и uv lock check passed; Vitest 273 passed / 5 skipped; typecheck и changed-file ESLint passed; Playwright 10/10; host Webpack build 48 pages до последнего date helper и финальный app Docker runner build после него; backend image собран. Оба runtime на общей `erp_stage07_e2e` вернули live/ready 200, app-to-backend live — 200, documents volume writable для uid 1001. Полный репозиторий ESLint и remote CI не заявляются как проверенные.
- Первичная zero-row cleanup запись оказалась false green: template copies содержали seed rows. Копии создавались PostgreSQL template-copy из `erp_migration_20261007` (не `pg_dump --schema-only`); строки удалены только в приватных Stage07 БД, затем проверены 52 таблицы/0 строк. Источники не были write targets. Финальные smoke containers/network/volume удалены, PostgreSQL оставлен запущенным. Protected `next-env.d.ts` и `tsconfig.json` подтверждены по ожидаемым SHA. Remote CI не запускался.
- Stage 07 локально проверен и ожидает учебного разбора пользователя. Обязательный regression на конкурентное двойное списание уже проходит на двух соединениях; предлагаемое самостоятельное exercise, которое не реализовано в этом этапе: написать regression на две одновременные передачи одного остатка разным МОЛ и сравнить optimistic/pessimistic/serializable защиту. Stage 08 не начат.
- Backend commit: `3d83bef7a90a207469cf17dd11df42f9a7839899` (52 files); BFF/SSR/CI/docs оформлены завершающим коммитом Stage 07. Push не выполнялся.

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

## Этап 02 — 8 октября 2026

- Описаны все 51 SQLAlchemy модели и registry; metadata/catalog совпали: 51 таблица, 512 колонок, 29 enums, 132 индекса, 90 FK и 53 CHECK constraints. Prisma остаётся владельцем DDL до этапа 14.
- Добавлены framework-independent audit/notification ports, SQLAlchemy UoW и FastAPI factory wiring. Одна UoW владеет одной сессией; commit явный и terminal, выход без commit/ошибка/отмена откатывают; вложенная операция принимает тот же UoW; конкурентные UoW используют отдельные сессии. Бизнес-сервисы и delivery worker не переносились.
- Проверки: 40 pytest passed на PostgreSQL, Ruff check/format и mypy прошли. Read-only Alembic comparison сообщил `No schema differences detected`; цикл FK отдельно покрыт catalog test. Итоговые логи — `.runtime/stage02/final-checks.log`, санитизированная БД-сверка — `.runtime/stage02/post-verification.json` (оба ignored).
- Схемы после тестов: исходная `project1` осталась с 38 миграциями / 50 таблицами; `erp_migration_20261007` — 41 / 52; `erp_stage02_test` — schema-only restore, 0 migration rows / 52 таблицы. `alembic_version` отсутствует во всех трёх; тестовые записи откатились.
- Встроенная команда `alembic check` ранее создала пустую version table в тестовой БД; её удалили. Финальная сверка выполнялась read-only. `env.py` guard не перехватывает обычный `alembic revision` без autogenerate; по политике этапа revision generation не запускался. SQL trigger/function bodies остаются вне metadata comparison.
- Изменения этапа 02 описаны в [stage02-validation.md](../../../backend-migration/stage02-validation.md). Next.js/Prisma по-прежнему владеют API/SSR/worker и DDL; этап 03 не начат.
- Статус: реализация этапа 02 проверена; пользователь явно авторизовал переход к этапу 03 10 октября 2026.

## Этап 03 — 10 октября 2026

- Python владеет credentials verification, user/role/scope/password mutations, проверкой actor/permissions на перенесённых API и атомарными audit/notification-intent writes. NextAuth сохраняет browser session lifecycle; переходный TS `requireUser()` остаётся read-only Prisma actor/scope check для неперенесённых модулей и отвергает неактивные/stale `sessionVersion`. Остальные business API, SSR, delivery worker и Prisma DDL не переносились. Детали owners — [stage03-ownership.md](../../../backend-migration/stage03-ownership.md).
- Next.js user/password URLs работают как BFF к Python: `GET/POST /api/users`, `PATCH /api/users/{id}`, `POST /api/account/password`; SSR использует Python `GET /api/users` и `GET /api/users/references`. Bridge JWT — HS256, `iss=erp-next`, `aud=erp-python`, sessionVersion и TTL 60s; bearer secret credentials endpoint отдельный. Backend outage, timeout или отсутствующие auth secrets не включают Prisma fallback.
- Перенос mutations намеренно усиливает отзыв сессий: изменения ролей/scopes, employee link или active status обновляют `sessionVersion`, и старый JWE отклоняется. Оригинальная TS session/version read guard остаётся для старых бизнес routes; Python internal actor endpoint не объявлен владельцем всех legacy API.
- Проверки: 71 pytest на PostgreSQL; Ruff check/format и mypy; Vitest 313 passed/5 skipped; focused auth/BFF 10 passed; typecheck и ESLint changed files; Playwright 6/6 на общей тестовой БД, включая forced password change и stale JWE; production Webpack build; Docker images сборка и shared-DB readiness 200 для обоих runtime. Host Turbopack build имел sandbox `EPERM` на PostCSS subprocess; Docker Turbopack build прошёл. Подробности и runbook: [stage03-validation.md](../../../backend-migration/stage03-validation.md).
- Исходный `project1` не использовался как target и DDL не менялся. `erp_stage03_test` и `erp_stage03_e2e` — schema-only копии из 52-табличной `erp_migration_20261007`; auth-тесты не отправляли реальные внешние сообщения. Послетестовая cleanup-проверка Python подтвердила ноль строк в семи проверенных таблицах `erp_stage03_test`.
- CI workflow расширен изолированными backend/e2e базами, но remote GitHub Actions не запускался. В локальном npm audit при сборке обнаружены 26 уязвимостей полного дерева (1 low, 5 moderate, 19 high, 1 critical) и 7 production dependency findings (2 moderate, 4 high, 1 critical); они не исправлялись в этом этапе.
- Пользовательский `next-env.d.ts` сохранён с SHA-256 `d55d89a99f49bee7df149125eb311367460827b1d986ae98ca312c9e10caa478`; `tsconfig.json` не менялся. Private env/logs и generated files не добавлены в Git. История этапа содержит Python commit и отдельный BFF/ops/docs commit; push не выполнялся.
- Модели: Python auth/RBAC implementer — Sol Medium; BFF/operations implementer — Luna High; independent reviewer — Luna High. Review не обнаружил actionable security/spec дефектов.
- Статус на момент закрытия этапа 03: реализация проверена; переход к Stage 04 позднее был отдельно авторизован пользователем 10 октября 2026 года.

## Этап 04 — 10 октября 2026

- Browser API `/api/departments*`, `/api/groups*`, `/api/mols*` и SSR-данные страниц подразделений, групп и МОЛ переведены на Python через существующий Stage 03 bridge. Next.js сохраняет URL, публичные envelopes/statuses, session/Origin/forced-password и permission prechecks; backend повторно проверяет actor, права и scopes. Prisma fallback-записи отключены для этих API. Остальные Prisma readers остались для неперенесённых модулей.
- Python владеет department/group/MOL CRUD, scopes и audit в UoW. Department rename сохраняет три legacy denormalized обновления (`Employee.department`, `StaffSchedule.department`, `Mol.department`). Employee CRUD остаётся TS; `clearEmployeeDepartmentLeadership` также остаётся TS под общей блокировкой до Stage 05. Demo seed остаётся отдельным gated bootstrap writer. Актуальное распределение владельцев — [stage04-ownership.md](../../../backend-migration/stage04-ownership.md); исторический Stage 00 writer snapshot не изменялся.
- Legacy TypeScript из `3850217` действительно выполнен на изолированной `erp_stage04_legacy`; normalized результат закреплён fixture. Python сравнил ответы, ошибки, side effects и девять audit events с fixture. Очистка legacy capture подтвердила ноль записей в проверенных business/audit таблицах.
- Проверки: полный Python `95 passed`, Ruff check/format и mypy; полный Vitest `309 passed, 5 skipped`; TypeScript typecheck и changed-file ESLint; полный Playwright `7/7`; Next.js Webpack build; Docker Compose build обоих образов и health readiness `200` у обоих smoke-контейнеров. [Отчёт Stage 04](../../../backend-migration/stage04-validation.md) содержит изоляцию БД, parity scope и восстановленный SHA пользовательского `next-env.d.ts`.
- Статус: реализация Stage 04 проверена и учебная пауза закрыта командой пользователя 13 октября. Самостоятельное упражнение: добавить тестируемый фильтр списка подразделений по `parentId`.

## Этап 05 — 13–15 октября 2026

- Перенесены employee/profile/skills/certificates, personnel actions и scoped sync, vacations/sick leave, staff schedule, dashboard/profile SSR calls и совместимые employee references. Browser API сохраняет URL/method/session/Origin/Zod/permission checks; Next.js bridge передаёт вызов FastAPI без Prisma fallback. DDL и миграции остались у Prisma; финансовый расчёт, project mutations и worker не переключались.
- Поведение сверено с legacy baseline `9b4920e`. Сохранены прежние HR salary fields без нового требования `finance.salary.read`; overlap отпусков и включительные границы сохранены; legacy nullable/date/status mappings покрыты тестами. Кадровые workflows создают только предусмотренные audit events, без новых outbox notifications. Sync получил scoped-доступ под общим organization lock для защиты от дублей. Отдельный payroll lock не применим, поскольку эти HR routes не записывают payroll periods.
- Проверки 13 октября: Python `154 passed`, Ruff check/format и mypy; Vitest `294 passed, 5 skipped`; focused BFF `16 passed`; typecheck/ESLint; Playwright `8/8`; Webpack production build, 48 static pages. Remote GitHub Actions не запускался. Подробности в [отчёте Stage 05](../../../backend-migration/stage05-validation.md).
- Docker app/backend images собраны 15 октября; оба readiness endpoint и backend через app network вернули `200` на `erp_stage05_e2e`. Первый app smoke ответил `503`, потому что приватный smoke env не содержал `DOCUMENT_STORAGE_ROOT`; после добавления Compose-эквивалентного пути `/var/lib/project1/documents` повторная проверка прошла. Исходный код не менялся. Временные Stage 05 containers, включая оставленные после остановки работы 13 октября, и отдельная smoke network удалены; PostgreSQL продолжает работать.
- Проверка cleanup после Python suite подтвердила 0 строк во всех 19 проверенных business/auth/audit/outbox tables `erp_stage05_test`. Источник `project1` и `erp_migration_20261007` не были целями записи; миграции, worker и реальные email не запускались. Личные `next-env.d.ts` и `tsconfig.json` сохранены.
- Коммиты: Python — `623dde7 Перенести кадровые процессы на FastAPI`; BFF/SSR/CI/docs оформлены отдельным русским коммитом Stage 05. Push не выполнялся.

## Этап 09 — 23 октября 2026

- FastAPI владеет согласованиями (templates/create/list/detail/options/decision/cancel), in-app notifications/preferences и SMTP settings/test. Next сохраняет permission и Zod prechecks как BFF; SSR approval detail/notifications переведён на backend bridge. Prisma DDL не менялся.
- Approval create/decision/cancel связывают Document status/lockVersion, audit и notification intent одним UoW. Валидация неизвестной entity не допускает dangling link; PostgreSQL `FOR UPDATE` сериализует параллельные decisions. SMTP пароль остаётся совместимой строкой singleton settings и не возвращается API; SMTP probe выполняется вне DB transaction.
- TS сохраняет ручные `/api/notifications/smtp/process` и `/api/notifications/generate-alerts` до Stage 13. Ownership описан в [stage09-ownership.md](../../../backend-migration/stage09-ownership.md), исключения отражены в coverage registry.
- TDD: route regression сначала RED (`1 failed` из-за отсутствующего Python route), после регистрации и реализации GREEN (`1 passed`). Финальный Python Stage09 suite — `13 passed`; targeted approval/notification PostgreSQL integration — `9 passed`; Playwright approval/notification сценарий на `erp_stage09_e2e` — `1 passed`. Ruff, targeted mypy, Next typecheck, ESLint и route Vitest прошли.
- Проверенные DB targets только `erp_stage09_test` и `erp_stage09_e2e`, копии read-only template `erp_migration_20261007`; после очистки Stage09 test fixtures и E2E workflow rows не осталось. `project1`/Stage08 DB не использовались; migrations и реальные SMTP/email не запускались.
- Пост-аудитный architecture follow-up: запрещённые infrastructure imports удалены из Stage09 services, SMTP settings подключены через domain port/repository/UoW, сохранение секрета и out-of-transaction probe закреплены. Architecture + SMTP/approval unit tests — `11 passed`; Ruff прошёл; общий mypy backend — `160 source files, no issues`. PostgreSQL integrations после рефакторинга не повторялись: isolated Stage09 DB URL не был задан.
- Отчёт и полный список путей/команд/ограничений — [stage09-report.md](../../../.superpowers/sdd/03-workflows-and-reports/stage09-report.md). `next-env.d.ts` оставлен user-owned и исключён из commits. Этапы 10 и 13 не начинались.

## Этап 13 — 24 октября 2026

- Notification outbox и scheduled alerts перенесены в Python worker: `FOR UPDATE SKIP LOCKED`, claim leases/retry/reclaim, PostgreSQL advisory lock, async SMTP, независимые jobs и graceful shutdown. HTTP/SQL/worker metrics и traces подключены к существующему Collector/Prometheus/Grafana.
- Финальный целевой набор — `30 passed`; Ruff check/format и mypy по 246 модулям прошли. Backend/worker images собраны; isolated smoke показал live HTTP/SQL/worker metrics в Grafana и доступность API/worker при выключенном Collector. Проверки не отправляли реальные письма.
- Next BFF manual processor routes переключены на Python и проверены (4 focused Vitest). Production runtime cutover и остановка TS worker не выполнялись.
- Worker Compose service получил `stop_grace_period: 90s`, чтобы покрыть 65-секундный SMTP timeout и завершение in-flight jobs при штатном SIGTERM. Migration target mismatch устранён для 14A rehearsal; worker production activation ждёт cutover и проверенной целевой схемы в Stage 14C.
- Stage12 baseline не повторён: доступный Oct 7 dump после восстановления в изолированной PG18 дал другие row counts и несопоставим с сохранённым workload.
- Полные команды, изоляция, результаты и незакрытые gates — [Stage 13 validation](../../../backend-migration/stage13-validation.md). Stage 13 ожидает возврата после этапа 14; пользовательский `next-env.d.ts` исключён из коммита.

## Этап 14A — 24 октября 2026

- Alembic стал единственным DDL owner для CI и Compose migration job. Prisma history сохраняется; Prisma Client generation и Node seed/CLI остаются до 14D.
- Зафиксированы две Alembic revisions: literal baseline из всех 41 Prisma migrations и отдельная append-only защита `audit_logs`. Исходный schema inventory перепроверен: все 42 source inputs совпали по SHA-256.
- Независимый raw-catalog verifier сравнивает таблицы, колонки/defaults, constraints, индексы, enums, функции и триггеры; `_prisma_migrations` и `alembic_version` исключены. Frozen snapshots хранят legacy и финальную схему.
- Empty-path на `stage14a_empty`: `alembic upgrade head`, финальная schema verification, demo seed, `verify_data` (12 relational counters = 0), integration tests 6/6. Direct SQL INSERT разрешён; UPDATE/DELETE audit rows отклоняются.
- Existing-copy path на восстановленной `stage14a_existing`: legacy catalog до stamp — 0 расхождений; сохранены 41 строки `_prisma_migrations`; `stamp 20261024_legacy_schema` → audit revision upgrade → финальная verification; `alembic check` без новых операций; tests 6/6.
- Targets создавались в двух отдельных PostgreSQL 15 Compose projects, проверялись через `current_database()` и удалены вместе с их volumes/networks. `project1`, `erp_migration_20261007` и source backup не изменялись.
- Ruff/format для затронутых Python-файлов, `mypy app`, YAML parsing и `git diff --check` прошли. Полный набор проекта и remote CI не запускались; `alembic check` оставил известное предупреждение о цикле FK departments/employees/staff_schedule, покрытом независимым catalog verification.
- Отчёт с exact commands/targets и handoff-порядком — [migration-handoff.md](../../../backend-migration/migration-handoff.md). Stage 14B–14D не начинались; 14A остановлен на предусмотренной пользовательской паузе.
