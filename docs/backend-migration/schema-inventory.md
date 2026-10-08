# Инвентаризация PostgreSQL-схемы для переноса backend

Дата фиксации: 7 октября 2026. Область: текущий `prisma/schema.prisma` и **все 41** `prisma/migrations/**/migration.sql` в порядке имени каталога. Основной реестр описывает ожидаемую схему **полной цепочки 41 миграции**. Исходная БД применена только до 38-й: её отдельный снимок ниже содержит 49 бизнес-таблиц. Прямых подключений к БД и выполнения миграций этот исполнитель не делал; root предоставил read-only metadata исходной БД и актуальной копии, проверил восстановление/применение pending migrations на трёх копиях. Отдельное сравнение актуальной `erp_migration_20261007` с полной цепочкой ниже показало 0 расхождений проверенной metadata. Подробные команды/rehearsal находятся в [baseline-validation.md](baseline-validation.md).

Реестр соответствует задаче этапа 00 из [плана](../superpowers/plans/2026-09-28-fastapi/01-foundation.md#этап-00-инвентаризация-и-фиксирование-поведения) и ограничениям [архитектуры](../superpowers/specs/2026-09-28-fastapi-backend-design.md#данные-и-владение-миграциями). В этапах 01–13 DDL остаётся у Prisma; этот файл не разрешает Alembic `upgrade`/`stamp` или переключение writers.

[Машиночитаемый реестр](schema-inventory.json) содержит все поля, исходные определения Prisma, owning/inverse relations, SQL-ограничения, индексы, полные определения функций/триггеров, историю изменённых колонок, preflight/data SQL и SHA-256 каждого источника. Nullable в колонках ниже взят из SQL-миграций; обязательность Prisma указана отдельно.

## Покрытие источников

| Объект | Количество |
|---|---:|
| Prisma models / SQL tables | 51 |
| Prisma enums / PostgreSQL enums | 29 |
| Физические колонки | 512 |
| Primary keys | 51 |
| Foreign keys | 90 |
| SQL CHECK constraints | 53 |
| Индексы без PK | 132 |
| Unique indexes (включая raw SQL) | 43 |
| Обычные indexes | 89 |
| Индексы, отсутствующие в Prisma | 3 |
| SQL functions / triggers | 4 |
| SQL migration files | 41 |
| Строки migration.sql | 1948 |
| Prisma-only cuid() ID | 49 |
| Prisma-only @updatedAt | 39 |
| DATE columns | 7 |
| TIMESTAMP(3) columns | 129 |
| DECIMAL columns | 29 |

Все 51 модель имеют `@@map` в snake_case SQL table name. У физических полей нет `@map`: имя SQL-колонки точно равно camelCase имени Prisma (или `id`, `key`, `name` и т. п.). Relation-поля и массивы relations не создают дополнительные колонки. Табличный реестр ниже перечисляет все 512 физических колонок, 51 PK, 90 FK, 53 CHECK и 132 финальных индекса.

Источники: `P` = [prisma/schema.prisma](../../prisma/schema.prisma); `M01`–`M41` = миграции в таблице ниже. Каждая ссылка вида `M19:99` ведёт к точной строке. Полные пути и диапазоны строк также есть в JSON.

| Код | SQL migration | Строки | Исходная БД | Изменения в файле |
|---|---|---:|---|---|
| M01 | [20260213133657_init](../../prisma/migrations/20260213133657_init/migration.sql) | 121 | applied (root history) | enums 2, tables 5, CREATE INDEX 4, ALTER TABLE 5 |
| M02 | [20260214063607_add_photos_and_notes](../../prisma/migrations/20260214063607_add_photos_and_notes/migration.sql) | 3 | applied (root history) | ALTER TABLE 1 |
| M03 | [20260214082146_add_mol_photo](../../prisma/migrations/20260214082146_add_mol_photo/migration.sql) | 2 | applied (root history) | ALTER TABLE 1 |
| M04 | [20260219195204_add_projects](../../prisma/migrations/20260219195204_add_projects/migration.sql) | 59 | applied (root history) | enums 2, ALTER TABLE 4, tables 2, CREATE INDEX 1 |
| M05 | [20260219202127_add_accounting_form](../../prisma/migrations/20260219202127_add_accounting_form/migration.sql) | 2 | applied (root history) | ALTER TABLE 1 |
| M06 | [20260227125344_add_employees_and_staff_schedule](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql) | 78 | applied (root history) | enums 3, tables 4, CREATE INDEX 1, ALTER TABLE 3 |
| M07 | [20260316062522_add_employee_contract_dates](../../prisma/migrations/20260316062522_add_employee_contract_dates/migration.sql) | 6 | applied (root history) | ALTER TABLE 2 |
| M08 | [20260316073529_add_employee_contract_fields](../../prisma/migrations/20260316073529_add_employee_contract_fields/migration.sql) | 7 | applied (root history) | enums 1, ALTER TABLE 1 |
| M09 | [20260323082159_add_personnel_edit_action](../../prisma/migrations/20260323082159_add_personnel_edit_action/migration.sql) | 2 | applied (root history) | ALTER ENUM 1 |
| M10 | [20260323093558_add_archive_personnel_action](../../prisma/migrations/20260323093558_add_archive_personnel_action/migration.sql) | 2 | applied (root history) | ALTER ENUM 1 |
| M11 | [20260327125644_add_salary_entries](../../prisma/migrations/20260327125644_add_salary_entries/migration.sql) | 21 | applied (root history) | tables 1, CREATE INDEX 2, ALTER TABLE 1 |
| M12 | [20260402091730_add_finance_plan_entries](../../prisma/migrations/20260402091730_add_finance_plan_entries/migration.sql) | 25 | applied (root history) | enums 1, tables 1, CREATE INDEX 2, ALTER TABLE 1 |
| M13 | [20260402144508_add_project_to_finance_plan_entries](../../prisma/migrations/20260402144508_add_project_to_finance_plan_entries/migration.sql) | 5 | applied (root history) | ALTER TABLE 2 |
| M14 | [20260402203000_allow_multi_project_nadbavka](../../prisma/migrations/20260402203000_allow_multi_project_nadbavka/migration.sql) | 7 | applied (root history) | DROP INDEX 1, CREATE INDEX 2 |
| M15 | [20260406121000_add_employee_employment_rate](../../prisma/migrations/20260406121000_add_employee_employment_rate/migration.sql) | 7 | applied (root history) | ALTER TABLE 1, data/preflight 1 |
| M16 | [20260410120000_add_project_members](../../prisma/migrations/20260410120000_add_project_members/migration.sql) | 22 | applied (root history) | tables 1, CREATE INDEX 3, ALTER TABLE 2 |
| M17 | [20260410183000_add_task_assignees](../../prisma/migrations/20260410183000_add_task_assignees/migration.sql) | 28 | applied (root history) | tables 1, CREATE INDEX 3, ALTER TABLE 3 |
| M18 | [20260411164424_test](../../prisma/migrations/20260411164424_test/migration.sql) | 23 | applied (root history) | ALTER TABLE 3, CREATE INDEX 5 |
| M19 | [20260716123000_add_users_holdings_and_constraints](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql) | 141 | applied (root history) | enums 1, tables 2, CREATE INDEX 13, ALTER TABLE 12, data/preflight 3 |
| M20 | [20260716203300_db_cascade_project_delete](../../prisma/migrations/20260716203300_db_cascade_project_delete/migration.sql) | 4 | applied (root history) | ALTER TABLE 2 |
| M21 | [20260718090100_add_department_hierarchy](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql) | 239 | applied (root history) | BEGIN/COMMIT 2, tables 1, CREATE INDEX 10, data/preflight 12, ALTER TABLE 11, functions 2, triggers 2 |
| M22 | [20260718090200_add_scoped_role_assignments](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql) | 133 | applied (root history) | enums 2, ALTER TABLE 7, CREATE INDEX 7, tables 3, data/preflight 3 |
| M23 | [20260718141000_add_local_document_management](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql) | 166 | applied (root history) | BEGIN/COMMIT 2, enums 2, tables 2, CREATE INDEX 11, ALTER TABLE 2, functions 2, triggers 2 |
| M24 | [20260718170000_add_notification_platform](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql) | 97 | applied (root history) | enums 3, tables 3, CREATE INDEX 8, ALTER TABLE 3 |
| M25 | [20260718183752_add_approval_workflows](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql) | 92 | applied (root history) | BEGIN/COMMIT 2, ALTER ENUM 2, enums 2, tables 2, CREATE INDEX 8, ALTER TABLE 5 |
| M26 | [20260718215100_add_employee_profiles](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql) | 69 | applied (root history) | BEGIN/COMMIT 2, ALTER TABLE 7, tables 2, CREATE INDEX 5, data/preflight 1 |
| M27 | [20260718221000_add_project_planning](../../prisma/migrations/20260718221000_add_project_planning/migration.sql) | 67 | applied (root history) | BEGIN/COMMIT 2, enums 2, ALTER TABLE 6, tables 3, CREATE INDEX 5 |
| M28 | [20260718223000_add_timekeeping](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql) | 40 | applied (root history) | BEGIN/COMMIT 2, enums 1, tables 1, CREATE INDEX 3, ALTER TABLE 3 |
| M29 | [20260718224500_add_asset_lifecycle](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql) | 51 | applied (root history) | BEGIN/COMMIT 2, ALTER ENUM 1, enums 2, tables 1, CREATE INDEX 3, ALTER TABLE 1 |
| M30 | [20260718230000_add_payroll_finance](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql) | 56 | applied (root history) | BEGIN/COMMIT 2, enums 2, tables 2, CREATE INDEX 4, ALTER TABLE 3 |
| M31 | [20260718233000_add_procurement_workflow](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql) | 171 | applied (root history) | BEGIN/COMMIT 2, enums 1, tables 6, CREATE INDEX 21, ALTER TABLE 15 |
| M32 | [20260719074857_add_report_presets](../../prisma/migrations/20260719074857_add_report_presets/migration.sql) | 18 | applied (root history) | tables 1, CREATE INDEX 1, ALTER TABLE 1 |
| M33 | [20260719075543_add_smtp_settings](../../prisma/migrations/20260719075543_add_smtp_settings/migration.sql) | 13 | applied (root history) | tables 1 |
| M34 | [20260719075920_add_depreciation_and_revenue](../../prisma/migrations/20260719075920_add_depreciation_and_revenue/migration.sql) | 7 | applied (root history) | ALTER TABLE 2 |
| M35 | [20260719080148_add_approval_step_due_dates](../../prisma/migrations/20260719080148_add_approval_step_due_dates/migration.sql) | 3 | applied (root history) | ALTER TABLE 1 |
| M36 | [20260924160000_add_asset_saved_views](../../prisma/migrations/20260924160000_add_asset_saved_views/migration.sql) | 21 | applied (root history) | tables 1, CREATE INDEX 2, ALTER TABLE 1 |
| M37 | [20260924180000_add_approval_templates](../../prisma/migrations/20260924180000_add_approval_templates/migration.sql) | 22 | applied (root history) | tables 1, CREATE INDEX 2, ALTER TABLE 1 |
| M38 | [20260924200000_add_asset_inventory](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql) | 65 | applied (root history) | enums 1, tables 2, CREATE INDEX 3, ALTER TABLE 5 |
| M39 | [20260925090000_notification_outbox_lease](../../prisma/migrations/20260925090000_notification_outbox_lease/migration.sql) | 6 | pending | ALTER TABLE 1, CREATE INDEX 1 |
| M40 | [20260925120000_add_scheduled_alert_runs](../../prisma/migrations/20260925120000_add_scheduled_alert_runs/migration.sql) | 8 | pending | tables 1 |
| M41 | [20260925202046_add_timesheet_approval_workflow](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql) | 39 | pending | enums 1, tables 1, CREATE INDEX 3, ALTER TABLE 3 |

## Типы, ID и defaults

- `String` → `TEXT`; все 51 PK имеют текстовый тип. У 49 моделей Prisma `@default(cuid())` генерирует ID в клиенте: в SQL у этих `id` нет server default. `ScheduledAlertRun.key` задаёт вызывающий код; `SmtpSettings.id` имеет SQL default `'singleton'`. База не ограничивает таблицу SMTP одной строкой: можно явно вставить другой `id`. Исторические SQL-backfill IDs `holding_<md5>`, `dept_<md5>`/`dept_unassigned`, `legacy-<md5>` тоже допустимы; валидатор «только CUID» при переносе повредит совместимость.
- `Asset.orderNumber` — единственный `autoincrement()`: миграция использует `SERIAL NOT NULL`, то есть PostgreSQL integer + owned sequence `assets_orderNumber_seq` с implicit `nextval` default. Это не PK и не UNIQUE; пропуски sequence допустимы. Название sequence и nextval default совпали с original snapshot root; ownership/state sequence в переданный снимок не включены.
- Все 129 timestamp-колонок — `TIMESTAMP(3)` **без timezone**, с точностью до миллисекунд. `DateTime` в Prisma сам по себе не означает `TIMESTAMPTZ` и не доказывает UTC. `CURRENT_TIMESTAMP` возвращает время с timezone и при записи в timestamp без timezone преобразуется по timezone DB session; прежнюю нормализацию/JSON-контракт надо зафиксировать в fixtures и round-trip tests на копии.
- Только 7 колонок с `@db.Date` имеют `DATE`: `asset_maintenance.scheduledDate/nextDueDate`, `procurement_requests.neededBy`, `procurement_contracts.signedAt/deliveryDueAt`, `procurement_deliveries.receivedAt`, `time_entries.workDate`. В Python mapping это календарная `date`; остальные поля с именем Date (`birthDate`, contract/start/end dates, `dueDate`) остаются timestamp.
- Все 29 Decimal-колонок имеют явно заданные precision/scale: `DECIMAL(5,2)`, `(10,2)` или `(12,2)`. Использовать Python Decimal/Numeric с указанной точностью; положительность задана только перечисленными CHECK, а не типом. Например, `initialCost`, `usefulLifeMonths`, project revenues и некоторые salary/rate поля не получают дополнительного SQL CHECK автоматически.
- `Json` → `JSONB`, `BigInt` → `BIGINT` (`document_versions.sizeBytes`), `String[]` → `TEXT[]`. SQL NULL и JSON `null` различаются; JSON output/Prisma nullable behaviour проверять fixtures. Массивы SQL могут содержать NULL-элементы: element CHECK нет.
- `@default(now())` подкреплён SQL `DEFAULT CURRENT_TIMESTAMP`; literal/default enum и пустые array defaults также перечислены в каждой колонке. `@updatedAt` встречается у 39 полей: клиент Prisma заполняет их при create/update, SQL не содержит default и автоматического update trigger. SQLAlchemy должен повторить это поведение для writes; `server_default=now()` сам по себе этого не делает.
- Внутренний ID объекта, `document_versions.storageKey` и генерация historical backfill IDs — разные механизмы. Storage key CHECK принимает UUID-подобную строку пути, но PK version остаётся TEXT/CUID.

## Расхождения источников и непроверенная живая схема

| Область | Что видно в источниках | Последствие для переноса |
|---|---|---|
| `notification_event_type` | Набор values совпадает; Prisma declaration order ([P:435](../../prisma/schema.prisma#L435)) отличается от SQL creation/append order ([M24:1](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L1), [M25:3](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L3), [M25:4](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L4), [M29:3](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L3)) | При baseline с нуля сохранить PostgreSQL order; enum comparisons/ORDER BY зависят от него. |
| `personnel_action_type` | Набор values совпадает; Prisma declaration order ([P:1281](../../prisma/schema.prisma#L1281)) отличается от SQL creation/append order ([M06:5](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L5), [M09:2](../../prisma/migrations/20260323082159_add_personnel_edit_action/migration.sql#L2), [M10:2](../../prisma/migrations/20260323093558_add_archive_personnel_action/migration.sql#L2)) | При baseline с нуля сохранить PostgreSQL order; enum comparisons/ORDER BY зависят от него. |
| `assets.documentFiles` | Prisma required list ([P:105](../../prisma/schema.prisma#L105)); SQL nullable ([M01:50](../../prisma/migrations/20260213133657_init/migration.sql#L50)) | Не добавлять `NOT NULL` скрыто; исследовать NULL в копии и прежнюю сериализацию. |
| `assets.photos` | Prisma required list ([P:118](../../prisma/schema.prisma#L118)); SQL nullable ([M02:3](../../prisma/migrations/20260214063607_add_photos_and_notes/migration.sql#L3)) | Не добавлять `NOT NULL` скрыто; исследовать NULL в копии и прежнюю сериализацию. |
| `operations.documentFiles` | Prisma required list ([P:237](../../prisma/schema.prisma#L237)); SQL nullable ([M01:75](../../prisma/migrations/20260213133657_init/migration.sql#L75)) | Не добавлять `NOT NULL` скрыто; исследовать NULL в копии и прежнюю сериализацию. |
| `report_presets.metrics` | Prisma required list ([P:1409](../../prisma/schema.prisma#L1409)); SQL nullable ([M32:5](../../prisma/migrations/20260719074857_add_report_presets/migration.sql#L5)) | Не добавлять `NOT NULL` скрыто; исследовать NULL в копии и прежнюю сериализацию. |

Статическая сверка сопоставила все models/tables, columns/types (SERIAL нормализован к INTEGER), owning FK + referential actions, ordinary unique/index declarations и наборы enum values. Других расхождений этого набора источников не найдено. Все SQL statement categories распознаны; изменение `audit_logs.details` TEXT → JSONB, `staff_schedule.rate` DECIMAL(3,2) → DECIMAL(5,2), department nullable → NOT NULL и заменённые FK/indexes учтены в финальном результате. Это ограниченная статическая сверка; она не заменяет Prisma validate или PostgreSQL catalog comparison.

По переданному снимку проверены present columns/types/NULL/default/precision, catalog enum order, FK/actions, index definitions, CHECK и trigger definitions; подтверждённые pending перечислены ниже. По этому снимку неизвестны функция-body equivalence, validation/enabled flags, owners/grants, search_path, timezone session и sequence state. Данные/NULL values не исследованы этим исполнителем. Даже совпадение перечисленной metadata не является полным доказательством baseline equivalence.

## Снимок исходной БД и pending migrations

Root выполнил read-only PostgreSQL inventory исходной `project1`; локальный снимок metadata: `.runtime/migration-baseline/2026-10-07/live-schema.json`. Его SHA-256 сохранён в JSON этого реестра. `.runtime` ignored и является локальным evidence, а не переносимым Git-архивом. Миграционная история, восстановление и отдельные копии описаны в [baseline-validation.md](baseline-validation.md).

| Метрика | Полная цепочка исходников | Исходная БД (снимок root) | Актуальная копия после миграций |
|---|---:|---:|---:|
| Применённые миграции | 41 файла | 38 applied, 3 pending | 41 applied, 0 pending |
| Business tables | 51 | 49 | 51 |
| Tables вместе с `_prisma_migrations` | 52 expected | 50 | 52 |
| Business columns | 512 | 492 | 512 (520 с history) |
| PG enum types | 29 | 28 | 29 |
| PK / FK / CHECK | 51 / 90 / 53 | 49 / 87 / 53 | 51 / 90 / 53 |
| Non-PK indexes | 132 | 128 | 132 |
| Application triggers | 4 | 4 | 4 |

| Pending migration | Объекты, отсутствующие в исходном снимке | Источник |
|---|---|---|
| `20260925090000_notification_outbox_lease` | `notification_outbox.claimToken`, `leaseExpiresAt`, `notification_outbox_status_leaseExpiresAt_idx` | [M39:1](../../prisma/migrations/20260925090000_notification_outbox_lease/migration.sql#L1) |
| `20260925120000_add_scheduled_alert_runs` | `scheduled_alert_runs` (5 columns + PK) | [M40:1](../../prisma/migrations/20260925120000_add_scheduled_alert_runs/migration.sql#L1) |
| `20260925202046_add_timesheet_approval_workflow` | `timesheets` (13 columns + PK + 3 FK + 3 indexes), `timesheet_status` | [M41:2](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L2) |

Все present column types/NULL/defaults/precision и все 28 present enum types/catalog order совпали с ожидаемым результатом первых 38 SQL-файлов. Сопоставлены 87 present FK definitions/actions и 128 non-PK indexes; 53 CHECK и 4 trigger definitions проверены по снимку, различий не найдено. В pg_constraint также есть type `t` для `documents_current_version_exists`: это deferred constraint trigger из M23, а не дополнительный CHECK/сторонний drift. Четыре array NULL и два Prisma enum-order расхождения источников выше также присутствуют в исходном каталоге. Полные function bodies и validation/enabled flags в переданный снимок не включены.

Root успешно применил три pending миграции **только на отдельных копиях** `erp_migration_20261007`, `erp_stage00_test_20261007`, `erp_stage00_e2e_20261007`; исходная `project1` осталась с 38 applied. Этот исполнитель прочитал success logs `.runtime/migration-baseline/2026-10-07/validation/migrate-{migration,integration,e2e}.log`. Post-migration catalog comparison выполнено ниже для `erp_migration_20261007`; для остальных двух копий здесь подтверждены success logs, а не независимая полная catalog-сверка. Не выполнять stamp исходной 38-migration БД под 41-migration baseline.

## Сверка актуальной копии с полной цепочкой

Root передал `.runtime/migration-baseline/2026-10-07/copy-live-schema.json` для `erp_migration_20261007` после всех 41 миграций. Этот исполнитель сравнил snapshot с реконструированным DDL: **0 отсутствующих/добавочных бизнес-таблиц, колонок или именованных constraints/indexes/triggers; 0 несовпадений types/NULL/defaults/precision, enum values/order, PK/FK/actions и index definitions**. SHA-256 snapshot и отдельный `copy_snapshot_comparison` сохранены в JSON. Историческое сравнение исходной БД не перезаписано.

Сопоставлены 51 business table, все 512 column definitions, 29 enum types/131 ordered enum labels, 51 PK, 90 FK, 53 CHECK, 132 non-PK indexes и 4 trigger definitions. SQL-source/Pg nullable для четырёх массивов совпало; SQL enum order также совпал с migration creation/append order. Это сохраняемые отличия Prisma DSL, а не drift копии.

У `payroll_adjustments_period_check` и `payroll_periods_period_check` dump/restore привёл текст CHECK к эквивалентному группированию AND: год по-прежнему 2000–2100, месяц 1–12. Оба определения проверены; semantic mismatch нет. Остальные 51 CHECK и все 4 trigger definitions текстово совпали с исходным снимком. Эти две catalog text variations перечислены в JSON и не скрыты как побайтовое равенство.

Исключения проверки: snapshot не содержит SQL function bodies, convalidated/trigger enabled/deferrability flags FK, owner/grants, session search_path/timezone, sequence ownership/state или дополнительные extensions. Function references и deferred constraint trigger definition есть, полная эквивалентность bodies/flags не утверждается. Alembic baseline/rebuild с нуля ещё не выполнены; совпавшая metadata копии не является разрешением на stamp исходной БД.

Root post-report `.runtime/migration-baseline/2026-10-07/post-verification.json` подтверждает: исходная логическая БД не изменена (38 миграций/50 tables), исходные 66 документов не изменены, пользовательское содержимое next-env.d.ts сохранено. Это свидетельство root, а не повторный запрос к исходной БД данным исполнителем. Runtime/test failures записываются отдельно в [baseline-validation.md](baseline-validation.md).

## PostgreSQL enums

Порядок ниже — ожидаемый **SQL catalog order** после последовательного применения файлов. Prisma order хранится в JSON и выделен выше, если отличается. `CANCELED` (maintenance) и `CANCELLED` (approval/procurement) — разные сохранённые значения; не нормализовать написание.

| Prisma enum → SQL type | SQL values по порядку | Источники |
|---|---|---|
| `AssetStatus` → `asset_status` | `IN_STOCK`, `IN_USE`, `UNDER_REPAIR`, `PLANNED_FOR_DISPOSAL`, `PARTIALLY_DISPOSED`, `FULLY_DISPOSED` | [P:142](../../prisma/schema.prisma#L142), [M01:2](../../prisma/migrations/20260213133657_init/migration.sql#L2) |
| `AssetInventoryStatus` → `asset_inventory_status` | `IN_PROGRESS`, `COMPLETED` | [P:153](../../prisma/schema.prisma#L153), [M38:1](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L1) |
| `AssetMaintenanceType` → `asset_maintenance_type` | `INSPECTION`, `CALIBRATION`, `REPAIR`, `SERVICE` | [P:160](../../prisma/schema.prisma#L160), [M29:5](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L5) |
| `AssetMaintenanceStatus` → `asset_maintenance_status` | `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELED` | [P:169](../../prisma/schema.prisma#L169), [M29:12](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L12) |
| `OperationType` → `operation_type` | `RECEIPT`, `TRANSFER`, `DISPOSAL`, `STATUS_CHANGE` | [P:204](../../prisma/schema.prisma#L204), [M01:5](../../prisma/migrations/20260213133657_init/migration.sql#L5) |
| `UserRole` → `user_role` | `ADMIN`, `EDITOR`, `VIEWER` | [P:304](../../prisma/schema.prisma#L304), [M19:2](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L2) |
| `AppRole` → `app_role` | `ADMIN`, `HR`, `ACCOUNTANT`, `PROJECT_MANAGER`, `ASSET_CUSTODIAN`, `DEPARTMENT_HEAD`, `AUDITOR`, `EMPLOYEE` | [P:312](../../prisma/schema.prisma#L312), [M22:3](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L3) |
| `ScopeMode` → `scope_mode` | `NONE`, `ALL`, `ASSIGNED`, `SELF` | [P:325](../../prisma/schema.prisma#L325), [M22:14](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L14) |
| `NotificationEventType` → `notification_event_type` | `SYSTEM`, `CONTRACT_EXPIRING`, `TASK_OVERDUE`, `ASSET_DISPOSAL_DUE`, `BUDGET_OVERRUN`, `APPROVAL_REQUESTED`, `APPROVAL_DECIDED`, `ASSET_MAINTENANCE_DUE` | [P:435](../../prisma/schema.prisma#L435), [M24:1](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L1), [M25:3](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L3), [M25:4](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L4), [M29:3](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L3) |
| `NotificationChannel` → `notification_channel` | `IN_APP`, `EMAIL` | [P:448](../../prisma/schema.prisma#L448), [M24:9](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L9) |
| `NotificationOutboxStatus` → `notification_outbox_status` | `PENDING`, `PROCESSING`, `SENT`, `FAILED`, `SKIPPED` | [P:455](../../prisma/schema.prisma#L455), [M24:11](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L11) |
| `ApprovalRequestStatus` → `approval_request_status` | `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` | [P:536](../../prisma/schema.prisma#L536), [M25:7](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L7) |
| `ApprovalStepStatus` → `approval_step_status` | `WAITING`, `PENDING`, `APPROVED`, `REJECTED`, `SKIPPED` | [P:546](../../prisma/schema.prisma#L546), [M25:10](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L10) |
| `ProjectStatus` → `project_status` | `ACTIVE`, `COMPLETED`, `ARCHIVED` | [P:631](../../prisma/schema.prisma#L631), [M04:2](../../prisma/migrations/20260219195204_add_projects/migration.sql#L2) |
| `ProcurementStatus` → `procurement_status` | `DRAFT`, `SUBMITTED`, `APPROVED`, `CONTRACTED`, `PARTIALLY_DELIVERED`, `DELIVERED`, `CAPITALIZED`, `REJECTED`, `CANCELLED` | [P:679](../../prisma/schema.prisma#L679), [M31:3](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L3) |
| `TaskStatus` → `task_status` | `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `DELAYED` | [P:946](../../prisma/schema.prisma#L946), [M04:5](../../prisma/migrations/20260219195204_add_projects/migration.sql#L5) |
| `TaskPriority` → `task_priority` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` | [P:955](../../prisma/schema.prisma#L955), [M27:3](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L3) |
| `TaskRisk` → `task_risk` | `LOW`, `MEDIUM`, `HIGH` | [P:964](../../prisma/schema.prisma#L964), [M27:4](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L4) |
| `EmployeeStatus` → `employee_status` | `ACTIVE`, `ON_VACATION`, `ON_SICK_LEAVE`, `DISMISSED` | [P:1061](../../prisma/schema.prisma#L1061), [M06:2](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L2) |
| `EmploymentContractType` → `employment_contract_type` | `PRIMARY`, `INTERNAL`, `EXTERNAL` | [P:1070](../../prisma/schema.prisma#L1070), [M08:2](../../prisma/migrations/20260316073529_add_employee_contract_fields/migration.sql#L2) |
| `TimeEntryType` → `time_entry_type` | `REGULAR`, `VACATION`, `SICK_LEAVE`, `BUSINESS_TRIP`, `OVERTIME` | [P:1078](../../prisma/schema.prisma#L1078), [M28:3](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L3) |
| `TimesheetStatus` → `timesheet_status` | `DRAFT`, `SUBMITTED`, `APPROVED`, `RETURNED` | [P:1110](../../prisma/schema.prisma#L1110), [M41:2](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L2) |
| `PayrollAdjustmentType` → `payroll_adjustment_type` | `BONUS`, `ONE_TIME`, `DEDUCTION` | [P:1178](../../prisma/schema.prisma#L1178), [M30:3](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L3) |
| `PayrollPeriodStatus` → `payroll_period_status` | `OPEN`, `CLOSED` | [P:1186](../../prisma/schema.prisma#L1186), [M30:4](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L4) |
| `FinancePlanType` → `finance_plan_type` | `OKLAD`, `NADBAVKA` | [P:1230](../../prisma/schema.prisma#L1230), [M12:2](../../prisma/migrations/20260402091730_add_finance_plan_entries/migration.sql#L2) |
| `PersonnelActionType` → `personnel_action_type` | `HIRE`, `DISMISS`, `TRANSFER`, `EXTEND`, `PROMOTE`, `EDIT`, `ARCHIVE` | [P:1281](../../prisma/schema.prisma#L1281), [M06:5](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L5), [M09:2](../../prisma/migrations/20260323082159_add_personnel_edit_action/migration.sql#L2), [M10:2](../../prisma/migrations/20260323093558_add_archive_personnel_action/migration.sql#L2) |
| `VacationType` → `vacation_type` | `VACATION`, `SICK_LEAVE`, `BUSINESS_TRIP`, `UNPAID_LEAVE` | [P:1309](../../prisma/schema.prisma#L1309), [M06:8](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L8) |
| `DocumentStatus` → `document_status` | `DRAFT`, `IN_REVIEW`, `APPROVED`, `SIGNED`, `ARCHIVED` | [P:1318](../../prisma/schema.prisma#L1318), [M23:3](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L3) |
| `DocumentCategory` → `document_category` | `GENERAL`, `CONTRACT`, `ORDER`, `ACT`, `INVOICE`, `PERSONNEL`, `PROJECT`, `ASSET`, `OTHER` | [P:1328](../../prisma/schema.prisma#L1328), [M23:11](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L11) |

## SQL-объекты вне Prisma

Все 53 CHECK перечислены с полными выражениями под соответствующими моделями. Они отсутствуют в Prisma DSL и должны сохраниться в baseline. Помимо CHECK есть три raw unique indexes:

| Index | SQL definition | Источник |
|---|---|---|
| `departments_code_ci_key` | `departments (LOWER("code"))` | [M21:22](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L22) |
| `departments_name_ci_key` | `departments (LOWER("name"))` | [M21:23](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L23) |
| `finance_plan_entries_without_project_key` | `finance_plan_entries ("employeeId", "year", "month", "type") WHERE "projectId" IS NULL` | [M19:99](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L99) |

Обычный unique `(employeeId, year, month, type, projectId)` допускает несколько NULL в `projectId`. Дополнительный partial unique закрывает этот пробел только для строк без проекта; оба индекса нужны. `LOWER(code/name)` подразделений задаёт регистронезависимую уникальность в дополнение к обычным unique; BTRIM не входит в index expression.

| Function / Trigger | Момент и гарантия | Источник |
|---|---|---|
| `acquire_department_mutation_lock` / `departments_acquire_mutation_lock` | BEFORE INSERT/UPDATE/DELETE, FOR EACH STATEMENT: `pg_advisory_xact_lock(904202607)` до row locks, действует до конца transaction. При переносе соблюдать тот же lock ID/order. | [M21:180](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L180), [M21:190](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L190) |
| `prevent_department_hierarchy_cycle` / `departments_prevent_hierarchy_cycle` | BEFORE INSERT/UPDATE OF `parentId`, FOR EACH ROW: self-parent и recursive ancestor cycle дают SQLSTATE `23514`; NULL parent разрешён. | [M21:197](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L197), [M21:234](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L234) |
| `prevent_document_version_mutation` / `document_versions_immutable` | BEFORE UPDATE/DELETE каждой version: всегда ошибка SQLSTATE `55000`; SQL-side immutability, включая DML вне ORM. | [M23:127](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L127), [M23:137](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L137) |
| `ensure_document_current_version` / `documents_current_version_exists` | AFTER INSERT/UPDATE OF `currentVersion` на documents; CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED: к transaction-end должна существовать `(documentId, versionNumber=currentVersion)`, иначе `23514`. Document и version создаются в одной transaction. | [M23:142](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L142), [M23:160](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L160) |

Следствия SQL, требующие отдельного runtime-теста на копии: immutable-trigger versions также перехватывает каскадное удаление versions при DELETE document, несмотря на FK `ON DELETE CASCADE`; каскадные UPDATE version columns тоже могут блокироваться. `payroll_periods.closedById ON DELETE SET NULL` конфликтует с CHECK закрытого периода, требующим non-NULL closedById: удаление такого user может быть отклонено. Это выводы из комбинации DDL, а не проверенные запуски.

В этих 41 SQL-файлах нет CREATE EXTENSION, RLS policy, views/materialized views, exclusion constraints, explicit GRANT/REVOKE или DB-trigger для `AuditLog` immutability. `plpgsql`, MD5, random/clock_timestamp и advisory lock используют встроенные возможности PostgreSQL. Отсутствие в файлах не доказывает отсутствие объектов в конкретной БД. Аудит нельзя объявлять append-only на уровне текущего SQL: DB-защиты UPDATE/DELETE audit_logs в миграциях нет.

## Исторические data/backfill операции

Эти SQL-команды объясняют IDs и данные существующей схемы. Baseline для пустой БД должен создать эквивалентные DDL-объекты, а не повторять преобразования legacy-данных поверх текущей копии.

| Миграция/строки | Операция |
|---|---|
| [M15:4](../../prisma/migrations/20260406121000_add_employee_employment_rate/migration.sql#L4) | `employees.employmentRate` копируется из связанного staff_schedule.rate через COALESCE; default остаётся 1.00. |
| [M19:23](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L23) | audit_logs.details TEXT преобразуется в JSONB `{message: legacy_text}`; userId без users-row очищается до NULL перед FK. |
| [M19:55](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L55) | Asset holdings создаются из legacy assets.quantity/molId с `holding_<md5>` IDs. |
| [M19:86](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L86) | Preflight DO прерывает миграцию при дубликатах finance cells с NULL projectId; затем создаётся partial unique. |
| [M21:28](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L28) | Departments выводятся из legacy department strings с LOWER/BTRIM, deterministic `dept_<md5>` IDs; пустые значения уходят в inactive placeholder с ID `dept_unassigned`, collision-safe code/name. |
| [M21:100](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L100) | `departmentId` заполняется для employees/staff_schedule/mols, текстовые snapshots приводятся к canonical department name; preflight NULL-check, затем NOT NULL/FK. Это backfill, постоянного snapshot-sync trigger нет. |
| [M22:84](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L84) | Legacy users.role переносится в user_role_assignments: ADMIN → ADMIN ALL/ALL; EDITOR → HR ALL/NONE, ACCOUNTANT ALL/ALL, PROJECT_MANAGER NONE/ALL, ASSET_CUSTODIAN ALL/NONE; VIEWER → AUDITOR ALL/ALL. IDs `legacy-<md5>`; compatibility users.role остаётся. |
| [M26:59](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L59) | mols.employeeId backfill только при единственном совпадении fullName + departmentId с обеих сторон. |

## Полный реестр моделей

В каждой таблице «SQL NULL» означает физическую допускаемость NULL в реконструированном DDL. «PG default» — server-side default; «Prisma» — client-side declarations. Все FK используют `ON UPDATE CASCADE`; значения `onDelete` перечислены явно. Автоматические PK indexes не входят в отдельный счёт 132 indexes. Все перечисленные CREATE INDEX без USING используют btree по умолчанию.

### Mol → `mols`

Prisma: [P:10](../../prisma/schema.prisma#L10). CREATE TABLE: [M01:8](../../prisma/migrations/20260213133657_init/migration.sql#L8). PK: `mols_pkey` (`id`), [M01:17](../../prisma/migrations/20260213133657_init/migration.sql#L17).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:11](../../prisma/schema.prisma#L11), [M01:9](../../prisma/migrations/20260213133657_init/migration.sql#L9) |
| `code` | `String` | `TEXT` | нет | — | — | [P:12](../../prisma/schema.prisma#L12), [M01:10](../../prisma/migrations/20260213133657_init/migration.sql#L10) |
| `department` | `String` | `TEXT` | нет | — | — | [P:13](../../prisma/schema.prisma#L13), [M01:11](../../prisma/migrations/20260213133657_init/migration.sql#L11) |
| `departmentId` | `String` | `TEXT` | нет | — | — | [P:14](../../prisma/schema.prisma#L14), [M21:102](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L102), [M21:151](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L151) |
| `fullName` | `String` | `TEXT` | нет | — | — | [P:16](../../prisma/schema.prisma#L16), [M01:12](../../prisma/migrations/20260213133657_init/migration.sql#L12) |
| `storageLocation` | `String` | `TEXT` | нет | — | — | [P:17](../../prisma/schema.prisma#L17), [M01:13](../../prisma/migrations/20260213133657_init/migration.sql#L13) |
| `photo` | `String?` | `TEXT` | да | — | — | [P:18](../../prisma/schema.prisma#L18), [M03:2](../../prisma/migrations/20260214082146_add_mol_photo/migration.sql#L2) |
| `employeeId` | `String?` | `TEXT` | да | — | — | [P:19](../../prisma/schema.prisma#L19), [M26:9](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L9) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:21](../../prisma/schema.prisma#L21), [M01:14](../../prisma/migrations/20260213133657_init/migration.sql#L14) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:22](../../prisma/schema.prisma#L22), [M01:15](../../prisma/migrations/20260213133657_init/migration.sql#L15) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `mols_departmentId_fkey` | `departmentId` → `departments(id)` | RESTRICT / CASCADE | [M21:174](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L174) |
| `mols_employeeId_fkey` | `employeeId` → `employees(id)` | SET NULL / CASCADE | [M26:44](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L44) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `mols_code_key` | да | `"code"` | есть | [M01:97](../../prisma/migrations/20260213133657_init/migration.sql#L97) |
| `mols_departmentId_idx` | нет | `"departmentId"` | есть | [M21:155](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L155) |
| `mols_employeeId_key` | да | `"employeeId"` | есть | [M26:41](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L41) |

SQL CHECK: нет.

### Department → `departments`

Prisma: [P:34](../../prisma/schema.prisma#L34). CREATE TABLE: [M21:6](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L6). PK: `departments_pkey` (`id`), [M21:16](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L16).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:35](../../prisma/schema.prisma#L35), [M21:7](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L7) |
| `code` | `String` | `TEXT` | нет | — | — | [P:36](../../prisma/schema.prisma#L36), [M21:8](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L8) |
| `name` | `String` | `TEXT` | нет | — | — | [P:37](../../prisma/schema.prisma#L37), [M21:9](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L9) |
| `parentId` | `String?` | `TEXT` | да | — | — | [P:38](../../prisma/schema.prisma#L38), [M21:10](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L10) |
| `headEmployeeId` | `String?` | `TEXT` | да | — | — | [P:41](../../prisma/schema.prisma#L41), [M21:11](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L11) |
| `isActive` | `Boolean` | `BOOLEAN` | нет | `true` | `@default(true)` | [P:43](../../prisma/schema.prisma#L43), [M21:12](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L12) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:44](../../prisma/schema.prisma#L44), [M21:13](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L13) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:45](../../prisma/schema.prisma#L45), [M21:14](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L14) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `departments_parentId_fkey` | `parentId` → `departments(id)` | RESTRICT / CASCADE | [M21:158](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L158) |
| `departments_headEmployeeId_fkey` | `headEmployeeId` → `employees(id)` | SET NULL / CASCADE | [M21:162](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L162) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `departments_code_key` | да | `"code"` | есть | [M21:20](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L20) |
| `departments_name_key` | да | `"name"` | есть | [M21:21](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L21) |
| `departments_code_ci_key` | да | `LOWER("code")` | raw SQL | [M21:22](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L22) |
| `departments_name_ci_key` | да | `LOWER("name")` | raw SQL | [M21:23](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L23) |
| `departments_parentId_idx` | нет | `"parentId"` | есть | [M21:24](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L24) |
| `departments_headEmployeeId_idx` | нет | `"headEmployeeId"` | есть | [M21:25](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L25) |
| `departments_isActive_name_idx` | нет | `"isActive", "name"` | есть | [M21:26](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L26) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `departments_parent_not_self` | `"parentId" IS NULL OR "parentId" <> "id"` | [M21:17](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L17) |

Triggers: `departments_acquire_mutation_lock` ([M21:190](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L190)), `departments_prevent_hierarchy_cycle` ([M21:234](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L234)).

### AssetGroup → `asset_groups`

Prisma: [P:58](../../prisma/schema.prisma#L58). CREATE TABLE: [M01:21](../../prisma/migrations/20260213133657_init/migration.sql#L21). PK: `asset_groups_pkey` (`id`), [M01:29](../../prisma/migrations/20260213133657_init/migration.sql#L29).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:59](../../prisma/schema.prisma#L59), [M01:22](../../prisma/migrations/20260213133657_init/migration.sql#L22) |
| `name` | `String` | `TEXT` | нет | — | — | [P:60](../../prisma/schema.prisma#L60), [M01:23](../../prisma/migrations/20260213133657_init/migration.sql#L23) |
| `code` | `String` | `TEXT` | нет | — | — | [P:61](../../prisma/schema.prisma#L61), [M01:24](../../prisma/migrations/20260213133657_init/migration.sql#L24) |
| `description` | `String?` | `TEXT` | да | — | — | [P:62](../../prisma/schema.prisma#L62), [M01:25](../../prisma/migrations/20260213133657_init/migration.sql#L25) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:63](../../prisma/schema.prisma#L63), [M01:26](../../prisma/migrations/20260213133657_init/migration.sql#L26) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:64](../../prisma/schema.prisma#L64), [M01:27](../../prisma/migrations/20260213133657_init/migration.sql#L27) |

FK: нет.

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `asset_groups_name_key` | да | `"name"` | есть | [M01:100](../../prisma/migrations/20260213133657_init/migration.sql#L100) |
| `asset_groups_code_key` | да | `"code"` | есть | [M01:103](../../prisma/migrations/20260213133657_init/migration.sql#L103) |

SQL CHECK: нет.

### Asset → `assets`

Prisma: [P:72](../../prisma/schema.prisma#L72). CREATE TABLE: [M01:33](../../prisma/migrations/20260213133657_init/migration.sql#L33). PK: `assets_pkey` (`id`), [M01:58](../../prisma/migrations/20260213133657_init/migration.sql#L58).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:73](../../prisma/schema.prisma#L73), [M01:34](../../prisma/migrations/20260213133657_init/migration.sql#L34) |
| `orderNumber` | `Int` | `SERIAL` | нет | implicit `nextval('"assets_orderNumber_seq"'::regclass)` | `@default(autoincrement())` | [P:74](../../prisma/schema.prisma#L74), [M01:35](../../prisma/migrations/20260213133657_init/migration.sql#L35) |
| `name` | `String` | `TEXT` | нет | — | — | [P:75](../../prisma/schema.prisma#L75), [M01:36](../../prisma/migrations/20260213133657_init/migration.sql#L36) |
| `inventoryNumber` | `String` | `TEXT` | нет | — | — | [P:76](../../prisma/schema.prisma#L76), [M01:37](../../prisma/migrations/20260213133657_init/migration.sql#L37) |
| `unitPrice` | `Decimal` | `DECIMAL(10,2)` | нет | — | — | [P:77](../../prisma/schema.prisma#L77), [M01:38](../../prisma/migrations/20260213133657_init/migration.sql#L38) |
| `unitOfMeasure` | `String` | `TEXT` | нет | — | — | [P:78](../../prisma/schema.prisma#L78), [M01:39](../../prisma/migrations/20260213133657_init/migration.sql#L39) |
| `quantity` | `Decimal` | `DECIMAL(10,2)` | нет | — | — | [P:79](../../prisma/schema.prisma#L79), [M01:40](../../prisma/migrations/20260213133657_init/migration.sql#L40) |
| `totalCost` | `Decimal` | `DECIMAL(12,2)` | нет | — | — | [P:80](../../prisma/schema.prisma#L80), [M01:41](../../prisma/migrations/20260213133657_init/migration.sql#L41) |
| `initialCost` | `Decimal` | `DECIMAL(12,2)` | нет | `0` | `@default(0)` | [P:81](../../prisma/schema.prisma#L81), [M34:2](../../prisma/migrations/20260719075920_add_depreciation_and_revenue/migration.sql#L2) |
| `usefulLifeMonths` | `Int` | `INTEGER` | нет | `60` | `@default(60)` | [P:82](../../prisma/schema.prisma#L82), [M34:3](../../prisma/migrations/20260719075920_add_depreciation_and_revenue/migration.sql#L3) |
| `molId` | `String` | `TEXT` | нет | — | — | [P:84](../../prisma/schema.prisma#L84), [M01:42](../../prisma/migrations/20260213133657_init/migration.sql#L42) |
| `groupId` | `String` | `TEXT` | нет | — | — | [P:87](../../prisma/schema.prisma#L87), [M01:43](../../prisma/migrations/20260213133657_init/migration.sql#L43) |
| `projectId` | `String?` | `TEXT` | да | — | — | [P:91](../../prisma/schema.prisma#L91), [M04:8](../../prisma/migrations/20260219195204_add_projects/migration.sql#L8) |
| `contractCode` | `String?` | `TEXT` | да | — | — | [P:95](../../prisma/schema.prisma#L95), [M01:44](../../prisma/migrations/20260213133657_init/migration.sql#L44) |
| `internalFundingCode` | `String?` | `TEXT` | да | — | — | [P:96](../../prisma/schema.prisma#L96), [M01:45](../../prisma/migrations/20260213133657_init/migration.sql#L45) |
| `isExistingAsset` | `Boolean` | `BOOLEAN` | нет | `false` | `@default(false)` | [P:97](../../prisma/schema.prisma#L97), [M01:46](../../prisma/migrations/20260213133657_init/migration.sql#L46) |
| `recordingDate` | `DateTime` | `TIMESTAMP(3)` | нет | — | — | [P:100](../../prisma/schema.prisma#L100), [M01:47](../../prisma/migrations/20260213133657_init/migration.sql#L47) |
| `documentType` | `String` | `TEXT` | нет | — | — | [P:101](../../prisma/schema.prisma#L101), [M01:48](../../prisma/migrations/20260213133657_init/migration.sql#L48) |
| `documentDetails` | `String` | `TEXT` | нет | — | — | [P:102](../../prisma/schema.prisma#L102), [M01:49](../../prisma/migrations/20260213133657_init/migration.sql#L49) |
| `documentFiles` | `String[]` | `TEXT[]` | да | `ARRAY[]::TEXT[]` | `@default([])`; `Prisma list non-null` | [P:105](../../prisma/schema.prisma#L105), [M01:50](../../prisma/migrations/20260213133657_init/migration.sql#L50) |
| `status` | `AssetStatus` | `"asset_status"` | нет | `'IN_STOCK'` | `@default(IN_STOCK)` | [P:108](../../prisma/schema.prisma#L108), [M01:51](../../prisma/migrations/20260213133657_init/migration.sql#L51) |
| `isArchived` | `Boolean` | `BOOLEAN` | нет | `false` | `@default(false)` | [P:111](../../prisma/schema.prisma#L111), [M01:52](../../prisma/migrations/20260213133657_init/migration.sql#L52) |
| `plannedDisposalDate` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:114](../../prisma/schema.prisma#L114), [M01:53](../../prisma/migrations/20260213133657_init/migration.sql#L53) |
| `plannedDisposalReason` | `String?` | `TEXT` | да | — | — | [P:115](../../prisma/schema.prisma#L115), [M01:54](../../prisma/migrations/20260213133657_init/migration.sql#L54) |
| `photos` | `String[]` | `TEXT[]` | да | `ARRAY[]::TEXT[]` | `@default([])`; `Prisma list non-null` | [P:118](../../prisma/schema.prisma#L118), [M02:3](../../prisma/migrations/20260214063607_add_photos_and_notes/migration.sql#L3) |
| `notes` | `String?` | `TEXT` | да | — | — | [P:119](../../prisma/schema.prisma#L119), [M02:2](../../prisma/migrations/20260214063607_add_photos_and_notes/migration.sql#L2) |
| `accountingForm` | `String` | `TEXT` | нет | `'145'` | `@default("145")` | [P:122](../../prisma/schema.prisma#L122), [M05:2](../../prisma/migrations/20260219202127_add_accounting_form/migration.sql#L2) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:124](../../prisma/schema.prisma#L124), [M01:55](../../prisma/migrations/20260213133657_init/migration.sql#L55) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:125](../../prisma/schema.prisma#L125), [M01:56](../../prisma/migrations/20260213133657_init/migration.sql#L56) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `assets_molId_fkey` | `molId` → `mols(id)` | RESTRICT / CASCADE | [M01:109](../../prisma/migrations/20260213133657_init/migration.sql#L109) |
| `assets_groupId_fkey` | `groupId` → `asset_groups(id)` | RESTRICT / CASCADE | [M01:112](../../prisma/migrations/20260213133657_init/migration.sql#L112) |
| `assets_projectId_fkey` | `projectId` → `projects(id)` | SET NULL / CASCADE | [M04:53](../../prisma/migrations/20260219195204_add_projects/migration.sql#L53) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `assets_inventoryNumber_key` | да | `"inventoryNumber"` | есть | [M01:106](../../prisma/migrations/20260213133657_init/migration.sql#L106) |
| `assets_molId_idx` | нет | `"molId"` | есть | [M18:8](../../prisma/migrations/20260411164424_test/migration.sql#L8) |
| `assets_groupId_idx` | нет | `"groupId"` | есть | [M18:11](../../prisma/migrations/20260411164424_test/migration.sql#L11) |
| `assets_status_idx` | нет | `"status"` | есть | [M18:14](../../prisma/migrations/20260411164424_test/migration.sql#L14) |
| `assets_isArchived_status_idx` | нет | `"isArchived", "status"` | есть | [M18:17](../../prisma/migrations/20260411164424_test/migration.sql#L17) |
| `assets_projectId_idx` | нет | `"projectId"` | есть | [M18:20](../../prisma/migrations/20260411164424_test/migration.sql#L20) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `assets_quantity_nonnegative` | `"quantity" >= 0` | [M19:105](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L105) |
| `assets_unitPrice_nonnegative` | `"unitPrice" >= 0` | [M19:106](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L106) |
| `assets_totalCost_nonnegative` | `"totalCost" >= 0` | [M19:107](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L107) |

### AssetMaintenance → `asset_maintenance`

Prisma: [P:178](../../prisma/schema.prisma#L178). CREATE TABLE: [M29:19](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L19). PK: `asset_maintenance_pkey` (`id`), [M29:36](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L36).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:179](../../prisma/schema.prisma#L179), [M29:20](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L20) |
| `assetId` | `String` | `TEXT` | нет | — | — | [P:180](../../prisma/schema.prisma#L180), [M29:21](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L21) |
| `type` | `AssetMaintenanceType` | `"asset_maintenance_type"` | нет | — | — | [P:182](../../prisma/schema.prisma#L182), [M29:22](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L22) |
| `status` | `AssetMaintenanceStatus` | `"asset_maintenance_status"` | нет | `'PLANNED'` | `@default(PLANNED)` | [P:183](../../prisma/schema.prisma#L183), [M29:23](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L23) |
| `title` | `String` | `TEXT` | нет | — | — | [P:184](../../prisma/schema.prisma#L184), [M29:24](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L24) |
| `description` | `String?` | `TEXT` | да | — | — | [P:185](../../prisma/schema.prisma#L185), [M29:25](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L25) |
| `scheduledDate` | `DateTime` | `DATE` | нет | — | — | [P:186](../../prisma/schema.prisma#L186), [M29:26](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L26) |
| `startedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:187](../../prisma/schema.prisma#L187), [M29:27](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L27) |
| `completedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:188](../../prisma/schema.prisma#L188), [M29:28](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L28) |
| `nextDueDate` | `DateTime?` | `DATE` | да | — | — | [P:189](../../prisma/schema.prisma#L189), [M29:29](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L29) |
| `provider` | `String?` | `TEXT` | да | — | — | [P:190](../../prisma/schema.prisma#L190), [M29:30](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L30) |
| `cost` | `Decimal` | `DECIMAL(12,2)` | нет | `0` | `@default(0)` | [P:191](../../prisma/schema.prisma#L191), [M29:31](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L31) |
| `result` | `String?` | `TEXT` | да | — | — | [P:192](../../prisma/schema.prisma#L192), [M29:32](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L32) |
| `assetStatusBefore` | `AssetStatus?` | `"asset_status"` | да | — | — | [P:193](../../prisma/schema.prisma#L193), [M29:33](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L33) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:195](../../prisma/schema.prisma#L195), [M29:34](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L34) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:196](../../prisma/schema.prisma#L196), [M29:35](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L35) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `asset_maintenance_assetId_fkey` | `assetId` → `assets(id)` | CASCADE / CASCADE | [M29:48](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L48) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `asset_maintenance_assetId_scheduledDate_idx` | нет | `"assetId", "scheduledDate"` | есть | [M29:40](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L40) |
| `asset_maintenance_status_scheduledDate_idx` | нет | `"status", "scheduledDate"` | есть | [M29:42](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L42) |
| `asset_maintenance_nextDueDate_idx` | нет | `"nextDueDate"` | есть | [M29:44](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L44) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `asset_maintenance_cost_check` | `"cost" >= 0` | [M29:37](../../prisma/migrations/20260718224500_add_asset_lifecycle/migration.sql#L37) |

### Operation → `operations`

Prisma: [P:213](../../prisma/schema.prisma#L213). CREATE TABLE: [M01:62](../../prisma/migrations/20260213133657_init/migration.sql#L62). PK: `operations_pkey` (`id`), [M01:80](../../prisma/migrations/20260213133657_init/migration.sql#L80).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:214](../../prisma/schema.prisma#L214), [M01:63](../../prisma/migrations/20260213133657_init/migration.sql#L63) |
| `type` | `OperationType` | `"operation_type"` | нет | — | — | [P:215](../../prisma/schema.prisma#L215), [M01:64](../../prisma/migrations/20260213133657_init/migration.sql#L64) |
| `assetId` | `String` | `TEXT` | нет | — | — | [P:217](../../prisma/schema.prisma#L217), [M01:65](../../prisma/migrations/20260213133657_init/migration.sql#L65) |
| `fromMolId` | `String?` | `TEXT` | да | — | — | [P:221](../../prisma/schema.prisma#L221), [M01:66](../../prisma/migrations/20260213133657_init/migration.sql#L66) |
| `toMolId` | `String?` | `TEXT` | да | — | — | [P:224](../../prisma/schema.prisma#L224), [M01:67](../../prisma/migrations/20260213133657_init/migration.sql#L67) |
| `quantity` | `Decimal` | `DECIMAL(10,2)` | нет | — | — | [P:228](../../prisma/schema.prisma#L228), [M01:68](../../prisma/migrations/20260213133657_init/migration.sql#L68) |
| `unitPrice` | `Decimal` | `DECIMAL(10,2)` | нет | — | — | [P:229](../../prisma/schema.prisma#L229), [M01:69](../../prisma/migrations/20260213133657_init/migration.sql#L69) |
| `totalCost` | `Decimal` | `DECIMAL(12,2)` | нет | — | — | [P:230](../../prisma/schema.prisma#L230), [M01:70](../../prisma/migrations/20260213133657_init/migration.sql#L70) |
| `date` | `DateTime` | `TIMESTAMP(3)` | нет | — | — | [P:233](../../prisma/schema.prisma#L233), [M01:71](../../prisma/migrations/20260213133657_init/migration.sql#L71) |
| `reason` | `String?` | `TEXT` | да | — | — | [P:234](../../prisma/schema.prisma#L234), [M01:72](../../prisma/migrations/20260213133657_init/migration.sql#L72) |
| `documentType` | `String` | `TEXT` | нет | — | — | [P:235](../../prisma/schema.prisma#L235), [M01:73](../../prisma/migrations/20260213133657_init/migration.sql#L73) |
| `documentDetails` | `String` | `TEXT` | нет | — | — | [P:236](../../prisma/schema.prisma#L236), [M01:74](../../prisma/migrations/20260213133657_init/migration.sql#L74) |
| `documentFiles` | `String[]` | `TEXT[]` | да | `ARRAY[]::TEXT[]` | `@default([])`; `Prisma list non-null` | [P:237](../../prisma/schema.prisma#L237), [M01:75](../../prisma/migrations/20260213133657_init/migration.sql#L75) |
| `oldStatus` | `AssetStatus?` | `"asset_status"` | да | — | — | [P:240](../../prisma/schema.prisma#L240), [M01:76](../../prisma/migrations/20260213133657_init/migration.sql#L76) |
| `newStatus` | `AssetStatus?` | `"asset_status"` | да | — | — | [P:241](../../prisma/schema.prisma#L241), [M01:77](../../prisma/migrations/20260213133657_init/migration.sql#L77) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:243](../../prisma/schema.prisma#L243), [M01:78](../../prisma/migrations/20260213133657_init/migration.sql#L78) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `operations_assetId_fkey` | `assetId` → `assets(id)` | RESTRICT / CASCADE | [M01:115](../../prisma/migrations/20260213133657_init/migration.sql#L115) |
| `operations_fromMolId_fkey` | `fromMolId` → `mols(id)` | SET NULL / CASCADE | [M01:118](../../prisma/migrations/20260213133657_init/migration.sql#L118) |
| `operations_toMolId_fkey` | `toMolId` → `mols(id)` | SET NULL / CASCADE | [M01:121](../../prisma/migrations/20260213133657_init/migration.sql#L121) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `operations_assetId_date_idx` | нет | `"assetId", "date"` | есть | [M19:77](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L77) |
| `operations_type_date_idx` | нет | `"type", "date"` | есть | [M19:78](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L78) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `operations_quantity_valid` | `("type" = 'STATUS_CHANGE' AND "quantity" >= 0) OR ("type" <> 'STATUS_CHANGE' AND "quantity" > 0)` | [M19:113](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L113) |
| `operations_unitPrice_nonnegative` | `"unitPrice" >= 0` | [M19:117](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L117) |
| `operations_totalCost_nonnegative` | `"totalCost" >= 0` | [M19:118](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L118) |

### AssetHolding → `asset_holdings`

Prisma: [P:250](../../prisma/schema.prisma#L250). CREATE TABLE: [M19:45](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L45). PK: `asset_holdings_pkey` (`id`), [M19:52](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L52).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:251](../../prisma/schema.prisma#L251), [M19:46](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L46) |
| `assetId` | `String` | `TEXT` | нет | — | — | [P:252](../../prisma/schema.prisma#L252), [M19:47](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L47) |
| `molId` | `String` | `TEXT` | нет | — | — | [P:254](../../prisma/schema.prisma#L254), [M19:48](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L48) |
| `quantity` | `Decimal` | `DECIMAL(10,2)` | нет | — | — | [P:256](../../prisma/schema.prisma#L256), [M19:49](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L49) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:257](../../prisma/schema.prisma#L257), [M19:50](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L50) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:258](../../prisma/schema.prisma#L258), [M19:51](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L51) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `asset_holdings_assetId_fkey` | `assetId` → `assets(id)` | CASCADE / CASCADE | [M19:71](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L71) |
| `asset_holdings_molId_fkey` | `molId` → `mols(id)` | RESTRICT / CASCADE | [M19:73](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L73) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `asset_holdings_assetId_molId_key` | да | `"assetId", "molId"` | есть | [M19:65](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L65) |
| `asset_holdings_molId_assetId_idx` | нет | `"molId", "assetId"` | есть | [M19:67](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L67) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `asset_holdings_quantity_nonnegative` | `"quantity" >= 0` | [M19:110](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L110) |

### AssetInventory → `asset_inventories`

Prisma: [P:265](../../prisma/schema.prisma#L265). CREATE TABLE: [M38:3](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L3). PK: `asset_inventories_pkey` (`id`), [M38:12](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L12).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:266](../../prisma/schema.prisma#L266), [M38:4](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L4) |
| `name` | `String` | `TEXT` | нет | — | — | [P:267](../../prisma/schema.prisma#L267), [M38:5](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L5) |
| `status` | `AssetInventoryStatus` | `"asset_inventory_status"` | нет | `'IN_PROGRESS'` | `@default(IN_PROGRESS)` | [P:268](../../prisma/schema.prisma#L268), [M38:6](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L6) |
| `molId` | `String` | `TEXT` | нет | — | — | [P:269](../../prisma/schema.prisma#L269), [M38:7](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L7) |
| `createdById` | `String` | `TEXT` | нет | — | — | [P:271](../../prisma/schema.prisma#L271), [M38:8](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L8) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:273](../../prisma/schema.prisma#L273), [M38:9](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L9) |
| `completedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:274](../../prisma/schema.prisma#L274), [M38:10](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L10) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `asset_inventories_molId_fkey` | `molId` → `mols(id)` | RESTRICT / CASCADE | [M38:43](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L43) |
| `asset_inventories_createdById_fkey` | `createdById` → `users(id)` | RESTRICT / CASCADE | [M38:48](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L48) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `asset_inventories_molId_status_createdAt_idx` | нет | `"molId", "status", "createdAt"` | есть | [M38:33](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L33) |

SQL CHECK: нет.

### AssetInventoryEntry → `asset_inventory_entries`

Prisma: [P:281](../../prisma/schema.prisma#L281). CREATE TABLE: [M38:15](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L15). PK: `asset_inventory_entries_pkey` (`id`), [M38:30](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L30).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:282](../../prisma/schema.prisma#L282), [M38:16](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L16) |
| `inventoryId` | `String` | `TEXT` | нет | — | — | [P:283](../../prisma/schema.prisma#L283), [M38:17](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L17) |
| `assetId` | `String?` | `TEXT` | да | — | — | [P:285](../../prisma/schema.prisma#L285), [M38:18](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L18) |
| `inventoryNumber` | `String` | `TEXT` | нет | — | — | [P:287](../../prisma/schema.prisma#L287), [M38:19](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L19) |
| `assetName` | `String` | `TEXT` | нет | — | — | [P:288](../../prisma/schema.prisma#L288), [M38:20](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L20) |
| `unitOfMeasure` | `String` | `TEXT` | нет | — | — | [P:289](../../prisma/schema.prisma#L289), [M38:21](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L21) |
| `expectedQuantity` | `Decimal` | `DECIMAL(10,2)` | нет | — | — | [P:290](../../prisma/schema.prisma#L290), [M38:22](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L22) |
| `foundQuantity` | `Decimal?` | `DECIMAL(10,2)` | да | — | — | [P:291](../../prisma/schema.prisma#L291), [M38:23](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L23) |
| `note` | `String?` | `TEXT` | да | — | — | [P:292](../../prisma/schema.prisma#L292), [M38:24](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L24) |
| `scannedById` | `String?` | `TEXT` | да | — | — | [P:293](../../prisma/schema.prisma#L293), [M38:25](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L25) |
| `scannedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:295](../../prisma/schema.prisma#L295), [M38:26](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L26) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:296](../../prisma/schema.prisma#L296), [M38:27](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L27) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:297](../../prisma/schema.prisma#L297), [M38:28](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L28) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `asset_inventory_entries_inventoryId_fkey` | `inventoryId` → `asset_inventories(id)` | CASCADE / CASCADE | [M38:53](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L53) |
| `asset_inventory_entries_assetId_fkey` | `assetId` → `assets(id)` | SET NULL / CASCADE | [M38:58](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L58) |
| `asset_inventory_entries_scannedById_fkey` | `scannedById` → `users(id)` | SET NULL / CASCADE | [M38:63](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L63) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `asset_inventory_entries_inventoryId_inventoryNumber_key` | да | `"inventoryId", "inventoryNumber"` | есть | [M38:36](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L36) |
| `asset_inventory_entries_inventoryId_scannedAt_idx` | нет | `"inventoryId", "scannedAt"` | есть | [M38:39](../../prisma/migrations/20260924200000_add_asset_inventory/migration.sql#L39) |

SQL CHECK: нет.

### User → `users`

Prisma: [P:334](../../prisma/schema.prisma#L334). CREATE TABLE: [M19:4](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L4). PK: `users_pkey` (`id`), [M19:17](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L17).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:335](../../prisma/schema.prisma#L335), [M19:5](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L5) |
| `username` | `String` | `TEXT` | нет | — | — | [P:336](../../prisma/schema.prisma#L336), [M19:6](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L6) |
| `name` | `String` | `TEXT` | нет | — | — | [P:337](../../prisma/schema.prisma#L337), [M19:7](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L7) |
| `passwordHash` | `String` | `TEXT` | нет | — | — | [P:338](../../prisma/schema.prisma#L338), [M19:8](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L8) |
| `role` | `UserRole` | `"user_role"` | нет | `'VIEWER'` | `@default(VIEWER)` | [P:339](../../prisma/schema.prisma#L339), [M19:9](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L9) |
| `isActive` | `Boolean` | `BOOLEAN` | нет | `true` | `@default(true)` | [P:340](../../prisma/schema.prisma#L340), [M19:10](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L10) |
| `mustChangePassword` | `Boolean` | `BOOLEAN` | нет | `true` | `@default(true)` | [P:341](../../prisma/schema.prisma#L341), [M19:11](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L11) |
| `sessionVersion` | `Int` | `INTEGER` | нет | `1` | `@default(1)` | [P:342](../../prisma/schema.prisma#L342), [M22:18](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L18) |
| `passwordChangedAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:343](../../prisma/schema.prisma#L343), [M22:19](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L19) |
| `failedLoginAttempts` | `Int` | `INTEGER` | нет | `0` | `@default(0)` | [P:344](../../prisma/schema.prisma#L344), [M19:12](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L12) |
| `lockedUntil` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:345](../../prisma/schema.prisma#L345), [M19:13](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L13) |
| `lastLoginAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:346](../../prisma/schema.prisma#L346), [M19:14](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L14) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:347](../../prisma/schema.prisma#L347), [M19:15](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L15) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:348](../../prisma/schema.prisma#L348), [M19:16](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L16) |
| `employeeId` | `String?` | `TEXT` | да | — | — | [P:350](../../prisma/schema.prisma#L350), [M22:17](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L17) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `users_employeeId_fkey` | `employeeId` → `employees(id)` | SET NULL / CASCADE | [M22:66](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L66) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `users_username_key` | да | `"username"` | есть | [M19:20](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L20) |
| `users_isActive_role_idx` | нет | `"isActive", "role"` | есть | [M19:21](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L21) |
| `users_employeeId_key` | да | `"employeeId"` | есть | [M22:20](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L20) |

SQL CHECK: нет.

### UserRoleAssignment → `user_role_assignments`

Prisma: [P:375](../../prisma/schema.prisma#L375). CREATE TABLE: [M22:22](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L22). PK: `user_role_assignments_pkey` (`id`), [M22:31](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L31).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:376](../../prisma/schema.prisma#L376), [M22:23](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L23) |
| `userId` | `String` | `TEXT` | нет | — | — | [P:377](../../prisma/schema.prisma#L377), [M22:24](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L24) |
| `role` | `AppRole` | `"app_role"` | нет | — | — | [P:379](../../prisma/schema.prisma#L379), [M22:25](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L25) |
| `departmentScopeMode` | `ScopeMode` | `"scope_mode"` | нет | `'NONE'` | `@default(NONE)` | [P:380](../../prisma/schema.prisma#L380), [M22:26](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L26) |
| `projectScopeMode` | `ScopeMode` | `"scope_mode"` | нет | `'NONE'` | `@default(NONE)` | [P:381](../../prisma/schema.prisma#L381), [M22:27](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L27) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:382](../../prisma/schema.prisma#L382), [M22:28](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L28) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:383](../../prisma/schema.prisma#L383), [M22:29](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L29) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `user_role_assignments_userId_fkey` | `userId` → `users(id)` | CASCADE / CASCADE | [M22:69](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L69) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `user_role_assignments_userId_role_key` | да | `"userId", "role"` | есть | [M22:52](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L52) |
| `user_role_assignments_userId_role_idx` | нет | `"userId", "role"` | есть | [M22:54](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L54) |

SQL CHECK: нет.

### UserDepartmentScope → `user_department_scopes`

Prisma: [P:393](../../prisma/schema.prisma#L393). CREATE TABLE: [M22:34](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L34). PK: `user_department_scopes_pkey` (`id`), [M22:40](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L40).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:394](../../prisma/schema.prisma#L394), [M22:35](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L35) |
| `roleAssignmentId` | `String` | `TEXT` | нет | — | — | [P:395](../../prisma/schema.prisma#L395), [M22:36](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L36) |
| `departmentId` | `String` | `TEXT` | нет | — | — | [P:397](../../prisma/schema.prisma#L397), [M22:37](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L37) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:399](../../prisma/schema.prisma#L399), [M22:38](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L38) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `user_department_scopes_roleAssignmentId_fkey` | `roleAssignmentId` → `user_role_assignments(id)` | CASCADE / CASCADE | [M22:72](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L72) |
| `user_department_scopes_departmentId_fkey` | `departmentId` → `departments(id)` | CASCADE / CASCADE | [M22:75](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L75) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `user_department_scopes_roleAssignmentId_departmentId_key` | да | `"roleAssignmentId", "departmentId"` | есть | [M22:56](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L56) |
| `user_department_scopes_departmentId_roleAssignmentId_idx` | нет | `"departmentId", "roleAssignmentId"` | есть | [M22:58](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L58) |

SQL CHECK: нет.

### UserProjectScope → `user_project_scopes`

Prisma: [P:406](../../prisma/schema.prisma#L406). CREATE TABLE: [M22:43](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L43). PK: `user_project_scopes_pkey` (`id`), [M22:49](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L49).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:407](../../prisma/schema.prisma#L407), [M22:44](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L44) |
| `roleAssignmentId` | `String` | `TEXT` | нет | — | — | [P:408](../../prisma/schema.prisma#L408), [M22:45](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L45) |
| `projectId` | `String` | `TEXT` | нет | — | — | [P:410](../../prisma/schema.prisma#L410), [M22:46](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L46) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:412](../../prisma/schema.prisma#L412), [M22:47](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L47) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `user_project_scopes_roleAssignmentId_fkey` | `roleAssignmentId` → `user_role_assignments(id)` | CASCADE / CASCADE | [M22:78](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L78) |
| `user_project_scopes_projectId_fkey` | `projectId` → `projects(id)` | CASCADE / CASCADE | [M22:81](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L81) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `user_project_scopes_roleAssignmentId_projectId_key` | да | `"roleAssignmentId", "projectId"` | есть | [M22:60](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L60) |
| `user_project_scopes_projectId_roleAssignmentId_idx` | нет | `"projectId", "roleAssignmentId"` | есть | [M22:62](../../prisma/migrations/20260718090200_add_scoped_role_assignments/migration.sql#L62) |

SQL CHECK: нет.

### AuditLog → `audit_logs`

Prisma: [P:419](../../prisma/schema.prisma#L419). CREATE TABLE: [M01:84](../../prisma/migrations/20260213133657_init/migration.sql#L84). PK: `audit_logs_pkey` (`id`), [M01:93](../../prisma/migrations/20260213133657_init/migration.sql#L93).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:420](../../prisma/schema.prisma#L420), [M01:85](../../prisma/migrations/20260213133657_init/migration.sql#L85) |
| `userId` | `String?` | `TEXT` | да | — | — | [P:421](../../prisma/schema.prisma#L421), [M01:86](../../prisma/migrations/20260213133657_init/migration.sql#L86) |
| `action` | `String` | `TEXT` | нет | — | — | [P:423](../../prisma/schema.prisma#L423), [M01:87](../../prisma/migrations/20260213133657_init/migration.sql#L87) |
| `entityType` | `String` | `TEXT` | нет | — | — | [P:424](../../prisma/schema.prisma#L424), [M01:88](../../prisma/migrations/20260213133657_init/migration.sql#L88) |
| `entityId` | `String` | `TEXT` | нет | — | — | [P:425](../../prisma/schema.prisma#L425), [M01:89](../../prisma/migrations/20260213133657_init/migration.sql#L89) |
| `details` | `Json?` | `JSONB` | да | — | — | [P:426](../../prisma/schema.prisma#L426), [M01:90](../../prisma/migrations/20260213133657_init/migration.sql#L90), [M19:25](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L25) |
| `requestId` | `String?` | `TEXT` | да | — | — | [P:427](../../prisma/schema.prisma#L427), [M19:24](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L24) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:428](../../prisma/schema.prisma#L428), [M01:91](../../prisma/migrations/20260213133657_init/migration.sql#L91) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `audit_logs_userId_fkey` | `userId` → `users(id)` | SET NULL / CASCADE | [M19:37](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L37) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `audit_logs_userId_createdAt_idx` | нет | `"userId", "createdAt"` | есть | [M19:40](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L40) |
| `audit_logs_entityType_entityId_createdAt_idx` | нет | `"entityType", "entityId", "createdAt"` | есть | [M19:41](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L41) |

SQL CHECK: нет.

### Notification → `notifications`

Prisma: [P:465](../../prisma/schema.prisma#L465). CREATE TABLE: [M24:19](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L19). PK: `notifications_pkey` (`id`), [M24:33](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L33).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:466](../../prisma/schema.prisma#L466), [M24:20](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L20) |
| `userId` | `String` | `TEXT` | нет | — | — | [P:467](../../prisma/schema.prisma#L467), [M24:21](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L21) |
| `eventType` | `NotificationEventType` | `"notification_event_type"` | нет | — | — | [P:469](../../prisma/schema.prisma#L469), [M24:22](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L22) |
| `channel` | `NotificationChannel` | `"notification_channel"` | нет | — | — | [P:470](../../prisma/schema.prisma#L470), [M24:23](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L23) |
| `title` | `String` | `TEXT` | нет | — | — | [P:471](../../prisma/schema.prisma#L471), [M24:24](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L24) |
| `body` | `String` | `TEXT` | нет | — | — | [P:472](../../prisma/schema.prisma#L472), [M24:25](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L25) |
| `targetUrl` | `String?` | `TEXT` | да | — | — | [P:473](../../prisma/schema.prisma#L473), [M24:26](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L26) |
| `entityType` | `String?` | `TEXT` | да | — | — | [P:474](../../prisma/schema.prisma#L474), [M24:27](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L27) |
| `entityId` | `String?` | `TEXT` | да | — | — | [P:475](../../prisma/schema.prisma#L475), [M24:28](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L28) |
| `dedupeKey` | `String` | `TEXT` | нет | — | — | [P:476](../../prisma/schema.prisma#L476), [M24:29](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L29) |
| `readAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:477](../../prisma/schema.prisma#L477), [M24:30](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L30) |
| `deletedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:478](../../prisma/schema.prisma#L478), [M24:31](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L31) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:479](../../prisma/schema.prisma#L479), [M24:32](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L32) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `notifications_userId_fkey` | `userId` → `users(id)` | CASCADE / CASCADE | [M24:86](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L86) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `notifications_userId_dedupeKey_channel_key` | да | `"userId", "dedupeKey", "channel"` | есть | [M24:66](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L66) |
| `notifications_userId_channel_deletedAt_readAt_createdAt_idx` | нет | `"userId", "channel", "deletedAt", "readAt", "createdAt"` | есть | [M24:68](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L68) |
| `notifications_eventType_createdAt_idx` | нет | `"eventType", "createdAt"` | есть | [M24:70](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L70) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `notifications_title_not_blank` | `length(btrim("title")) > 0` | [M24:34](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L34) |
| `notifications_dedupe_key_not_blank` | `length(btrim("dedupeKey")) > 0` | [M24:35](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L35) |
| `notifications_read_at_in_app_only` | `"readAt" IS NULL OR "channel" = 'IN_APP'` | [M24:36](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L36) |

### NotificationPreference → `notification_preferences`

Prisma: [P:488](../../prisma/schema.prisma#L488). CREATE TABLE: [M24:39](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L39). PK: `notification_preferences_pkey` (`id`), [M24:47](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L47).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:489](../../prisma/schema.prisma#L489), [M24:40](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L40) |
| `userId` | `String` | `TEXT` | нет | — | — | [P:490](../../prisma/schema.prisma#L490), [M24:41](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L41) |
| `eventType` | `NotificationEventType` | `"notification_event_type"` | нет | — | — | [P:492](../../prisma/schema.prisma#L492), [M24:42](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L42) |
| `channel` | `NotificationChannel` | `"notification_channel"` | нет | — | — | [P:493](../../prisma/schema.prisma#L493), [M24:43](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L43) |
| `enabled` | `Boolean` | `BOOLEAN` | нет | `true` | `@default(true)` | [P:494](../../prisma/schema.prisma#L494), [M24:44](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L44) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:495](../../prisma/schema.prisma#L495), [M24:45](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L45) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:496](../../prisma/schema.prisma#L496), [M24:46](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L46) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `notification_preferences_userId_fkey` | `userId` → `users(id)` | CASCADE / CASCADE | [M24:90](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L90) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `notification_preferences_userId_eventType_channel_key` | да | `"userId", "eventType", "channel"` | есть | [M24:73](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L73) |
| `notification_preferences_userId_channel_idx` | нет | `"userId", "channel"` | есть | [M24:75](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L75) |

SQL CHECK: нет.

### NotificationOutbox → `notification_outbox`

Prisma: [P:503](../../prisma/schema.prisma#L503). CREATE TABLE: [M24:50](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L50). PK: `notification_outbox_pkey` (`id`), [M24:62](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L62).

Исходный снимок `project1`: `claimToken`, `leaseExpiresAt` и lease index отсутствуют (M39 pending). Ниже полный ожидаемый DDL.

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:504](../../prisma/schema.prisma#L504), [M24:51](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L51) |
| `notificationId` | `String` | `TEXT` | нет | — | — | [P:505](../../prisma/schema.prisma#L505), [M24:52](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L52) |
| `userId` | `String` | `TEXT` | нет | — | — | [P:507](../../prisma/schema.prisma#L507), [M24:53](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L53) |
| `status` | `NotificationOutboxStatus` | `"notification_outbox_status"` | нет | `'PENDING'` | `@default(PENDING)` | [P:509](../../prisma/schema.prisma#L509), [M24:54](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L54) |
| `payload` | `Json` | `JSONB` | нет | — | — | [P:510](../../prisma/schema.prisma#L510), [M24:55](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L55) |
| `attempts` | `Int` | `INTEGER` | нет | `0` | `@default(0)` | [P:511](../../prisma/schema.prisma#L511), [M24:56](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L56) |
| `availableAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:512](../../prisma/schema.prisma#L512), [M24:57](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L57) |
| `claimToken` | `String?` | `TEXT` | да | — | — | [P:513](../../prisma/schema.prisma#L513), [M39:2](../../prisma/migrations/20260925090000_notification_outbox_lease/migration.sql#L2) |
| `leaseExpiresAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:514](../../prisma/schema.prisma#L514), [M39:3](../../prisma/migrations/20260925090000_notification_outbox_lease/migration.sql#L3) |
| `processedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:515](../../prisma/schema.prisma#L515), [M24:58](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L58) |
| `lastError` | `String?` | `TEXT` | да | — | — | [P:516](../../prisma/schema.prisma#L516), [M24:59](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L59) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:517](../../prisma/schema.prisma#L517), [M24:60](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L60) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:518](../../prisma/schema.prisma#L518), [M24:61](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L61) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `notification_outbox_notificationId_fkey` | `notificationId` → `notifications(id)` | CASCADE / CASCADE | [M24:94](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L94) |
| `notification_outbox_userId_fkey` | `userId` → `users(id)` | CASCADE / CASCADE | [M24:96](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L96) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `notification_outbox_notificationId_key` | да | `"notificationId"` | есть | [M24:78](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L78) |
| `notification_outbox_status_availableAt_createdAt_idx` | нет | `"status", "availableAt", "createdAt"` | есть | [M24:80](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L80) |
| `notification_outbox_userId_createdAt_idx` | нет | `"userId", "createdAt"` | есть | [M24:82](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L82) |
| `notification_outbox_status_leaseExpiresAt_idx` | нет | `"status", "leaseExpiresAt"` | есть | [M39:5](../../prisma/migrations/20260925090000_notification_outbox_lease/migration.sql#L5) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `notification_outbox_attempts_nonnegative` | `"attempts" >= 0` | [M24:63](../../prisma/migrations/20260718170000_add_notification_platform/migration.sql#L63) |

### ScheduledAlertRun → `scheduled_alert_runs`

Prisma: [P:526](../../prisma/schema.prisma#L526). CREATE TABLE: [M40:1](../../prisma/migrations/20260925120000_add_scheduled_alert_runs/migration.sql#L1). PK: `scheduled_alert_runs_pkey` (`key`), [M40:7](../../prisma/migrations/20260925120000_add_scheduled_alert_runs/migration.sql#L7).

Исходный снимок `project1`: таблица отсутствует, соответствующая миграция pending. Ниже полный ожидаемый DDL после её применения на копии.

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `key` | `String` | `TEXT` | нет | — | `PK` | [P:527](../../prisma/schema.prisma#L527), [M40:2](../../prisma/migrations/20260925120000_add_scheduled_alert_runs/migration.sql#L2) |
| `lastStartedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:528](../../prisma/schema.prisma#L528), [M40:3](../../prisma/migrations/20260925120000_add_scheduled_alert_runs/migration.sql#L3) |
| `lastSucceededAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:529](../../prisma/schema.prisma#L529), [M40:4](../../prisma/migrations/20260925120000_add_scheduled_alert_runs/migration.sql#L4) |
| `lastError` | `String?` | `TEXT` | да | — | — | [P:530](../../prisma/schema.prisma#L530), [M40:5](../../prisma/migrations/20260925120000_add_scheduled_alert_runs/migration.sql#L5) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:531](../../prisma/schema.prisma#L531), [M40:6](../../prisma/migrations/20260925120000_add_scheduled_alert_runs/migration.sql#L6) |

FK: нет.

Отдельные unique/index: нет.

SQL CHECK: нет.

### ApprovalRequest → `approval_requests`

Prisma: [P:556](../../prisma/schema.prisma#L556). CREATE TABLE: [M25:13](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L13). PK: `approval_requests_pkey` (`id`), [M25:31](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L31).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:557](../../prisma/schema.prisma#L557), [M25:14](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L14) |
| `title` | `String` | `TEXT` | нет | — | — | [P:558](../../prisma/schema.prisma#L558), [M25:15](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L15) |
| `description` | `String?` | `TEXT` | да | — | — | [P:559](../../prisma/schema.prisma#L559), [M25:16](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L16) |
| `entityType` | `String?` | `TEXT` | да | — | — | [P:560](../../prisma/schema.prisma#L560), [M25:17](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L17) |
| `entityId` | `String?` | `TEXT` | да | — | — | [P:561](../../prisma/schema.prisma#L561), [M25:18](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L18) |
| `status` | `ApprovalRequestStatus` | `"approval_request_status"` | нет | `'DRAFT'` | `@default(DRAFT)` | [P:562](../../prisma/schema.prisma#L562), [M25:19](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L19) |
| `currentStep` | `Int` | `INTEGER` | нет | `0` | `@default(0)` | [P:563](../../prisma/schema.prisma#L563), [M25:20](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L20) |
| `dueAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:564](../../prisma/schema.prisma#L564), [M25:21](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L21) |
| `submittedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:565](../../prisma/schema.prisma#L565), [M25:22](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L22) |
| `completedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:566](../../prisma/schema.prisma#L566), [M25:23](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L23) |
| `lockVersion` | `Int` | `INTEGER` | нет | `1` | `@default(1)` | [P:567](../../prisma/schema.prisma#L567), [M25:24](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L24) |
| `requestedById` | `String` | `TEXT` | нет | — | — | [P:569](../../prisma/schema.prisma#L569), [M25:25](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L25) |
| `documentId` | `String?` | `TEXT` | да | — | — | [P:572](../../prisma/schema.prisma#L572), [M25:26](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L26) |
| `projectId` | `String?` | `TEXT` | да | — | — | [P:575](../../prisma/schema.prisma#L575), [M25:27](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L27) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:580](../../prisma/schema.prisma#L580), [M25:28](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L28) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:581](../../prisma/schema.prisma#L581), [M25:29](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L29) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `approval_requests_requestedById_fkey` | `requestedById` → `users(id)` | RESTRICT / CASCADE | [M25:78](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L78) |
| `approval_requests_documentId_fkey` | `documentId` → `documents(id)` | SET NULL / CASCADE | [M25:81](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L81) |
| `approval_requests_projectId_fkey` | `projectId` → `projects(id)` | SET NULL / CASCADE | [M25:84](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L84) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `approval_requests_requestedById_status_createdAt_idx` | нет | `"requestedById", "status", "createdAt"` | есть | [M25:54](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L54) |
| `approval_requests_status_dueAt_idx` | нет | `"status", "dueAt"` | есть | [M25:57](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L57) |
| `approval_requests_documentId_idx` | нет | `"documentId"` | есть | [M25:60](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L60) |
| `approval_requests_projectId_idx` | нет | `"projectId"` | есть | [M25:63](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L63) |
| `approval_requests_entityType_entityId_idx` | нет | `"entityType", "entityId"` | есть | [M25:66](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L66) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `approval_requests_current_step_check` | `"currentStep" >= 0` | [M25:32](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L32) |
| `approval_requests_lock_version_check` | `"lockVersion" >= 1` | [M25:33](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L33) |

### ApprovalStep → `approval_steps`

Prisma: [P:591](../../prisma/schema.prisma#L591). CREATE TABLE: [M25:37](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L37). PK: `approval_steps_pkey` (`id`), [M25:49](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L49).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:592](../../prisma/schema.prisma#L592), [M25:38](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L38) |
| `sequence` | `Int` | `INTEGER` | нет | — | — | [P:593](../../prisma/schema.prisma#L593), [M25:39](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L39) |
| `name` | `String` | `TEXT` | нет | — | — | [P:594](../../prisma/schema.prisma#L594), [M25:40](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L40) |
| `status` | `ApprovalStepStatus` | `"approval_step_status"` | нет | `'WAITING'` | `@default(WAITING)` | [P:595](../../prisma/schema.prisma#L595), [M25:41](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L41) |
| `comment` | `String?` | `TEXT` | да | — | — | [P:596](../../prisma/schema.prisma#L596), [M25:42](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L42) |
| `decidedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:597](../../prisma/schema.prisma#L597), [M25:43](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L43) |
| `dueDate` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:598](../../prisma/schema.prisma#L598), [M35:2](../../prisma/migrations/20260719080148_add_approval_step_due_dates/migration.sql#L2) |
| `reminderSent` | `Boolean` | `BOOLEAN` | нет | `false` | `@default(false)` | [P:599](../../prisma/schema.prisma#L599), [M35:3](../../prisma/migrations/20260719080148_add_approval_step_due_dates/migration.sql#L3) |
| `requestId` | `String` | `TEXT` | нет | — | — | [P:601](../../prisma/schema.prisma#L601), [M25:44](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L44) |
| `approverId` | `String` | `TEXT` | нет | — | — | [P:604](../../prisma/schema.prisma#L604), [M25:45](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L45) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:607](../../prisma/schema.prisma#L607), [M25:46](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L46) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:608](../../prisma/schema.prisma#L608), [M25:47](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L47) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `approval_steps_requestId_fkey` | `requestId` → `approval_requests(id)` | CASCADE / CASCADE | [M25:87](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L87) |
| `approval_steps_approverId_fkey` | `approverId` → `users(id)` | RESTRICT / CASCADE | [M25:90](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L90) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `approval_steps_approverId_status_createdAt_idx` | нет | `"approverId", "status", "createdAt"` | есть | [M25:69](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L69) |
| `approval_steps_requestId_status_idx` | нет | `"requestId", "status"` | есть | [M25:72](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L72) |
| `approval_steps_requestId_sequence_key` | да | `"requestId", "sequence"` | есть | [M25:75](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L75) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `approval_steps_sequence_check` | `"sequence" > 0` | [M25:50](../../prisma/migrations/20260718183752_add_approval_workflows/migration.sql#L50) |

### ApprovalTemplate → `approval_templates`

Prisma: [P:616](../../prisma/schema.prisma#L616). CREATE TABLE: [M37:1](../../prisma/migrations/20260924180000_add_approval_templates/migration.sql#L1). PK: `approval_templates_pkey` (`id`), [M37:10](../../prisma/migrations/20260924180000_add_approval_templates/migration.sql#L10).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:617](../../prisma/schema.prisma#L617), [M37:2](../../prisma/migrations/20260924180000_add_approval_templates/migration.sql#L2) |
| `name` | `String` | `TEXT` | нет | — | — | [P:618](../../prisma/schema.prisma#L618), [M37:3](../../prisma/migrations/20260924180000_add_approval_templates/migration.sql#L3) |
| `steps` | `Json` | `JSONB` | нет | — | — | [P:619](../../prisma/schema.prisma#L619), [M37:4](../../prisma/migrations/20260924180000_add_approval_templates/migration.sql#L4) |
| `isActive` | `Boolean` | `BOOLEAN` | нет | `true` | `@default(true)` | [P:620](../../prisma/schema.prisma#L620), [M37:5](../../prisma/migrations/20260924180000_add_approval_templates/migration.sql#L5) |
| `createdById` | `String` | `TEXT` | нет | — | — | [P:621](../../prisma/schema.prisma#L621), [M37:6](../../prisma/migrations/20260924180000_add_approval_templates/migration.sql#L6) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:623](../../prisma/schema.prisma#L623), [M37:7](../../prisma/migrations/20260924180000_add_approval_templates/migration.sql#L7) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:624](../../prisma/schema.prisma#L624), [M37:8](../../prisma/migrations/20260924180000_add_approval_templates/migration.sql#L8) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `approval_templates_createdById_fkey` | `createdById` → `users(id)` | RESTRICT / CASCADE | [M37:20](../../prisma/migrations/20260924180000_add_approval_templates/migration.sql#L20) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `approval_templates_name_key` | да | `"name"` | есть | [M37:13](../../prisma/migrations/20260924180000_add_approval_templates/migration.sql#L13) |
| `approval_templates_isActive_name_idx` | нет | `"isActive", "name"` | есть | [M37:16](../../prisma/migrations/20260924180000_add_approval_templates/migration.sql#L16) |

SQL CHECK: нет.

### Project → `projects`

Prisma: [P:639](../../prisma/schema.prisma#L639). CREATE TABLE: [M04:11](../../prisma/migrations/20260219195204_add_projects/migration.sql#L11). PK: `projects_pkey` (`id`), [M04:27](../../prisma/migrations/20260219195204_add_projects/migration.sql#L27).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:640](../../prisma/schema.prisma#L640), [M04:12](../../prisma/migrations/20260219195204_add_projects/migration.sql#L12) |
| `code` | `String` | `TEXT` | нет | — | — | [P:641](../../prisma/schema.prisma#L641), [M04:13](../../prisma/migrations/20260219195204_add_projects/migration.sql#L13) |
| `name` | `String` | `TEXT` | нет | — | — | [P:642](../../prisma/schema.prisma#L642), [M04:14](../../prisma/migrations/20260219195204_add_projects/migration.sql#L14) |
| `description` | `String?` | `TEXT` | да | — | — | [P:643](../../prisma/schema.prisma#L643), [M04:15](../../prisma/migrations/20260219195204_add_projects/migration.sql#L15) |
| `goals` | `String?` | `TEXT` | да | — | — | [P:644](../../prisma/schema.prisma#L644), [M04:16](../../prisma/migrations/20260219195204_add_projects/migration.sql#L16) |
| `tasks` | `String?` | `TEXT` | да | — | — | [P:645](../../prisma/schema.prisma#L645), [M04:17](../../prisma/migrations/20260219195204_add_projects/migration.sql#L17) |
| `results` | `String?` | `TEXT` | да | — | — | [P:646](../../prisma/schema.prisma#L646), [M04:18](../../prisma/migrations/20260219195204_add_projects/migration.sql#L18) |
| `startDate` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:649](../../prisma/schema.prisma#L649), [M04:19](../../prisma/migrations/20260219195204_add_projects/migration.sql#L19) |
| `endDate` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:650](../../prisma/schema.prisma#L650), [M04:20](../../prisma/migrations/20260219195204_add_projects/migration.sql#L20) |
| `status` | `ProjectStatus` | `"project_status"` | нет | `'ACTIVE'` | `@default(ACTIVE)` | [P:653](../../prisma/schema.prisma#L653), [M04:21](../../prisma/migrations/20260219195204_add_projects/migration.sql#L21) |
| `plannedBudget` | `Decimal` | `DECIMAL(12,2)` | нет | `0` | `@default(0)` | [P:656](../../prisma/schema.prisma#L656), [M04:22](../../prisma/migrations/20260219195204_add_projects/migration.sql#L22) |
| `actualBudget` | `Decimal` | `DECIMAL(12,2)` | нет | `0` | `@default(0)` | [P:657](../../prisma/schema.prisma#L657), [M04:23](../../prisma/migrations/20260219195204_add_projects/migration.sql#L23) |
| `plannedRevenue` | `Decimal` | `DECIMAL(12,2)` | нет | `0` | `@default(0)` | [P:658](../../prisma/schema.prisma#L658), [M34:7](../../prisma/migrations/20260719075920_add_depreciation_and_revenue/migration.sql#L7) |
| `actualRevenue` | `Decimal` | `DECIMAL(12,2)` | нет | `0` | `@default(0)` | [P:659](../../prisma/schema.prisma#L659), [M34:6](../../prisma/migrations/20260719075920_add_depreciation_and_revenue/migration.sql#L6) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:673](../../prisma/schema.prisma#L673), [M04:24](../../prisma/migrations/20260219195204_add_projects/migration.sql#L24) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:674](../../prisma/schema.prisma#L674), [M04:25](../../prisma/migrations/20260219195204_add_projects/migration.sql#L25) |

FK: нет.

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `projects_code_key` | да | `"code"` | есть | [M04:50](../../prisma/migrations/20260219195204_add_projects/migration.sql#L50) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `projects_date_range` | `"startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate"` | [M19:126](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L126) |
| `projects_plannedBudget_nonnegative` | `"plannedBudget" >= 0` | [M19:127](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L127) |
| `projects_actualBudget_nonnegative` | `"actualBudget" >= 0` | [M19:128](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L128) |

### Supplier → `suppliers`

Prisma: [P:693](../../prisma/schema.prisma#L693). CREATE TABLE: [M31:15](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L15). PK: `suppliers_pkey` (`id`), [M31:25](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L25).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:694](../../prisma/schema.prisma#L694), [M31:16](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L16) |
| `name` | `String` | `TEXT` | нет | — | — | [P:695](../../prisma/schema.prisma#L695), [M31:17](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L17) |
| `taxId` | `String?` | `TEXT` | да | — | — | [P:696](../../prisma/schema.prisma#L696), [M31:18](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L18) |
| `email` | `String?` | `TEXT` | да | — | — | [P:697](../../prisma/schema.prisma#L697), [M31:19](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L19) |
| `phone` | `String?` | `TEXT` | да | — | — | [P:698](../../prisma/schema.prisma#L698), [M31:20](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L20) |
| `address` | `String?` | `TEXT` | да | — | — | [P:699](../../prisma/schema.prisma#L699), [M31:21](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L21) |
| `isActive` | `Boolean` | `BOOLEAN` | нет | `true` | `@default(true)` | [P:700](../../prisma/schema.prisma#L700), [M31:22](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L22) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:701](../../prisma/schema.prisma#L701), [M31:23](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L23) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:702](../../prisma/schema.prisma#L702), [M31:24](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L24) |

FK: нет.

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `suppliers_taxId_key` | да | `"taxId"` | есть | [M31:101](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L101) |
| `suppliers_isActive_name_idx` | нет | `"isActive", "name"` | есть | [M31:102](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L102) |

SQL CHECK: нет.

### ProcurementRequest → `procurement_requests`

Prisma: [P:710](../../prisma/schema.prisma#L710). CREATE TABLE: [M31:28](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L28). PK: `procurement_requests_pkey` (`id`), [M31:42](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L42).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:711](../../prisma/schema.prisma#L711), [M31:29](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L29) |
| `number` | `String` | `TEXT` | нет | — | — | [P:712](../../prisma/schema.prisma#L712), [M31:30](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L30) |
| `title` | `String` | `TEXT` | нет | — | — | [P:713](../../prisma/schema.prisma#L713), [M31:31](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L31) |
| `description` | `String?` | `TEXT` | да | — | — | [P:714](../../prisma/schema.prisma#L714), [M31:32](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L32) |
| `status` | `ProcurementStatus` | `"procurement_status"` | нет | `'DRAFT'` | `@default(DRAFT)` | [P:715](../../prisma/schema.prisma#L715), [M31:33](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L33) |
| `budgetLimit` | `Decimal` | `DECIMAL(12,2)` | нет | — | — | [P:716](../../prisma/schema.prisma#L716), [M31:34](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L34) |
| `neededBy` | `DateTime?` | `DATE` | да | — | — | [P:717](../../prisma/schema.prisma#L717), [M31:35](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L35) |
| `projectId` | `String?` | `TEXT` | да | — | — | [P:718](../../prisma/schema.prisma#L718), [M31:36](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L36) |
| `requestedById` | `String` | `TEXT` | нет | — | — | [P:720](../../prisma/schema.prisma#L720), [M31:37](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L37) |
| `approvalRequestId` | `String?` | `TEXT` | да | — | — | [P:722](../../prisma/schema.prisma#L722), [M31:38](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L38) |
| `documentId` | `String?` | `TEXT` | да | — | — | [P:724](../../prisma/schema.prisma#L724), [M31:39](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L39) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:729](../../prisma/schema.prisma#L729), [M31:40](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L40) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:730](../../prisma/schema.prisma#L730), [M31:41](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L41) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `procurement_requests_projectId_fkey` | `projectId` → `projects(id)` | SET NULL / CASCADE | [M31:126](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L126) |
| `procurement_requests_requestedById_fkey` | `requestedById` → `users(id)` | RESTRICT / CASCADE | [M31:129](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L129) |
| `procurement_requests_approvalRequestId_fkey` | `approvalRequestId` → `approval_requests(id)` | SET NULL / CASCADE | [M31:132](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L132) |
| `procurement_requests_documentId_fkey` | `documentId` → `documents(id)` | SET NULL / CASCADE | [M31:135](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L135) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `procurement_requests_number_key` | да | `"number"` | есть | [M31:103](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L103) |
| `procurement_requests_approvalRequestId_key` | да | `"approvalRequestId"` | есть | [M31:104](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L104) |
| `procurement_requests_status_neededBy_idx` | нет | `"status", "neededBy"` | есть | [M31:105](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L105) |
| `procurement_requests_projectId_status_idx` | нет | `"projectId", "status"` | есть | [M31:106](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L106) |
| `procurement_requests_requestedById_createdAt_idx` | нет | `"requestedById", "createdAt"` | есть | [M31:107](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L107) |
| `procurement_requests_documentId_idx` | нет | `"documentId"` | есть | [M31:108](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L108) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `procurement_requests_budget_check` | `"budgetLimit" > 0` | [M31:43](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L43) |

### ProcurementItem → `procurement_items`

Prisma: [P:739](../../prisma/schema.prisma#L739). CREATE TABLE: [M31:46](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L46). PK: `procurement_items_pkey` (`id`), [M31:56](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L56).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:740](../../prisma/schema.prisma#L740), [M31:47](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L47) |
| `requestId` | `String` | `TEXT` | нет | — | — | [P:741](../../prisma/schema.prisma#L741), [M31:48](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L48) |
| `name` | `String` | `TEXT` | нет | — | — | [P:743](../../prisma/schema.prisma#L743), [M31:49](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L49) |
| `quantity` | `Decimal` | `DECIMAL(10,2)` | нет | — | — | [P:744](../../prisma/schema.prisma#L744), [M31:50](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L50) |
| `unit` | `String` | `TEXT` | нет | — | — | [P:745](../../prisma/schema.prisma#L745), [M31:51](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L51) |
| `unitPrice` | `Decimal` | `DECIMAL(12,2)` | нет | — | — | [P:746](../../prisma/schema.prisma#L746), [M31:52](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L52) |
| `groupId` | `String?` | `TEXT` | да | — | — | [P:747](../../prisma/schema.prisma#L747), [M31:53](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L53) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:750](../../prisma/schema.prisma#L750), [M31:54](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L54) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:751](../../prisma/schema.prisma#L751), [M31:55](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L55) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `procurement_items_requestId_fkey` | `requestId` → `procurement_requests(id)` | CASCADE / CASCADE | [M31:138](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L138) |
| `procurement_items_groupId_fkey` | `groupId` → `asset_groups(id)` | SET NULL / CASCADE | [M31:141](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L141) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `procurement_items_requestId_idx` | нет | `"requestId"` | есть | [M31:109](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L109) |
| `procurement_items_groupId_idx` | нет | `"groupId"` | есть | [M31:110](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L110) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `procurement_items_values_check` | `"quantity" > 0 AND "unitPrice" > 0` | [M31:57](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L57) |

### ProcurementContract → `procurement_contracts`

Prisma: [P:758](../../prisma/schema.prisma#L758). CREATE TABLE: [M31:60](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L60). PK: `procurement_contracts_pkey` (`id`), [M31:71](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L71).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:759](../../prisma/schema.prisma#L759), [M31:61](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L61) |
| `requestId` | `String` | `TEXT` | нет | — | — | [P:760](../../prisma/schema.prisma#L760), [M31:62](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L62) |
| `supplierId` | `String` | `TEXT` | нет | — | — | [P:762](../../prisma/schema.prisma#L762), [M31:63](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L63) |
| `number` | `String` | `TEXT` | нет | — | — | [P:764](../../prisma/schema.prisma#L764), [M31:64](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L64) |
| `amount` | `Decimal` | `DECIMAL(12,2)` | нет | — | — | [P:765](../../prisma/schema.prisma#L765), [M31:65](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L65) |
| `signedAt` | `DateTime` | `DATE` | нет | — | — | [P:766](../../prisma/schema.prisma#L766), [M31:66](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L66) |
| `deliveryDueAt` | `DateTime` | `DATE` | нет | — | — | [P:767](../../prisma/schema.prisma#L767), [M31:67](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L67) |
| `documentId` | `String?` | `TEXT` | да | — | — | [P:768](../../prisma/schema.prisma#L768), [M31:68](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L68) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:771](../../prisma/schema.prisma#L771), [M31:69](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L69) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:772](../../prisma/schema.prisma#L772), [M31:70](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L70) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `procurement_contracts_requestId_fkey` | `requestId` → `procurement_requests(id)` | CASCADE / CASCADE | [M31:144](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L144) |
| `procurement_contracts_supplierId_fkey` | `supplierId` → `suppliers(id)` | RESTRICT / CASCADE | [M31:147](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L147) |
| `procurement_contracts_documentId_fkey` | `documentId` → `documents(id)` | SET NULL / CASCADE | [M31:150](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L150) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `procurement_contracts_requestId_key` | да | `"requestId"` | есть | [M31:111](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L111) |
| `procurement_contracts_number_key` | да | `"number"` | есть | [M31:112](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L112) |
| `procurement_contracts_supplierId_idx` | нет | `"supplierId"` | есть | [M31:113](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L113) |
| `procurement_contracts_deliveryDueAt_idx` | нет | `"deliveryDueAt"` | есть | [M31:114](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L114) |
| `procurement_contracts_documentId_idx` | нет | `"documentId"` | есть | [M31:115](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L115) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `procurement_contracts_amount_check` | `"amount" > 0` | [M31:72](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L72) |
| `procurement_contracts_dates_check` | `"deliveryDueAt" >= "signedAt"` | [M31:73](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L73) |

### ProcurementDelivery → `procurement_deliveries`

Prisma: [P:780](../../prisma/schema.prisma#L780). CREATE TABLE: [M31:76](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L76). PK: `procurement_deliveries_pkey` (`id`), [M31:86](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L86).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:781](../../prisma/schema.prisma#L781), [M31:77](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L77) |
| `requestId` | `String` | `TEXT` | нет | — | — | [P:782](../../prisma/schema.prisma#L782), [M31:78](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L78) |
| `contractId` | `String` | `TEXT` | нет | — | — | [P:784](../../prisma/schema.prisma#L784), [M31:79](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L79) |
| `number` | `String` | `TEXT` | нет | — | — | [P:786](../../prisma/schema.prisma#L786), [M31:80](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L80) |
| `receivedAt` | `DateTime` | `DATE` | нет | — | — | [P:787](../../prisma/schema.prisma#L787), [M31:81](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L81) |
| `note` | `String?` | `TEXT` | да | — | — | [P:788](../../prisma/schema.prisma#L788), [M31:82](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L82) |
| `documentId` | `String?` | `TEXT` | да | — | — | [P:789](../../prisma/schema.prisma#L789), [M31:83](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L83) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:792](../../prisma/schema.prisma#L792), [M31:84](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L84) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:793](../../prisma/schema.prisma#L793), [M31:85](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L85) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `procurement_deliveries_requestId_fkey` | `requestId` → `procurement_requests(id)` | CASCADE / CASCADE | [M31:153](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L153) |
| `procurement_deliveries_contractId_fkey` | `contractId` → `procurement_contracts(id)` | CASCADE / CASCADE | [M31:156](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L156) |
| `procurement_deliveries_documentId_fkey` | `documentId` → `documents(id)` | SET NULL / CASCADE | [M31:159](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L159) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `procurement_deliveries_contractId_number_key` | да | `"contractId", "number"` | есть | [M31:116](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L116) |
| `procurement_deliveries_requestId_receivedAt_idx` | нет | `"requestId", "receivedAt"` | есть | [M31:117](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L117) |
| `procurement_deliveries_documentId_idx` | нет | `"documentId"` | есть | [M31:118](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L118) |

SQL CHECK: нет.

### ProcurementDeliveryItem → `procurement_delivery_items`

Prisma: [P:801](../../prisma/schema.prisma#L801). CREATE TABLE: [M31:89](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L89). PK: `procurement_delivery_items_pkey` (`id`), [M31:97](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L97).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:802](../../prisma/schema.prisma#L802), [M31:90](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L90) |
| `deliveryId` | `String` | `TEXT` | нет | — | — | [P:803](../../prisma/schema.prisma#L803), [M31:91](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L91) |
| `procurementItemId` | `String` | `TEXT` | нет | — | — | [P:805](../../prisma/schema.prisma#L805), [M31:92](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L92) |
| `quantity` | `Decimal` | `DECIMAL(10,2)` | нет | — | — | [P:807](../../prisma/schema.prisma#L807), [M31:93](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L93) |
| `assetId` | `String?` | `TEXT` | да | — | — | [P:808](../../prisma/schema.prisma#L808), [M31:94](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L94) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:810](../../prisma/schema.prisma#L810), [M31:95](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L95) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:811](../../prisma/schema.prisma#L811), [M31:96](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L96) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `procurement_delivery_items_deliveryId_fkey` | `deliveryId` → `procurement_deliveries(id)` | CASCADE / CASCADE | [M31:162](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L162) |
| `procurement_delivery_items_procurementItemId_fkey` | `procurementItemId` → `procurement_items(id)` | RESTRICT / CASCADE | [M31:165](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L165) |
| `procurement_delivery_items_assetId_fkey` | `assetId` → `assets(id)` | SET NULL / CASCADE | [M31:168](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L168) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `procurement_delivery_items_assetId_key` | да | `"assetId"` | есть | [M31:119](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L119) |
| `procurement_delivery_items_deliveryId_procurementItemId_key` | да | `"deliveryId", "procurementItemId"` | есть | [M31:120](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L120) |
| `procurement_delivery_items_procurementItemId_idx` | нет | `"procurementItemId"` | есть | [M31:122](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L122) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `procurement_delivery_items_quantity_check` | `"quantity" > 0` | [M31:98](../../prisma/migrations/20260718233000_add_procurement_workflow/migration.sql#L98) |

### ProjectMember → `project_members`

Prisma: [P:818](../../prisma/schema.prisma#L818). CREATE TABLE: [M16:1](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L1). PK: `project_members_pkey` (`id`), [M16:14](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L14).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:819](../../prisma/schema.prisma#L819), [M16:2](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L2) |
| `projectId` | `String` | `TEXT` | нет | — | — | [P:820](../../prisma/schema.prisma#L820), [M16:3](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L3) |
| `employeeId` | `String` | `TEXT` | нет | — | — | [P:822](../../prisma/schema.prisma#L822), [M16:4](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L4) |
| `department` | `String` | `TEXT` | нет | — | — | [P:825](../../prisma/schema.prisma#L825), [M16:5](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L5) |
| `position` | `String` | `TEXT` | нет | — | — | [P:826](../../prisma/schema.prisma#L826), [M16:6](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L6) |
| `rate` | `Decimal` | `DECIMAL(5,2)` | нет | — | — | [P:827](../../prisma/schema.prisma#L827), [M16:7](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L7) |
| `salary` | `Decimal` | `DECIMAL(12,2)` | нет | — | — | [P:828](../../prisma/schema.prisma#L828), [M16:8](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L8) |
| `isArchived` | `Boolean` | `BOOLEAN` | нет | `false` | `@default(false)` | [P:829](../../prisma/schema.prisma#L829), [M16:9](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L9) |
| `archivedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:830](../../prisma/schema.prisma#L830), [M16:10](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L10) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:832](../../prisma/schema.prisma#L832), [M16:11](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L11) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:833](../../prisma/schema.prisma#L833), [M16:12](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L12) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `project_members_projectId_fkey` | `projectId` → `projects(id)` | CASCADE / CASCADE | [M16:21](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L21) |
| `project_members_employeeId_fkey` | `employeeId` → `employees(id)` | CASCADE / CASCADE | [M16:22](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L22) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `project_members_projectId_employeeId_key` | да | `"projectId", "employeeId"` | есть | [M16:17](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L17) |
| `project_members_projectId_isArchived_idx` | нет | `"projectId", "isArchived"` | есть | [M16:18](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L18) |
| `project_members_employeeId_isArchived_idx` | нет | `"employeeId", "isArchived"` | есть | [M16:19](../../prisma/migrations/20260410120000_add_project_members/migration.sql#L19) |

SQL CHECK: нет.

### Task → `tasks`

Prisma: [P:842](../../prisma/schema.prisma#L842). CREATE TABLE: [M04:31](../../prisma/migrations/20260219195204_add_projects/migration.sql#L31). PK: `tasks_pkey` (`id`), [M04:46](../../prisma/migrations/20260219195204_add_projects/migration.sql#L46).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:843](../../prisma/schema.prisma#L843), [M04:32](../../prisma/migrations/20260219195204_add_projects/migration.sql#L32) |
| `name` | `String` | `TEXT` | нет | — | — | [P:844](../../prisma/schema.prisma#L844), [M04:33](../../prisma/migrations/20260219195204_add_projects/migration.sql#L33) |
| `description` | `String?` | `TEXT` | да | — | — | [P:845](../../prisma/schema.prisma#L845), [M27:7](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L7) |
| `priority` | `TaskPriority` | `"task_priority"` | нет | `'MEDIUM'` | `@default(MEDIUM)` | [P:846](../../prisma/schema.prisma#L846), [M27:9](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L9) |
| `risk` | `TaskRisk` | `"task_risk"` | нет | `'LOW'` | `@default(LOW)` | [P:847](../../prisma/schema.prisma#L847), [M27:10](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L10) |
| `isMilestone` | `Boolean` | `BOOLEAN` | нет | `false` | `@default(false)` | [P:848](../../prisma/schema.prisma#L848), [M27:8](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L8) |
| `level` | `Int` | `INTEGER` | нет | `1` | `@default(1)` | [P:851](../../prisma/schema.prisma#L851), [M04:34](../../prisma/migrations/20260219195204_add_projects/migration.sql#L34) |
| `parentId` | `String?` | `TEXT` | да | — | — | [P:852](../../prisma/schema.prisma#L852), [M04:35](../../prisma/migrations/20260219195204_add_projects/migration.sql#L35) |
| `startDate` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:857](../../prisma/schema.prisma#L857), [M04:36](../../prisma/migrations/20260219195204_add_projects/migration.sql#L36) |
| `endDate` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:858](../../prisma/schema.prisma#L858), [M04:37](../../prisma/migrations/20260219195204_add_projects/migration.sql#L37) |
| `duration` | `Int?` | `INTEGER` | да | — | — | [P:859](../../prisma/schema.prisma#L859), [M04:38](../../prisma/migrations/20260219195204_add_projects/migration.sql#L38) |
| `progress` | `Int` | `INTEGER` | нет | `0` | `@default(0)` | [P:862](../../prisma/schema.prisma#L862), [M04:39](../../prisma/migrations/20260219195204_add_projects/migration.sql#L39) |
| `responsible` | `String?` | `TEXT` | да | — | — | [P:865](../../prisma/schema.prisma#L865), [M04:40](../../prisma/migrations/20260219195204_add_projects/migration.sql#L40) |
| `status` | `TaskStatus` | `"task_status"` | нет | `'NOT_STARTED'` | `@default(NOT_STARTED)` | [P:874](../../prisma/schema.prisma#L874), [M04:41](../../prisma/migrations/20260219195204_add_projects/migration.sql#L41) |
| `projectId` | `String` | `TEXT` | нет | — | — | [P:877](../../prisma/schema.prisma#L877), [M04:42](../../prisma/migrations/20260219195204_add_projects/migration.sql#L42) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:880](../../prisma/schema.prisma#L880), [M04:43](../../prisma/migrations/20260219195204_add_projects/migration.sql#L43) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:881](../../prisma/schema.prisma#L881), [M04:44](../../prisma/migrations/20260219195204_add_projects/migration.sql#L44) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `tasks_parentId_fkey` | `parentId` → `tasks(id)` | SET NULL / CASCADE | [M04:56](../../prisma/migrations/20260219195204_add_projects/migration.sql#L56) |
| `tasks_projectId_fkey` | `projectId` → `projects(id)` | CASCADE / CASCADE | [M04:59](../../prisma/migrations/20260219195204_add_projects/migration.sql#L59) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `tasks_projectId_parentId_idx` | нет | `"projectId", "parentId"` | есть | [M19:79](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L79) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `tasks_level_range` | `"level" BETWEEN 1 AND 3` | [M19:121](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L121) |
| `tasks_progress_range` | `"progress" BETWEEN 0 AND 100` | [M19:122](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L122) |
| `tasks_date_range` | `"startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate"` | [M19:123](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L123) |

### TaskDependency → `task_dependencies`

Prisma: [P:887](../../prisma/schema.prisma#L887). CREATE TABLE: [M27:12](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L12). PK: `task_dependencies_pkey` (`id`), [M27:18](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L18).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:888](../../prisma/schema.prisma#L888), [M27:13](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L13) |
| `predecessorId` | `String` | `TEXT` | нет | — | — | [P:889](../../prisma/schema.prisma#L889), [M27:14](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L14) |
| `successorId` | `String` | `TEXT` | нет | — | — | [P:891](../../prisma/schema.prisma#L891), [M27:15](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L15) |
| `lagDays` | `Int` | `INTEGER` | нет | `0` | `@default(0)` | [P:893](../../prisma/schema.prisma#L893), [M27:16](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L16) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:894](../../prisma/schema.prisma#L894), [M27:17](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L17) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `task_dependencies_predecessorId_fkey` | `predecessorId` → `tasks(id)` | CASCADE / CASCADE | [M27:52](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L52) |
| `task_dependencies_successorId_fkey` | `successorId` → `tasks(id)` | CASCADE / CASCADE | [M27:55](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L55) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `task_dependencies_successorId_idx` | нет | `"successorId"` | есть | [M27:45](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L45) |
| `task_dependencies_predecessorId_successorId_key` | да | `"predecessorId", "successorId"` | есть | [M27:46](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L46) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `task_dependencies_not_self_check` | `"predecessorId" <> "successorId"` | [M27:19](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L19) |
| `task_dependencies_lag_check` | `"lagDays" >= 0` | [M27:20](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L20) |

### TaskChecklistItem → `task_checklist_items`

Prisma: [P:901](../../prisma/schema.prisma#L901). CREATE TABLE: [M27:23](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L23). PK: `task_checklist_items_pkey` (`id`), [M27:31](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L31).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:902](../../prisma/schema.prisma#L902), [M27:24](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L24) |
| `taskId` | `String` | `TEXT` | нет | — | — | [P:903](../../prisma/schema.prisma#L903), [M27:25](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L25) |
| `title` | `String` | `TEXT` | нет | — | — | [P:905](../../prisma/schema.prisma#L905), [M27:26](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L26) |
| `completed` | `Boolean` | `BOOLEAN` | нет | `false` | `@default(false)` | [P:906](../../prisma/schema.prisma#L906), [M27:27](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L27) |
| `order` | `Int` | `INTEGER` | нет | `0` | `@default(0)` | [P:907](../../prisma/schema.prisma#L907), [M27:28](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L28) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:908](../../prisma/schema.prisma#L908), [M27:29](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L29) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:909](../../prisma/schema.prisma#L909), [M27:30](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L30) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `task_checklist_items_taskId_fkey` | `taskId` → `tasks(id)` | CASCADE / CASCADE | [M27:58](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L58) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `task_checklist_items_taskId_order_idx` | нет | `"taskId", "order"` | есть | [M27:47](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L47) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `task_checklist_items_order_check` | `"order" >= 0` | [M27:32](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L32) |

### TaskComment → `task_comments`

Prisma: [P:915](../../prisma/schema.prisma#L915). CREATE TABLE: [M27:35](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L35). PK: `task_comments_pkey` (`id`), [M27:42](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L42).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:916](../../prisma/schema.prisma#L916), [M27:36](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L36) |
| `taskId` | `String` | `TEXT` | нет | — | — | [P:917](../../prisma/schema.prisma#L917), [M27:37](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L37) |
| `authorId` | `String` | `TEXT` | нет | — | — | [P:919](../../prisma/schema.prisma#L919), [M27:38](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L38) |
| `body` | `String` | `TEXT` | нет | — | — | [P:921](../../prisma/schema.prisma#L921), [M27:39](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L39) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:922](../../prisma/schema.prisma#L922), [M27:40](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L40) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:923](../../prisma/schema.prisma#L923), [M27:41](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L41) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `task_comments_taskId_fkey` | `taskId` → `tasks(id)` | CASCADE / CASCADE | [M27:61](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L61) |
| `task_comments_authorId_fkey` | `authorId` → `users(id)` | RESTRICT / CASCADE | [M27:64](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L64) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `task_comments_taskId_createdAt_idx` | нет | `"taskId", "createdAt"` | есть | [M27:48](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L48) |
| `task_comments_authorId_createdAt_idx` | нет | `"authorId", "createdAt"` | есть | [M27:49](../../prisma/migrations/20260718221000_add_project_planning/migration.sql#L49) |

SQL CHECK: нет.

### TaskAssignee → `task_assignees`

Prisma: [P:930](../../prisma/schema.prisma#L930). CREATE TABLE: [M17:2](../../prisma/migrations/20260410183000_add_task_assignees/migration.sql#L2). PK: `task_assignees_pkey` (`id`), [M17:9](../../prisma/migrations/20260410183000_add_task_assignees/migration.sql#L9).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:931](../../prisma/schema.prisma#L931), [M17:3](../../prisma/migrations/20260410183000_add_task_assignees/migration.sql#L3) |
| `taskId` | `String` | `TEXT` | нет | — | — | [P:932](../../prisma/schema.prisma#L932), [M17:4](../../prisma/migrations/20260410183000_add_task_assignees/migration.sql#L4) |
| `employeeId` | `String` | `TEXT` | нет | — | — | [P:934](../../prisma/schema.prisma#L934), [M17:5](../../prisma/migrations/20260410183000_add_task_assignees/migration.sql#L5) |
| `projectMemberId` | `String?` | `TEXT` | да | — | — | [P:936](../../prisma/schema.prisma#L936), [M17:6](../../prisma/migrations/20260410183000_add_task_assignees/migration.sql#L6) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:938](../../prisma/schema.prisma#L938), [M17:7](../../prisma/migrations/20260410183000_add_task_assignees/migration.sql#L7) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `task_assignees_taskId_fkey` | `taskId` → `tasks(id)` | CASCADE / CASCADE | [M17:22](../../prisma/migrations/20260410183000_add_task_assignees/migration.sql#L22) |
| `task_assignees_employeeId_fkey` | `employeeId` → `employees(id)` | CASCADE / CASCADE | [M17:25](../../prisma/migrations/20260410183000_add_task_assignees/migration.sql#L25) |
| `task_assignees_projectMemberId_fkey` | `projectMemberId` → `project_members(id)` | SET NULL / CASCADE | [M17:28](../../prisma/migrations/20260410183000_add_task_assignees/migration.sql#L28) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `task_assignees_taskId_employeeId_key` | да | `"taskId", "employeeId"` | есть | [M17:13](../../prisma/migrations/20260410183000_add_task_assignees/migration.sql#L13) |
| `task_assignees_employeeId_idx` | нет | `"employeeId"` | есть | [M17:16](../../prisma/migrations/20260410183000_add_task_assignees/migration.sql#L16) |
| `task_assignees_projectMemberId_idx` | нет | `"projectMemberId"` | есть | [M17:19](../../prisma/migrations/20260410183000_add_task_assignees/migration.sql#L19) |

SQL CHECK: нет.

### Employee → `employees`

Prisma: [P:973](../../prisma/schema.prisma#L973). CREATE TABLE: [M06:11](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L11). PK: `employees_pkey` (`id`), [M06:24](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L24).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:974](../../prisma/schema.prisma#L974), [M06:12](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L12) |
| `code` | `String` | `TEXT` | нет | — | — | [P:975](../../prisma/schema.prisma#L975), [M06:13](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L13) |
| `fullName` | `String` | `TEXT` | нет | — | — | [P:976](../../prisma/schema.prisma#L976), [M06:14](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L14) |
| `department` | `String` | `TEXT` | нет | — | — | [P:977](../../prisma/schema.prisma#L977), [M06:15](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L15) |
| `departmentId` | `String` | `TEXT` | нет | — | — | [P:978](../../prisma/schema.prisma#L978), [M21:100](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L100), [M21:149](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L149) |
| `photo` | `String?` | `TEXT` | да | — | — | [P:980](../../prisma/schema.prisma#L980), [M06:16](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L16) |
| `contractType` | `EmploymentContractType` | `"employment_contract_type"` | нет | `'PRIMARY'` | `@default(PRIMARY)` | [P:981](../../prisma/schema.prisma#L981), [M08:7](../../prisma/migrations/20260316073529_add_employee_contract_fields/migration.sql#L7) |
| `contractSignedDate` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:982](../../prisma/schema.prisma#L982), [M08:6](../../prisma/migrations/20260316073529_add_employee_contract_fields/migration.sql#L6) |
| `contractEndDate` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:983](../../prisma/schema.prisma#L983), [M07:2](../../prisma/migrations/20260316062522_add_employee_contract_dates/migration.sql#L2) |
| `contractNumber` | `String?` | `TEXT` | да | — | — | [P:984](../../prisma/schema.prisma#L984), [M08:5](../../prisma/migrations/20260316073529_add_employee_contract_fields/migration.sql#L5) |
| `phone` | `String?` | `TEXT` | да | — | — | [P:987](../../prisma/schema.prisma#L987), [M06:17](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L17) |
| `email` | `String?` | `TEXT` | да | — | — | [P:988](../../prisma/schema.prisma#L988), [M06:18](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L18) |
| `birthDate` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:989](../../prisma/schema.prisma#L989), [M26:4](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L4) |
| `education` | `String?` | `TEXT` | да | — | — | [P:990](../../prisma/schema.prisma#L990), [M26:5](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L5) |
| `qualification` | `String?` | `TEXT` | да | — | — | [P:991](../../prisma/schema.prisma#L991), [M26:7](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L7) |
| `managerId` | `String?` | `TEXT` | да | — | — | [P:993](../../prisma/schema.prisma#L993), [M26:6](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L6) |
| `staffScheduleId` | `String?` | `TEXT` | да | — | — | [P:998](../../prisma/schema.prisma#L998), [M06:19](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L19) |
| `employmentRate` | `Decimal` | `DECIMAL(5, 2)` | нет | `1.00` | `@default(1)` | [P:1000](../../prisma/schema.prisma#L1000), [M15:2](../../prisma/migrations/20260406121000_add_employee_employment_rate/migration.sql#L2) |
| `status` | `EmployeeStatus` | `"employee_status"` | нет | `'ACTIVE'` | `@default(ACTIVE)` | [P:1003](../../prisma/schema.prisma#L1003), [M06:20](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L20) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1022](../../prisma/schema.prisma#L1022), [M06:21](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L21) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:1023](../../prisma/schema.prisma#L1023), [M06:22](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L22) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `employees_staffScheduleId_fkey` | `staffScheduleId` → `staff_schedule(id)` | SET NULL / CASCADE | [M06:72](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L72) |
| `employees_departmentId_fkey` | `departmentId` → `departments(id)` | RESTRICT / CASCADE | [M21:166](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L166) |
| `employees_managerId_fkey` | `managerId` → `employees(id)` | SET NULL / CASCADE | [M26:47](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L47) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `employees_code_key` | да | `"code"` | есть | [M06:69](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L69) |
| `employees_status_fullName_idx` | нет | `"status", "fullName"` | есть | [M19:80](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L80) |
| `employees_departmentId_idx` | нет | `"departmentId"` | есть | [M21:153](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L153) |
| `employees_managerId_idx` | нет | `"managerId"` | есть | [M26:40](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L40) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `employees_contract_date_range` | `"contractSignedDate" IS NULL OR "contractEndDate" IS NULL OR "contractSignedDate" <= "contractEndDate"` | [M19:134](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L134) |
| `employees_manager_not_self_check` | `"managerId" IS NULL OR "managerId" <> "id"` | [M26:50](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L50) |

### EmployeeSkill → `employee_skills`

Prisma: [P:1031](../../prisma/schema.prisma#L1031). CREATE TABLE: [M26:11](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L11). PK: `employee_skills_pkey` (`id`), [M26:18](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L18).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:1032](../../prisma/schema.prisma#L1032), [M26:12](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L12) |
| `employeeId` | `String` | `TEXT` | нет | — | — | [P:1033](../../prisma/schema.prisma#L1033), [M26:13](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L13) |
| `name` | `String` | `TEXT` | нет | — | — | [P:1035](../../prisma/schema.prisma#L1035), [M26:14](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L14) |
| `level` | `Int?` | `INTEGER` | да | — | — | [P:1036](../../prisma/schema.prisma#L1036), [M26:15](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L15) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1037](../../prisma/schema.prisma#L1037), [M26:16](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L16) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:1038](../../prisma/schema.prisma#L1038), [M26:17](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L17) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `employee_skills_employeeId_fkey` | `employeeId` → `employees(id)` | CASCADE / CASCADE | [M26:53](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L53) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `employee_skills_employeeId_idx` | нет | `"employeeId"` | есть | [M26:37](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L37) |
| `employee_skills_employeeId_name_key` | да | `"employeeId", "name"` | есть | [M26:38](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L38) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `employee_skills_level_check` | `"level" IS NULL OR "level" BETWEEN 1 AND 5` | [M26:19](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L19) |

### EmployeeCertificate → `employee_certificates`

Prisma: [P:1045](../../prisma/schema.prisma#L1045). CREATE TABLE: [M26:22](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L22). PK: `employee_certificates_pkey` (`id`), [M26:32](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L32).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:1046](../../prisma/schema.prisma#L1046), [M26:23](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L23) |
| `employeeId` | `String` | `TEXT` | нет | — | — | [P:1047](../../prisma/schema.prisma#L1047), [M26:24](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L24) |
| `name` | `String` | `TEXT` | нет | — | — | [P:1049](../../prisma/schema.prisma#L1049), [M26:25](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L25) |
| `issuer` | `String?` | `TEXT` | да | — | — | [P:1050](../../prisma/schema.prisma#L1050), [M26:26](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L26) |
| `number` | `String?` | `TEXT` | да | — | — | [P:1051](../../prisma/schema.prisma#L1051), [M26:27](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L27) |
| `issuedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:1052](../../prisma/schema.prisma#L1052), [M26:28](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L28) |
| `expiresAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:1053](../../prisma/schema.prisma#L1053), [M26:29](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L29) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1054](../../prisma/schema.prisma#L1054), [M26:30](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L30) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:1055](../../prisma/schema.prisma#L1055), [M26:31](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L31) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `employee_certificates_employeeId_fkey` | `employeeId` → `employees(id)` | CASCADE / CASCADE | [M26:56](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L56) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `employee_certificates_employeeId_expiresAt_idx` | нет | `"employeeId", "expiresAt"` | есть | [M26:39](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L39) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `employee_certificates_date_check` | `"issuedAt" IS NULL OR "expiresAt" IS NULL OR "expiresAt" >= "issuedAt"` | [M26:33](../../prisma/migrations/20260718215100_add_employee_profiles/migration.sql#L33) |

### TimeEntry → `time_entries`

Prisma: [P:1088](../../prisma/schema.prisma#L1088). CREATE TABLE: [M28:11](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L11). PK: `time_entries_pkey` (`id`), [M28:22](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L22).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:1089](../../prisma/schema.prisma#L1089), [M28:12](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L12) |
| `employeeId` | `String` | `TEXT` | нет | — | — | [P:1090](../../prisma/schema.prisma#L1090), [M28:13](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L13) |
| `projectId` | `String?` | `TEXT` | да | — | — | [P:1092](../../prisma/schema.prisma#L1092), [M28:14](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L14) |
| `taskId` | `String?` | `TEXT` | да | — | — | [P:1094](../../prisma/schema.prisma#L1094), [M28:15](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L15) |
| `workDate` | `DateTime` | `DATE` | нет | — | — | [P:1096](../../prisma/schema.prisma#L1096), [M28:16](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L16) |
| `type` | `TimeEntryType` | `"time_entry_type"` | нет | `'REGULAR'` | `@default(REGULAR)` | [P:1097](../../prisma/schema.prisma#L1097), [M28:17](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L17) |
| `hours` | `Decimal` | `DECIMAL(5,2)` | нет | — | — | [P:1098](../../prisma/schema.prisma#L1098), [M28:18](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L18) |
| `note` | `String?` | `TEXT` | да | — | — | [P:1099](../../prisma/schema.prisma#L1099), [M28:19](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L19) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1101](../../prisma/schema.prisma#L1101), [M28:20](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L20) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:1102](../../prisma/schema.prisma#L1102), [M28:21](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L21) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `time_entries_employeeId_fkey` | `employeeId` → `employees(id)` | CASCADE / CASCADE | [M28:31](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L31) |
| `time_entries_projectId_fkey` | `projectId` → `projects(id)` | SET NULL / CASCADE | [M28:34](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L34) |
| `time_entries_taskId_fkey` | `taskId` → `tasks(id)` | SET NULL / CASCADE | [M28:37](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L37) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `time_entries_workDate_employeeId_idx` | нет | `"workDate", "employeeId"` | есть | [M28:26](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L26) |
| `time_entries_projectId_workDate_idx` | нет | `"projectId", "workDate"` | есть | [M28:27](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L27) |
| `time_entries_taskId_workDate_idx` | нет | `"taskId", "workDate"` | есть | [M28:28](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L28) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `time_entries_hours_check` | `"hours" > 0 AND "hours" <= 24` | [M28:23](../../prisma/migrations/20260718223000_add_timekeeping/migration.sql#L23) |

### Timesheet → `timesheets`

Prisma: [P:1119](../../prisma/schema.prisma#L1119). CREATE TABLE: [M41:5](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L5). PK: `timesheets_pkey` (`id`), [M41:20](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L20).

Исходный снимок `project1`: таблица отсутствует, соответствующая миграция pending. Ниже полный ожидаемый DDL после её применения на копии.

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:1120](../../prisma/schema.prisma#L1120), [M41:6](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L6) |
| `employeeId` | `String` | `TEXT` | нет | — | — | [P:1121](../../prisma/schema.prisma#L1121), [M41:7](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L7) |
| `year` | `Int` | `INTEGER` | нет | — | — | [P:1123](../../prisma/schema.prisma#L1123), [M41:8](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L8) |
| `month` | `Int` | `INTEGER` | нет | — | — | [P:1124](../../prisma/schema.prisma#L1124), [M41:9](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L9) |
| `status` | `TimesheetStatus` | `"timesheet_status"` | нет | `'DRAFT'` | `@default(DRAFT)` | [P:1125](../../prisma/schema.prisma#L1125), [M41:10](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L10) |
| `zeroHoursConfirmed` | `Boolean` | `BOOLEAN` | нет | `false` | `@default(false)` | [P:1126](../../prisma/schema.prisma#L1126), [M41:11](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L11) |
| `submittedById` | `String?` | `TEXT` | да | — | — | [P:1127](../../prisma/schema.prisma#L1127), [M41:12](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L12) |
| `submittedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:1129](../../prisma/schema.prisma#L1129), [M41:13](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L13) |
| `decidedById` | `String?` | `TEXT` | да | — | — | [P:1130](../../prisma/schema.prisma#L1130), [M41:14](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L14) |
| `decidedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:1132](../../prisma/schema.prisma#L1132), [M41:15](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L15) |
| `decisionReason` | `String?` | `TEXT` | да | — | — | [P:1133](../../prisma/schema.prisma#L1133), [M41:16](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L16) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1134](../../prisma/schema.prisma#L1134), [M41:17](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L17) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:1135](../../prisma/schema.prisma#L1135), [M41:18](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L18) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `timesheets_employeeId_fkey` | `employeeId` → `employees(id)` | CASCADE / CASCADE | [M41:33](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L33) |
| `timesheets_submittedById_fkey` | `submittedById` → `users(id)` | SET NULL / CASCADE | [M41:36](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L36) |
| `timesheets_decidedById_fkey` | `decidedById` → `users(id)` | SET NULL / CASCADE | [M41:39](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L39) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `timesheets_year_month_status_idx` | нет | `"year", "month", "status"` | есть | [M41:24](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L24) |
| `timesheets_submittedById_year_month_idx` | нет | `"submittedById", "year", "month"` | есть | [M41:27](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L27) |
| `timesheets_employeeId_year_month_key` | да | `"employeeId", "year", "month"` | есть | [M41:30](../../prisma/migrations/20260925202046_add_timesheet_approval_workflow/migration.sql#L30) |

SQL CHECK: нет.

### StaffSchedule → `staff_schedule`

Prisma: [P:1143](../../prisma/schema.prisma#L1143). CREATE TABLE: [M06:28](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L28). PK: `staff_schedule_pkey` (`id`), [M06:37](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L37).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:1144](../../prisma/schema.prisma#L1144), [M06:29](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L29) |
| `position` | `String` | `TEXT` | нет | — | — | [P:1145](../../prisma/schema.prisma#L1145), [M06:30](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L30) |
| `department` | `String` | `TEXT` | нет | — | — | [P:1146](../../prisma/schema.prisma#L1146), [M06:31](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L31) |
| `departmentId` | `String` | `TEXT` | нет | — | — | [P:1147](../../prisma/schema.prisma#L1147), [M21:101](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L101), [M21:150](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L150) |
| `rate` | `Decimal` | `DECIMAL(5,2)` | нет | — | — | [P:1149](../../prisma/schema.prisma#L1149), [M06:32](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L32), [M18:5](../../prisma/migrations/20260411164424_test/migration.sql#L5) |
| `salary` | `Decimal` | `DECIMAL(10,2)` | нет | — | — | [P:1150](../../prisma/schema.prisma#L1150), [M06:33](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L33) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1155](../../prisma/schema.prisma#L1155), [M06:34](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L34) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:1156](../../prisma/schema.prisma#L1156), [M06:35](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L35) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `staff_schedule_departmentId_fkey` | `departmentId` → `departments(id)` | RESTRICT / CASCADE | [M21:170](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L170) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `staff_schedule_departmentId_idx` | нет | `"departmentId"` | есть | [M21:154](../../prisma/migrations/20260718090100_add_department_hierarchy/migration.sql#L154) |

SQL CHECK: нет.

### SalaryEntry → `salary_entries`

Prisma: [P:1162](../../prisma/schema.prisma#L1162). CREATE TABLE: [M11:2](../../prisma/migrations/20260327125644_add_salary_entries/migration.sql#L2). PK: `salary_entries_pkey` (`id`), [M11:11](../../prisma/migrations/20260327125644_add_salary_entries/migration.sql#L11).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:1163](../../prisma/schema.prisma#L1163), [M11:3](../../prisma/migrations/20260327125644_add_salary_entries/migration.sql#L3) |
| `employeeId` | `String` | `TEXT` | нет | — | — | [P:1164](../../prisma/schema.prisma#L1164), [M11:4](../../prisma/migrations/20260327125644_add_salary_entries/migration.sql#L4) |
| `year` | `Int` | `INTEGER` | нет | — | — | [P:1166](../../prisma/schema.prisma#L1166), [M11:5](../../prisma/migrations/20260327125644_add_salary_entries/migration.sql#L5) |
| `month` | `Int` | `INTEGER` | нет | — | — | [P:1167](../../prisma/schema.prisma#L1167), [M11:6](../../prisma/migrations/20260327125644_add_salary_entries/migration.sql#L6) |
| `amount` | `Decimal` | `DECIMAL(12,2)` | нет | — | — | [P:1168](../../prisma/schema.prisma#L1168), [M11:7](../../prisma/migrations/20260327125644_add_salary_entries/migration.sql#L7) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1170](../../prisma/schema.prisma#L1170), [M11:8](../../prisma/migrations/20260327125644_add_salary_entries/migration.sql#L8) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:1171](../../prisma/schema.prisma#L1171), [M11:9](../../prisma/migrations/20260327125644_add_salary_entries/migration.sql#L9) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `salary_entries_employeeId_fkey` | `employeeId` → `employees(id)` | RESTRICT / CASCADE | [M11:21](../../prisma/migrations/20260327125644_add_salary_entries/migration.sql#L21) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `salary_entries_year_month_idx` | нет | `"year", "month"` | есть | [M11:15](../../prisma/migrations/20260327125644_add_salary_entries/migration.sql#L15) |
| `salary_entries_employeeId_year_month_key` | да | `"employeeId", "year", "month"` | есть | [M11:18](../../prisma/migrations/20260327125644_add_salary_entries/migration.sql#L18) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `salary_entries_amount_nonnegative` | `"amount" >= 0` | [M19:138](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L138) |

### PayrollAdjustment → `payroll_adjustments`

Prisma: [P:1193](../../prisma/schema.prisma#L1193). CREATE TABLE: [M30:6](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L6). PK: `payroll_adjustments_pkey` (`id`), [M30:17](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L17).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:1194](../../prisma/schema.prisma#L1194), [M30:7](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L7) |
| `employeeId` | `String` | `TEXT` | нет | — | — | [P:1195](../../prisma/schema.prisma#L1195), [M30:8](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L8) |
| `projectId` | `String?` | `TEXT` | да | — | — | [P:1197](../../prisma/schema.prisma#L1197), [M30:9](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L9) |
| `year` | `Int` | `INTEGER` | нет | — | — | [P:1199](../../prisma/schema.prisma#L1199), [M30:10](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L10) |
| `month` | `Int` | `INTEGER` | нет | — | — | [P:1200](../../prisma/schema.prisma#L1200), [M30:11](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L11) |
| `type` | `PayrollAdjustmentType` | `"payroll_adjustment_type"` | нет | — | — | [P:1201](../../prisma/schema.prisma#L1201), [M30:12](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L12) |
| `amount` | `Decimal` | `DECIMAL(12,2)` | нет | — | — | [P:1202](../../prisma/schema.prisma#L1202), [M30:13](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L13) |
| `description` | `String` | `TEXT` | нет | — | — | [P:1203](../../prisma/schema.prisma#L1203), [M30:14](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L14) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1205](../../prisma/schema.prisma#L1205), [M30:15](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L15) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:1206](../../prisma/schema.prisma#L1206), [M30:16](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L16) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `payroll_adjustments_employeeId_fkey` | `employeeId` → `employees(id)` | CASCADE / CASCADE | [M30:47](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L47) |
| `payroll_adjustments_projectId_fkey` | `projectId` → `projects(id)` | SET NULL / CASCADE | [M30:50](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L50) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `payroll_adjustments_year_month_employeeId_idx` | нет | `"year", "month", "employeeId"` | есть | [M30:39](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L39) |
| `payroll_adjustments_projectId_year_month_idx` | нет | `"projectId", "year", "month"` | есть | [M30:41](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L41) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `payroll_adjustments_period_check` | `"year" BETWEEN 2000 AND 2100 AND "month" BETWEEN 1 AND 12` | [M30:18](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L18) |
| `payroll_adjustments_amount_check` | `"amount" > 0` | [M30:19](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L19) |

### PayrollPeriod → `payroll_periods`

Prisma: [P:1213](../../prisma/schema.prisma#L1213). CREATE TABLE: [M30:22](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L22). PK: `payroll_periods_pkey` (`id`), [M30:31](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L31).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:1214](../../prisma/schema.prisma#L1214), [M30:23](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L23) |
| `year` | `Int` | `INTEGER` | нет | — | — | [P:1215](../../prisma/schema.prisma#L1215), [M30:24](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L24) |
| `month` | `Int` | `INTEGER` | нет | — | — | [P:1216](../../prisma/schema.prisma#L1216), [M30:25](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L25) |
| `status` | `PayrollPeriodStatus` | `"payroll_period_status"` | нет | `'OPEN'` | `@default(OPEN)` | [P:1217](../../prisma/schema.prisma#L1217), [M30:26](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L26) |
| `closedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:1218](../../prisma/schema.prisma#L1218), [M30:27](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L27) |
| `closedById` | `String?` | `TEXT` | да | — | — | [P:1219](../../prisma/schema.prisma#L1219), [M30:28](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L28) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1222](../../prisma/schema.prisma#L1222), [M30:29](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L29) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:1223](../../prisma/schema.prisma#L1223), [M30:30](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L30) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `payroll_periods_closedById_fkey` | `closedById` → `users(id)` | SET NULL / CASCADE | [M30:53](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L53) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `payroll_periods_year_month_key` | да | `"year", "month"` | есть | [M30:43](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L43) |
| `payroll_periods_status_year_month_idx` | нет | `"status", "year", "month"` | есть | [M30:44](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L44) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `payroll_periods_period_check` | `"year" BETWEEN 2000 AND 2100 AND "month" BETWEEN 1 AND 12` | [M30:32](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L32) |
| `payroll_periods_close_consistent` | `("status" = 'OPEN' AND "closedAt" IS NULL AND "closedById" IS NULL) OR ("status" = 'CLOSED' AND "closedAt" IS NOT NULL AND "closedById" IS NOT NULL)` | [M30:33](../../prisma/migrations/20260718230000_add_payroll_finance/migration.sql#L33) |

### FinancePlanEntry → `finance_plan_entries`

Prisma: [P:1237](../../prisma/schema.prisma#L1237). CREATE TABLE: [M12:5](../../prisma/migrations/20260402091730_add_finance_plan_entries/migration.sql#L5). PK: `finance_plan_entries_pkey` (`id`), [M12:15](../../prisma/migrations/20260402091730_add_finance_plan_entries/migration.sql#L15).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:1238](../../prisma/schema.prisma#L1238), [M12:6](../../prisma/migrations/20260402091730_add_finance_plan_entries/migration.sql#L6) |
| `employeeId` | `String` | `TEXT` | нет | — | — | [P:1239](../../prisma/schema.prisma#L1239), [M12:7](../../prisma/migrations/20260402091730_add_finance_plan_entries/migration.sql#L7) |
| `projectId` | `String?` | `TEXT` | да | — | — | [P:1241](../../prisma/schema.prisma#L1241), [M13:2](../../prisma/migrations/20260402144508_add_project_to_finance_plan_entries/migration.sql#L2) |
| `year` | `Int` | `INTEGER` | нет | — | — | [P:1243](../../prisma/schema.prisma#L1243), [M12:8](../../prisma/migrations/20260402091730_add_finance_plan_entries/migration.sql#L8) |
| `month` | `Int` | `INTEGER` | нет | — | — | [P:1244](../../prisma/schema.prisma#L1244), [M12:9](../../prisma/migrations/20260402091730_add_finance_plan_entries/migration.sql#L9) |
| `type` | `FinancePlanType` | `"finance_plan_type"` | нет | — | — | [P:1245](../../prisma/schema.prisma#L1245), [M12:10](../../prisma/migrations/20260402091730_add_finance_plan_entries/migration.sql#L10) |
| `amount` | `Decimal` | `DECIMAL(12,2)` | нет | — | — | [P:1246](../../prisma/schema.prisma#L1246), [M12:11](../../prisma/migrations/20260402091730_add_finance_plan_entries/migration.sql#L11) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1248](../../prisma/schema.prisma#L1248), [M12:12](../../prisma/migrations/20260402091730_add_finance_plan_entries/migration.sql#L12) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:1249](../../prisma/schema.prisma#L1249), [M12:13](../../prisma/migrations/20260402091730_add_finance_plan_entries/migration.sql#L13) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `finance_plan_entries_employeeId_fkey` | `employeeId` → `employees(id)` | RESTRICT / CASCADE | [M12:25](../../prisma/migrations/20260402091730_add_finance_plan_entries/migration.sql#L25) |
| `finance_plan_entries_projectId_fkey` | `projectId` → `projects(id)` | CASCADE / CASCADE | [M20:4](../../prisma/migrations/20260716203300_db_cascade_project_delete/migration.sql#L4) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `finance_plan_entries_year_month_type_idx` | нет | `"year", "month", "type"` | есть | [M12:19](../../prisma/migrations/20260402091730_add_finance_plan_entries/migration.sql#L19) |
| `finance_plan_entries_employeeId_year_month_type_idx` | нет | `"employeeId", "year", "month", "type"` | есть | [M14:3](../../prisma/migrations/20260402203000_allow_multi_project_nadbavka/migration.sql#L3) |
| `finance_plan_entries_employeeId_year_month_type_projectId_key` | да | `"employeeId", "year", "month", "type", "projectId"` | есть | [M14:6](../../prisma/migrations/20260402203000_allow_multi_project_nadbavka/migration.sql#L6) |
| `finance_plan_entries_without_project_key` | да | `"employeeId", "year", "month", "type" WHERE "projectId" IS NULL` | raw SQL | [M19:99](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L99) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `finance_plan_entries_amount_nonnegative` | `"amount" >= 0` | [M19:141](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L141) |

### PersonnelAction → `personnel_actions`

Prisma: [P:1257](../../prisma/schema.prisma#L1257). CREATE TABLE: [M06:41](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L41). PK: `personnel_actions_pkey` (`id`), [M06:53](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L53).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:1258](../../prisma/schema.prisma#L1258), [M06:42](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L42) |
| `type` | `PersonnelActionType` | `"personnel_action_type"` | нет | — | — | [P:1259](../../prisma/schema.prisma#L1259), [M06:43](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L43) |
| `date` | `DateTime` | `TIMESTAMP(3)` | нет | — | — | [P:1260](../../prisma/schema.prisma#L1260), [M06:44](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L44) |
| `description` | `String?` | `TEXT` | да | — | — | [P:1261](../../prisma/schema.prisma#L1261), [M06:45](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L45) |
| `employeeId` | `String` | `TEXT` | нет | — | — | [P:1264](../../prisma/schema.prisma#L1264), [M06:46](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L46) |
| `oldDepartment` | `String?` | `TEXT` | да | — | — | [P:1268](../../prisma/schema.prisma#L1268), [M06:47](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L47) |
| `newDepartment` | `String?` | `TEXT` | да | — | — | [P:1269](../../prisma/schema.prisma#L1269), [M06:48](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L48) |
| `oldPosition` | `String?` | `TEXT` | да | — | — | [P:1270](../../prisma/schema.prisma#L1270), [M06:49](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L49) |
| `newPosition` | `String?` | `TEXT` | да | — | — | [P:1271](../../prisma/schema.prisma#L1271), [M06:50](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L50) |
| `oldContractEndDate` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:1272](../../prisma/schema.prisma#L1272), [M07:6](../../prisma/migrations/20260316062522_add_employee_contract_dates/migration.sql#L6) |
| `newContractEndDate` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:1273](../../prisma/schema.prisma#L1273), [M07:5](../../prisma/migrations/20260316062522_add_employee_contract_dates/migration.sql#L5) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1275](../../prisma/schema.prisma#L1275), [M06:51](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L51) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `personnel_actions_employeeId_fkey` | `employeeId` → `employees(id)` | RESTRICT / CASCADE | [M06:75](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L75) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `personnel_actions_employeeId_date_idx` | нет | `"employeeId", "date"` | есть | [M19:81](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L81) |

SQL CHECK: нет.

### Vacation → `vacations`

Prisma: [P:1293](../../prisma/schema.prisma#L1293). CREATE TABLE: [M06:57](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L57). PK: `vacations_pkey` (`id`), [M06:65](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L65).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:1294](../../prisma/schema.prisma#L1294), [M06:58](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L58) |
| `startDate` | `DateTime` | `TIMESTAMP(3)` | нет | — | — | [P:1295](../../prisma/schema.prisma#L1295), [M06:59](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L59) |
| `endDate` | `DateTime` | `TIMESTAMP(3)` | нет | — | — | [P:1296](../../prisma/schema.prisma#L1296), [M06:60](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L60) |
| `type` | `VacationType` | `"vacation_type"` | нет | `'VACATION'` | `@default(VACATION)` | [P:1297](../../prisma/schema.prisma#L1297), [M06:61](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L61) |
| `employeeId` | `String` | `TEXT` | нет | — | — | [P:1300](../../prisma/schema.prisma#L1300), [M06:62](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L62) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1303](../../prisma/schema.prisma#L1303), [M06:63](../../prisma/migrations/20260227125344_add_employees_and_staff_schedule/migration.sql#L63) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `vacations_employeeId_fkey` | `employeeId` → `employees(id)` | CASCADE / CASCADE | [M18:23](../../prisma/migrations/20260411164424_test/migration.sql#L23) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `vacations_employeeId_startDate_idx` | нет | `"employeeId", "startDate"` | есть | [M19:82](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L82) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `vacations_date_range` | `"startDate" <= "endDate"` | [M19:131](../../prisma/migrations/20260716123000_add_users_holdings_and_constraints/migration.sql#L131) |

### Document → `documents`

Prisma: [P:1342](../../prisma/schema.prisma#L1342). CREATE TABLE: [M23:23](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L23). PK: `documents_pkey` (`id`), [M23:39](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L39).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:1343](../../prisma/schema.prisma#L1343), [M23:24](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L24) |
| `title` | `String` | `TEXT` | нет | — | — | [P:1344](../../prisma/schema.prisma#L1344), [M23:25](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L25) |
| `description` | `String?` | `TEXT` | да | — | — | [P:1345](../../prisma/schema.prisma#L1345), [M23:26](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L26) |
| `category` | `DocumentCategory` | `"document_category"` | нет | `'GENERAL'` | `@default(GENERAL)` | [P:1346](../../prisma/schema.prisma#L1346), [M23:27](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L27) |
| `status` | `DocumentStatus` | `"document_status"` | нет | `'DRAFT'` | `@default(DRAFT)` | [P:1347](../../prisma/schema.prisma#L1347), [M23:28](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L28) |
| `currentVersion` | `Int` | `INTEGER` | нет | `1` | `@default(1)` | [P:1348](../../prisma/schema.prisma#L1348), [M23:29](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L29) |
| `lockVersion` | `Int` | `INTEGER` | нет | `1` | `@default(1)` | [P:1349](../../prisma/schema.prisma#L1349), [M23:30](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L30) |
| `projectId` | `String?` | `TEXT` | да | — | — | [P:1351](../../prisma/schema.prisma#L1351), [M23:31](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L31) |
| `employeeId` | `String?` | `TEXT` | да | — | — | [P:1354](../../prisma/schema.prisma#L1354), [M23:32](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L32) |
| `assetId` | `String?` | `TEXT` | да | — | — | [P:1357](../../prisma/schema.prisma#L1357), [M23:33](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L33) |
| `createdById` | `String` | `TEXT` | нет | — | — | [P:1360](../../prisma/schema.prisma#L1360), [M23:34](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L34) |
| `archivedAt` | `DateTime?` | `TIMESTAMP(3)` | да | — | — | [P:1363](../../prisma/schema.prisma#L1363), [M23:35](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L35) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1364](../../prisma/schema.prisma#L1364), [M23:36](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L36) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:1365](../../prisma/schema.prisma#L1365), [M23:37](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L37) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `documents_projectId_fkey` | `projectId` → `projects(id)` | SET NULL / CASCADE | [M23:106](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L106) |
| `documents_employeeId_fkey` | `employeeId` → `employees(id)` | SET NULL / CASCADE | [M23:109](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L109) |
| `documents_assetId_fkey` | `assetId` → `assets(id)` | SET NULL / CASCADE | [M23:112](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L112) |
| `documents_createdById_fkey` | `createdById` → `users(id)` | RESTRICT / CASCADE | [M23:115](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L115) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `documents_status_updatedAt_idx` | нет | `"status", "updatedAt"` | есть | [M23:94](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L94) |
| `documents_category_updatedAt_idx` | нет | `"category", "updatedAt"` | есть | [M23:96](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L96) |
| `documents_projectId_idx` | нет | `"projectId"` | есть | [M23:98](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L98) |
| `documents_employeeId_idx` | нет | `"employeeId"` | есть | [M23:99](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L99) |
| `documents_assetId_idx` | нет | `"assetId"` | есть | [M23:100](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L100) |
| `documents_createdById_idx` | нет | `"createdById"` | есть | [M23:101](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L101) |
| `documents_archivedAt_updatedAt_idx` | нет | `"archivedAt", "updatedAt"` | есть | [M23:102](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L102) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `documents_title_not_blank` | `LENGTH(BTRIM("title")) > 0` | [M23:40](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L40) |
| `documents_currentVersion_positive` | `"currentVersion" > 0` | [M23:41](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L41) |
| `documents_lockVersion_positive` | `"lockVersion" > 0` | [M23:42](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L42) |
| `documents_archive_consistent` | `("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL) OR ("status" <> 'ARCHIVED' AND "archivedAt" IS NULL)` | [M23:43](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L43) |

Triggers: `documents_current_version_exists` ([M23:160](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L160)).

### DocumentVersion → `document_versions`

Prisma: [P:1382](../../prisma/schema.prisma#L1382). CREATE TABLE: [M23:49](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L49). PK: `document_versions_pkey` (`id`), [M23:63](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L63).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:1383](../../prisma/schema.prisma#L1383), [M23:50](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L50) |
| `documentId` | `String` | `TEXT` | нет | — | — | [P:1384](../../prisma/schema.prisma#L1384), [M23:51](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L51) |
| `versionNumber` | `Int` | `INTEGER` | нет | — | — | [P:1386](../../prisma/schema.prisma#L1386), [M23:52](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L52) |
| `storageKey` | `String` | `TEXT` | нет | — | — | [P:1387](../../prisma/schema.prisma#L1387), [M23:53](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L53) |
| `originalFilename` | `String` | `TEXT` | нет | — | — | [P:1388](../../prisma/schema.prisma#L1388), [M23:54](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L54) |
| `mimeType` | `String` | `TEXT` | нет | — | — | [P:1389](../../prisma/schema.prisma#L1389), [M23:55](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L55) |
| `extension` | `String` | `TEXT` | нет | — | — | [P:1390](../../prisma/schema.prisma#L1390), [M23:56](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L56) |
| `sizeBytes` | `BigInt` | `BIGINT` | нет | — | — | [P:1391](../../prisma/schema.prisma#L1391), [M23:57](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L57) |
| `sha256` | `String` | `TEXT` | нет | — | — | [P:1392](../../prisma/schema.prisma#L1392), [M23:58](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L58) |
| `comment` | `String?` | `TEXT` | да | — | — | [P:1393](../../prisma/schema.prisma#L1393), [M23:59](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L59) |
| `uploadedById` | `String` | `TEXT` | нет | — | — | [P:1395](../../prisma/schema.prisma#L1395), [M23:60](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L60) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1398](../../prisma/schema.prisma#L1398), [M23:61](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L61) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `document_versions_documentId_fkey` | `documentId` → `documents(id)` | CASCADE / CASCADE | [M23:120](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L120) |
| `document_versions_uploadedById_fkey` | `uploadedById` → `users(id)` | RESTRICT / CASCADE | [M23:123](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L123) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `document_versions_storageKey_key` | да | `"storageKey"` | есть | [M23:85](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L85) |
| `document_versions_documentId_versionNumber_key` | да | `"documentId", "versionNumber"` | есть | [M23:87](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L87) |
| `document_versions_documentId_createdAt_idx` | нет | `"documentId", "createdAt"` | есть | [M23:89](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L89) |
| `document_versions_uploadedById_idx` | нет | `"uploadedById"` | есть | [M23:91](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L91) |

| CHECK name (raw SQL) | Expression | Источник |
|---|---|---|
| `document_versions_number_positive` | `"versionNumber" > 0` | [M23:64](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L64) |
| `document_versions_size_valid` | `"sizeBytes" > 0 AND "sizeBytes" <= 104857600` | [M23:65](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L65) |
| `document_versions_filename_not_blank` | `LENGTH(BTRIM("originalFilename")) > 0` | [M23:68](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L68) |
| `document_versions_mime_not_blank` | `LENGTH(BTRIM("mimeType")) > 0` | [M23:71](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L71) |
| `document_versions_extension_safe` | `"extension" ~ '^[a-z0-9]{1,10}$'` | [M23:74](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L74) |
| `document_versions_sha256_valid` | `"sha256" ~ '^[0-9a-f]{64}$'` | [M23:77](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L77) |
| `document_versions_storage_key_safe` | `"storageKey" ~ '^[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f-]{36}$'` | [M23:80](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L80) |

Triggers: `document_versions_immutable` ([M23:137](../../prisma/migrations/20260718141000_add_local_document_management/migration.sql#L137)).

### ReportPreset → `report_presets`

Prisma: [P:1406](../../prisma/schema.prisma#L1406). CREATE TABLE: [M32:2](../../prisma/migrations/20260719074857_add_report_presets/migration.sql#L2). PK: `report_presets_pkey` (`id`), [M32:11](../../prisma/migrations/20260719074857_add_report_presets/migration.sql#L11).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:1407](../../prisma/schema.prisma#L1407), [M32:3](../../prisma/migrations/20260719074857_add_report_presets/migration.sql#L3) |
| `name` | `String` | `TEXT` | нет | — | — | [P:1408](../../prisma/schema.prisma#L1408), [M32:4](../../prisma/migrations/20260719074857_add_report_presets/migration.sql#L4) |
| `metrics` | `String[]` | `TEXT[]` | да | — | `Prisma list non-null` | [P:1409](../../prisma/schema.prisma#L1409), [M32:5](../../prisma/migrations/20260719074857_add_report_presets/migration.sql#L5) |
| `groupBy` | `String?` | `TEXT` | да | — | — | [P:1410](../../prisma/schema.prisma#L1410), [M32:6](../../prisma/migrations/20260719074857_add_report_presets/migration.sql#L6) |
| `filters` | `Json?` | `JSONB` | да | — | — | [P:1411](../../prisma/schema.prisma#L1411), [M32:7](../../prisma/migrations/20260719074857_add_report_presets/migration.sql#L7) |
| `createdById` | `String` | `TEXT` | нет | — | — | [P:1412](../../prisma/schema.prisma#L1412), [M32:8](../../prisma/migrations/20260719074857_add_report_presets/migration.sql#L8) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1414](../../prisma/schema.prisma#L1414), [M32:9](../../prisma/migrations/20260719074857_add_report_presets/migration.sql#L9) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `report_presets_createdById_fkey` | `createdById` → `users(id)` | CASCADE / CASCADE | [M32:18](../../prisma/migrations/20260719074857_add_report_presets/migration.sql#L18) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `report_presets_createdById_idx` | нет | `"createdById"` | есть | [M32:15](../../prisma/migrations/20260719074857_add_report_presets/migration.sql#L15) |

SQL CHECK: нет.

### AssetSavedView → `asset_saved_views`

Prisma: [P:1420](../../prisma/schema.prisma#L1420). CREATE TABLE: [M36:1](../../prisma/migrations/20260924160000_add_asset_saved_views/migration.sql#L1). PK: `asset_saved_views_pkey` (`id`), [M36:9](../../prisma/migrations/20260924160000_add_asset_saved_views/migration.sql#L9).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | — | `PK`; `@default(cuid())` | [P:1421](../../prisma/schema.prisma#L1421), [M36:2](../../prisma/migrations/20260924160000_add_asset_saved_views/migration.sql#L2) |
| `userId` | `String` | `TEXT` | нет | — | — | [P:1422](../../prisma/schema.prisma#L1422), [M36:3](../../prisma/migrations/20260924160000_add_asset_saved_views/migration.sql#L3) |
| `name` | `String` | `TEXT` | нет | — | — | [P:1424](../../prisma/schema.prisma#L1424), [M36:4](../../prisma/migrations/20260924160000_add_asset_saved_views/migration.sql#L4) |
| `filters` | `Json` | `JSONB` | нет | — | — | [P:1425](../../prisma/schema.prisma#L1425), [M36:5](../../prisma/migrations/20260924160000_add_asset_saved_views/migration.sql#L5) |
| `createdAt` | `DateTime` | `TIMESTAMP(3)` | нет | `CURRENT_TIMESTAMP` | `@default(now())` | [P:1426](../../prisma/schema.prisma#L1426), [M36:6](../../prisma/migrations/20260924160000_add_asset_saved_views/migration.sql#L6) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:1427](../../prisma/schema.prisma#L1427), [M36:7](../../prisma/migrations/20260924160000_add_asset_saved_views/migration.sql#L7) |

| FK name | Колонки → target | DELETE / UPDATE | Источник |
|---|---|---|---|
| `asset_saved_views_userId_fkey` | `userId` → `users(id)` | CASCADE / CASCADE | [M36:19](../../prisma/migrations/20260924160000_add_asset_saved_views/migration.sql#L19) |

| Index name | UNIQUE | Expression / WHERE | Prisma | Источник |
|---|---|---|---|---|
| `asset_saved_views_userId_name_key` | да | `"userId", "name"` | есть | [M36:12](../../prisma/migrations/20260924160000_add_asset_saved_views/migration.sql#L12) |
| `asset_saved_views_userId_updatedAt_idx` | нет | `"userId", "updatedAt"` | есть | [M36:15](../../prisma/migrations/20260924160000_add_asset_saved_views/migration.sql#L15) |

SQL CHECK: нет.

### SmtpSettings → `smtp_settings`

Prisma: [P:1434](../../prisma/schema.prisma#L1434). CREATE TABLE: [M33:2](../../prisma/migrations/20260719075543_add_smtp_settings/migration.sql#L2). PK: `smtp_settings_pkey` (`id`), [M33:12](../../prisma/migrations/20260719075543_add_smtp_settings/migration.sql#L12).

| Field = SQL column | Prisma type | SQL type | SQL NULL | PG default | Prisma | Источники |
|---|---|---|---|---|---|---|
| `id` | `String` | `TEXT` | нет | `'singleton'` | `PK`; `@default("singleton")` | [P:1435](../../prisma/schema.prisma#L1435), [M33:3](../../prisma/migrations/20260719075543_add_smtp_settings/migration.sql#L3) |
| `host` | `String` | `TEXT` | нет | — | — | [P:1436](../../prisma/schema.prisma#L1436), [M33:4](../../prisma/migrations/20260719075543_add_smtp_settings/migration.sql#L4) |
| `port` | `Int` | `INTEGER` | нет | — | — | [P:1437](../../prisma/schema.prisma#L1437), [M33:5](../../prisma/migrations/20260719075543_add_smtp_settings/migration.sql#L5) |
| `username` | `String` | `TEXT` | нет | — | — | [P:1438](../../prisma/schema.prisma#L1438), [M33:6](../../prisma/migrations/20260719075543_add_smtp_settings/migration.sql#L6) |
| `password` | `String` | `TEXT` | нет | — | — | [P:1439](../../prisma/schema.prisma#L1439), [M33:7](../../prisma/migrations/20260719075543_add_smtp_settings/migration.sql#L7) |
| `secure` | `Boolean` | `BOOLEAN` | нет | `false` | `@default(false)` | [P:1440](../../prisma/schema.prisma#L1440), [M33:8](../../prisma/migrations/20260719075543_add_smtp_settings/migration.sql#L8) |
| `fromEmail` | `String` | `TEXT` | нет | — | — | [P:1441](../../prisma/schema.prisma#L1441), [M33:9](../../prisma/migrations/20260719075543_add_smtp_settings/migration.sql#L9) |
| `updatedAt` | `DateTime` | `TIMESTAMP(3)` | нет | — | `@updatedAt: client` | [P:1442](../../prisma/schema.prisma#L1442), [M33:10](../../prisma/migrations/20260719075543_add_smtp_settings/migration.sql#L10) |

FK: нет.

Отдельные unique/index: нет.

SQL CHECK: нет.

## Ограничения для SQLAlchemy mapping и Alembic baseline

1. На этапе 02 перенести все 51 model/Table с точными SQL names и quoting camelCase columns; string PK/CUID generation остаётся application-side, SERIAL sequence — server-side. Сохранить enum SQL names, values и SQL order; не создавать VARCHAR/новый enum или UUID PK вместо текущих объектов.
2. Сохранить каждый тип/scale/NULL/default, 51 PK, 90 FK с DELETE/UPDATE actions и финальные 132 index definitions. Учесть 4 array nullable расхождения без скрытой очистки данных/DDL. `@updatedAt` повторить в write path/ORM event/default+onupdate и проверить inserts/updates; DB-trigger этого не делает.
3. Повторить 53 CHECK, partial unique, LOWER-expression unique, четыре SQL functions и четыре triggers (с DEFERRABLE/statement/row semantics и SQLSTATE). Metadata/autogenerate без этих объектов не является полной baseline. Пример CREATE TABLE без document triggers пропустит currentVersion/immutability гарантии.
4. Не усиливать ограничения при parity mapping. SQL не гарантирует singleton SMTP, indirect manager-cycle, task parent/project/level согласованность, dependency graph acyclicity, project-task соответствие time entries, approved-state rules для timesheets, employeeRate positivity, неизменяемость audit_logs или корректные scope grants: service/API правила фиксируются другими реестрами. Новые ограничения — отдельное изменение после проверки данных, не автоматическая миграция.
5. `Date` против timestamp без timezone, Decimal rounding, SQL NULL против JSON null, optional FK и список arrays проверить round trips на отдельной копии PostgreSQL; не заменять PostgreSQL на SQLite для доказательства enum/index/trigger/locking поведения.
6. До этапа 14 Prisma владеет DDL. Для handoff сначала сравнить живую копию с этим ожидаемым DDL и `_prisma_migrations`; собрать baseline, которая создаёт эквивалентную пустую БД. Только после подтверждения эквивалентности существующая копия может быть принята через Alembic stamp. `stamp` не создаёт и не проверяет схему; `_prisma_migrations` сохранить как историю. Не применять legacy-backfill повторно поверх текущих данных.
7. Сверить через pg_catalog реальные имена/definitions/validity indexes, catalog enum sort order, FK deferrability, triggers/functions enabled state, schema/search_path, timestamp precision/timezone, CHECK validation state, sequence default/owner/state и возможные внешние extensions/grants. Этот source inventory не подтверждает отсутствие live drift.

Проверка этого документа: все 41 SQL-файл прочитаны; финальная статическая реконструкция сопоставлена с каждой Prisma model/enum; нераспознанных SQL statements нет. Отдельно сравнены read-only PostgreSQL snapshots от root: исходная БД с первыми 38 миграциями и актуальная копия со всеми 41. В проверенной metadata актуальной копии расхождений нет; исключения перечислены выше. Прямых DB/test/API/E2E запусков этот исполнитель не выполнял; запуск копий и проверки runtime ведёт root.
