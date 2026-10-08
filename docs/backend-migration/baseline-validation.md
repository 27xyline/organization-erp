# Baseline этапа 00 — 7 октября 2026

Инвентаризация текущего TypeScript backend и подготовка изолированных данных. Этап 01 не начат: FastAPI, SQLAlchemy, Python environment и runtime не создавались. `backend/` содержит только синтетические JSON fixtures для будущих контрактных тестов.

## Исходное состояние

- Репозиторий: `/Users/mac/Desktop/organization-erp`, ветка `main`, HEAD `4dfa96d3319e73e68a44c74bb87495f8dce1cf35`.
- До работы уже были пользовательское изменение `next-env.d.ts` и документы плана в `docs/`. Ветки, коммиты и push не создавались.
- Node `25.6.1`, npm `11.9.0`, PostgreSQL `15.19` в существующем контейнере `organization-erp-postgres-1`.
- По исходникам: 102 route-файла, 148 HTTP method/route пар, 51 модель, 29 enums, 41 Prisma migration.
- Источник — локальная БД `project1` на `localhost:5434`. Docker и только PostgreSQL ERP запущены для этой проверки; другие приложения специально не запускались.

## Результаты проверок

| Проверка | Результат | Что именно подтверждает |
|---|---|---|
| `npm run lint` | Exit 0; 0 errors, 93 warnings | Текущий ESLint gate проходит; предупреждения остаются |
| `npm run typecheck` | Exit 0 | Текущий TypeScript компилируется без type errors |
| `npm test` без `TEST_DATABASE_URL` | 93 files passed, 2 skipped; 308 tests passed, 5 skipped | Unit/component/route tests; DB-tests намеренно не выполнялись |
| `npm run test:db` на немигрированной schema-only копии | 5 failed | Код и восстановленная старая схема несовместимы: missing tables/lease fields |
| `npm run test:db` после миграций копии | 3 passed, 2 failed | Timesheet workflow прошёл; два outbox regression cases не прошли |
| `npm run test:db -- --no-file-parallelism` на той же отдельной test DB | 3 passed, 2 failed | Отключение параллельности файлов само по себе сбои outbox не устраняет |
| Playwright, отдельная E2E БД, Next.js на `127.0.0.1:3017` | 5 passed | Существующие browser scenarios: login/access, asset transfer/archive, employee/finance pages, procurement filters/pagination, timesheet decision |
| `scripts/verify-data.ts` на migration-копии и копии документов | Exit 0; все 12 counters = 0 | Asset/holding relations, department invariants, document currentVersion/metadata/files |
| Проверка 10 synthetic fixtures | Paths/JSON valid; 6 schema/mapper assertions прошли | Ошибки Zod и HTTP error mapping; не полный HTTP replay всех 10 сценариев |
| Backup → restore comparison | Все 50 исходных таблиц: row counts и logical fingerprints совпали | Корректное восстановление исходного snapshot до новых миграций |
| Повторная сверка источника после тестов | Все fingerprints совпали с исходными | Бизнес-данные и migration history исходной БД не изменены |
| Копирование document root | 66 файлов, 15 980 байт, SHA-256 совпадает | Физическая копия локального файлового хранилища |

Логи сохранены в `.runtime/migration-baseline/2026-10-07/validation/`. Полный production build, нагрузочное тестирование и replay всех 148 HTTP контрактов в этап 00 не входили и не заявляются выполненными. Зелёный E2E подтверждает пять существующих сценариев, а не все бизнес-процессы ERP.

## Исходная БД отстаёт на три миграции

В `project1` применены 38 из 41 migrations. До проверки в ней 50 public tables, включая `_prisma_migrations`; отсутствуют `scheduled_alert_runs` и `timesheets`, `timesheet_status`, поля `notification_outbox.claimToken/leaseExpiresAt` и lease index.

Ожидают применения:

1. `20260925090000_notification_outbox_lease`.
2. `20260925120000_add_scheduled_alert_runs`.
3. `20260925202046_add_timesheet_approval_workflow`.

Эти миграции применены **только к созданным копиям**. Источник оставлен с 38 migration records. Это подтверждённое расхождение среды с текущим кодом, а не результат переписывания на Python. `verify-data` на старой копии тоже был зелёным: он не проверяет наличие всех новых таблиц и не заменяет migration/schema audit.

После применения на migration-копии: 52 public tables с `_prisma_migrations`, 512 бизнес-колонок + 8 колонок истории, 29 enums. Подробное сравнение источников и каталогов — в [schema-inventory.md](schema-inventory.md).

## Два существующих outbox-теста остаются красными

В `src/features/notifications/application/outbox.integration.test.ts`:

- `recovers an expired lease after a crashed worker`: ожидается `sent=1`, получен `0`, assertion на строке 70.
- `marks a fifth abandoned attempt as terminal without sending again`: sender был вызван, assertion на строке 81.

Timesheet tests и первая outbox проверка двух независимых workers прошли. Такие же два сбоя сохраняются в serial file run. Следовательно, объяснение только параллельностью двух файлов не подтверждено.

Подтверждённые границы теста/кода: очередь выбирается глобально с `limit=1`; внутри suite нет cleanup между тестами; payload одинаковый. Запись `attempts=5` не может попасть в claim (`attempts < 5`), поэтому sender третьего теста обработал другую eligible запись. `sent=0` означает отсутствие candidate либо `updateMany.count=0` на завершении. Нельзя установить выбранный ID по одинаковому `Test/SYSTEM` payload.

Причина отказа второго теста не доказана имеющимися логами. Возможные временные границы: `availableAt` default PostgreSQL `CURRENT_TIMESTAMP` с `TIMESTAMP(3)`; lease fixture создаётся через Node `Date.now()-1000`; eligibility использует `NOW()`. Read-only выборка времени после suite не выявила устойчивого заметного clock skew, но не восстанавливает момент claim. Округление timestamps остаётся гипотезой. `afterAll` удаляет test user с cascade; поздний SELECT не доказывает прошлое состояние.

Исходники и тесты не исправлялись в этапе 00. Перед заявлением о полностью зелёном backend нужно отдельное расследование с trace claim/ack и изолированными fixtures. Эта существующая проблема записана для переноса worker в этапе 13, но может быть исправлена раньше отдельным запросом пользователя.

## Подготовленные копии и локальные артефакты

| Назначение | БД | Содержимое/статус |
|---|---|---|
| Источник | `project1` | Существующие данные, 38 migrations; read-only для этой задачи |
| Будущая migration-разработка | `erp_migration_20261007` | Полный restore snapshot + три pending migrations; данные/relations проверены |
| DB integration tests | `erp_stage00_test_20261007` | Schema-only restore + migration history + три migrations; test fixture data |
| Browser tests | `erp_stage00_e2e_20261007` | Полный restore + три migrations; E2E setup и изменения только здесь |

Локальный каталог `.runtime/migration-baseline/2026-10-07/` игнорируется Git. В нём:

- `source-backup.dump`: custom-format pg_dump, 248 135 байт, права `0600`.
- `database-rehearsal.json`: counts/fingerprints источника и первичного restore.
- `source-migrations.json`, `live-schema.json`: история/каталог источника с 38 migrations.
- `copy-live-schema.json`: каталог migration-копии с 41 migrations.
- `documents-copy/` и `documents-manifest.json`: копия document root и checksums.
- `.env.migration`: отдельные DATABASE_URL/document root и синтетический session secret; права `0600`; реальные credentials в документы не копируются.
- `post-verification.json`: итоговая неизменность источника, документов и пользовательского `next-env.d.ts`.
- `validation/`: исходные и повторные результаты, включая красные DB runs.
- `database-rehearsal.py`, `post-verification.py`, `run-check.mjs`, `validate-fixtures.ts`, временная Playwright config: локальные диагностические инструменты, не новый runtime проекта.

Backup SHA-256: `faccfa17bf43178ce02b689177b41648735412b6bb4b4259699066a779e93c70`.

Дамп содержит исходные данные, поэтому его не добавлять в Git и не использовать в качестве anonymized fixture. Зафиксированные JSON-контракты в `backend/tests/contracts/fixtures/` созданы отдельно синтетически. Для DB tests не использовать `project1` или development/migration-копию с посторонними pending notifications.

## Как воспроизвести на подготовленной среде

Команды выполняются из корня репозитория. Локальный `run-check.mjs` читает credentials из `.env`, но обязательно заменяет имя БД на одну из выделенных копий и проверяет локальный host. Не выводит URL с паролем.

```sh
node --env-file-if-exists=.env .runtime/migration-baseline/2026-10-07/run-check.mjs verify
node --env-file-if-exists=.env .runtime/migration-baseline/2026-10-07/run-check.mjs integration
node --env-file-if-exists=.env .runtime/migration-baseline/2026-10-07/run-check.mjs integration-serial
node --import tsx .runtime/migration-baseline/2026-10-07/validate-fixtures.ts
python3 .runtime/migration-baseline/2026-10-07/post-verification.py
```

`integration` и `integration-serial` сейчас воспроизводят два известных сбоя, это ожидаемое состояние baseline. Для полного повторного E2E scratch config нужно восстановить `NEXT_DIST_DIR=.next-stage00`; после запуска Next dev вновь генерирует next-env/tsconfig и agent files — сохранить исходные пользовательские файлы и убрать только изменения этого запуска. Итоговая копия generated cache/instructions хранится под `.runtime/`; active root files восстановлены.

## Backup/restore rehearsal: выполненный протокол

1. Прочитано имя исходной БД из контейнера и проверено отсутствие целевых имён в `pg_database`; существующие targets не перезаписываются.
2. `pg_dump --format=custom --no-owner --no-privileges` исходной `project1`; stdout сразу в локальный файл с `0600`, содержимое не печаталось.
3. Созданы три новые БД. Полный `pg_restore --no-owner --no-privileges --exit-on-error` для migration/E2E; `--schema-only` для integration.
4. Только в schema-only test DB восстановлены данные `_prisma_migrations`, чтобы deploy не пытался повторно создавать legacy schema.
5. Сравнены counts/fingerprints всех исходных таблиц между источником и полным migration-restore; повторно прочитан источник и сравнён с исходным.
6. Существующий Prisma `migrate deploy` запущен с DATABASE_URL каждой копии; все три pending migrations применены на копиях.
7. Запущены validation/DB/E2E checks только на копиях. Original document root и user-modified `next-env.d.ts` сохранены.

Новые DB/копия документов остаются доступными для обучения. Удаление этих артефактов или миграция исходной БД отдельными действиями не выполнялись.

## Проверка полноты реестров

- Независимый review проверил все route/method counts и выборочно восемь сложных контрактов: download, approval cancel/decision, finance save, procurement capitalization, employee DELETE, import preview/commit.
- Исправлены ошибки документации: три shorthand browser POST/PUT callers вместо GET/read, read-only financial period check вместо вымышленного lock, отсутствие MOL scope-check при capitalization и точное имя audit action `DOCUMENT_DOWNLOADED`. Product code не менялся.
- Финальный validator сверил 148 HTTP method/route пар, 51 model, 29 enum, 512 columns, 41 migration, 199 source SHA-256, более 8 тысяч source references, локальные Markdown links и 10 JSON fixtures; ошибок нет. Подтверждено отсутствие `backend/app` и Python runtime scaffold.
- Review не подтверждает полный HTTP replay всех контрактов и equivalence SQL function bodies; эти ограничения сохранены в реестрах.

## Что читать на учебной паузе

Начать с [write-owners.md: путь переименования подразделения](write-owners.md): browser PATCH → proxy → route/actor/scopes/schema → DepartmentService → organization advisory lock → обновление подразделения и Employee/StaffSchedule/Mol snapshots → AuditLog → commit → ответ → reload. Этот сценарий уже показывает, зачем при Python-переносе сохранять общий UoW.

Затем сравнить его с procurement submit/capitalize: в текущем TS зависимые сущности создаются в отдельных транзакциях. Это существующее поведение с риском частичного успеха, а не образец транзакций, который надо механически копировать.
