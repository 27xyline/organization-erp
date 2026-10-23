# Исходная матрица покрытия backend

Исходный снимок source coverage от 28 сентября 2026; URLs/methods остаются базовым каталогом, а колонка владельца обновляется по мере завершения этапов. Этап 00 уточнил body/response/errors/scopes и добавил writers/callers. Владелец DDL остаётся у Prisma до этапа 14.

## HTTP-маршруты

Переключение включает все методы route и связанные SSR-callers. Параметры `[id]` означают URL parameter. Новый Python health не отключает старый health до cutover. NextAuth будет заменён на session endpoints этапа 14, а не побайтно воспроизведён.

| URL | Методы в исходнике | Этап | Владелец сейчас |
|---|---|---|---|
| `/api/account/password` | POST | 03 | Python (Next BFF) |
| `/api/approvals/[id]/cancel` | POST | 09 | Python (Next BFF) |
| `/api/approvals/[id]/decision` | POST | 09 | Python (Next BFF) |
| `/api/approvals/[id]` | GET | 09 | Python (Next BFF) |
| `/api/approvals/options` | GET | 09 | Python (Next BFF) |
| `/api/approvals` | GET, POST | 09 | Python (Next BFF) |
| `/api/approvals/templates/[id]` | PATCH | 09 | Python (Next BFF) |
| `/api/approvals/templates` | GET, POST | 09 | Python (Next BFF) |
| `/api/assets/[id]/archive` | POST | 07 | Python (Next BFF) |
| `/api/assets/[id]/disposals` | POST | 07 | Python (Next BFF) |
| `/api/assets/[id]/maintenance/[maintenanceId]` | PUT | 07 | Python (Next BFF) |
| `/api/assets/[id]/maintenance` | GET, POST | 07 | Python (Next BFF) |
| `/api/assets/[id]/qr` | GET | 07 | Python (Next BFF) |
| `/api/assets/[id]/restore` | POST | 07 | Python (Next BFF) |
| `/api/assets/[id]` | GET, PUT | 07 | Python (Next BFF) |
| `/api/assets/[id]/transfers` | POST | 07 | Python (Next BFF) |
| `/api/assets/import/commit` | POST | 07 | Python (Next BFF) |
| `/api/assets/import/preview` | POST | 07 | Python (Next BFF) |
| `/api/assets/import/template` | GET | 07 | Python (Next BFF) |
| `/api/assets/inventories/[id]/complete` | POST | 07 | Python (Next BFF) |
| `/api/assets/inventories/[id]` | GET | 07 | Python (Next BFF) |
| `/api/assets/inventories/[id]/scan` | POST | 07 | Python (Next BFF) |
| `/api/assets/inventories/options` | GET | 07 | Python (Next BFF) |
| `/api/assets/inventories/resolve` | GET | 07 | Python (Next BFF) |
| `/api/assets/inventories` | GET, POST | 07 | Python (Next BFF) |
| `/api/assets` | GET, POST | 07 | Python (Next BFF) |
| `/api/assets/saved-views/[id]` | DELETE | 07 | Python (Next BFF) |
| `/api/assets/saved-views` | GET, POST | 07 | Python (Next BFF) |
| `/api/auth/[...nextauth]` | GET, POST | 14 | TS |
| `/api/departments/[id]` | PATCH, DELETE | 04 | Python (Next BFF) |
| `/api/departments` | GET, POST | 04 | Python (Next BFF) |
| `/api/documents/[id]/archive` | POST | 08 | Python (Next BFF) |
| `/api/documents/[id]/download` | GET | 08 | Python (Next BFF) |
| `/api/documents/[id]` | GET, PATCH | 08 | Python (Next BFF) |
| `/api/documents/[id]/versions` | POST | 08 | Python (Next BFF) |
| `/api/documents/generate` | POST | 08 | Python (Next BFF) |
| `/api/documents/options` | GET | 08 | Python (Next BFF) |
| `/api/documents` | GET, POST | 08 | Python (Next BFF) |
| `/api/employees/[id]/profile` | PUT | 05 | Python (Next BFF) |
| `/api/employees/[id]` | PUT, DELETE | 05 | Python (Next BFF) |
| `/api/employees` | GET, POST | 05 | Python (Next BFF) |
| `/api/export` | GET | 12 | TS |
| `/api/finance/plans` | GET, POST, DELETE | 10 | Python (Next BFF) |
| `/api/finance/salary` | GET | 10 | Python (Next BFF) |
| `/api/groups/[id]` | GET, PUT, DELETE | 04 | Python (Next BFF) |
| `/api/groups` | GET, POST | 04 | Python (Next BFF) |
| `/api/health/live` | GET | 01 | TS |
| `/api/health/ready` | GET | 01 | TS |
| `/api/mols/[id]` | GET, PUT, DELETE | 04 | Python (Next BFF) |
| `/api/mols` | GET, POST | 04 | Python (Next BFF) |
| `/api/notifications/[id]` | PATCH, DELETE | 09 | Python (Next BFF) |
| `/api/notifications/generate-alerts` | POST | 13 | TS |
| `/api/notifications/preferences` | GET, PUT | 09 | Python (Next BFF) |
| `/api/notifications/read-all` | POST | 09 | Python (Next BFF) |
| `/api/notifications` | GET | 09 | Python (Next BFF) |
| `/api/notifications/smtp/process` | POST | 13 | TS |
| `/api/notifications/smtp` | GET, POST | 09 | Python (Next BFF) |
| `/api/notifications/smtp/test` | POST | 09 | Python (Next BFF) |
| `/api/notifications/unread-count` | GET | 09 | Python (Next BFF) |
| `/api/operations` | GET | 07 | Python (Next BFF) |
| `/api/payroll/adjustments/[id]` | DELETE | 10 | TS |
| `/api/payroll/export` | GET | 10 | TS |
| `/api/payroll/export-payslip` | GET | 10 | TS |
| `/api/payroll/period` | PUT | 10 | TS |
| `/api/payroll` | GET, POST | 10 | TS |
| `/api/personnel-actions/[id]` | DELETE | 05 | Python (Next BFF) |
| `/api/personnel-actions` | GET, POST | 05 | Python (Next BFF) |
| `/api/personnel-actions/sync` | POST | 05 | Python (Next BFF) |
| `/api/procurement/[id]/contract` | POST | 11 | TS |
| `/api/procurement/[id]/deliveries` | POST | 11 | TS |
| `/api/procurement/[id]` | GET, PUT | 11 | TS |
| `/api/procurement/[id]/submit` | POST | 11 | TS |
| `/api/procurement/delivery-items/[id]/capitalize` | POST | 11 | TS |
| `/api/procurement/options` | GET | 11 | TS |
| `/api/procurement` | GET, POST | 11 | TS |
| `/api/procurement/suppliers` | POST | 11 | TS |
| `/api/projects/[id]/members/[memberId]` | PATCH | 06 | Python (Next BFF) |
| `/api/projects/[id]/members` | GET, POST | 06 | Python (Next BFF) |
| `/api/projects/[id]/payroll` | GET, PUT, DELETE | 10 | Python (Next BFF) |
| `/api/projects/[id]` | GET, PUT, DELETE | 06 | Python (Next BFF) |
| `/api/projects/[id]/tasks` | GET, POST | 06 | Python (Next BFF) |
| `/api/projects` | GET, POST | 06 | Python (Next BFF) |
| `/api/reports/custom` | POST | 12 | TS |
| `/api/reports/depreciation` | GET | 12 | TS |
| `/api/reports/export` | GET | 12 | TS |
| `/api/reports/presets` | GET, POST, DELETE | 12 | TS |
| `/api/reports/profitability` | GET | 12 | TS |
| `/api/reports/turnover` | GET | 12 | TS |
| `/api/reports/vacations` | GET | 12 | TS |
| `/api/search` | GET | 12 | TS |
| `/api/staff-schedule/[id]` | PUT, DELETE | 05 | Python (Next BFF) |
| `/api/staff-schedule` | GET, POST | 05 | Python (Next BFF) |
| `/api/tasks/[id]/comments` | POST | 06 | Python (Next BFF) |
| `/api/tasks/[id]` | PUT, DELETE | 06 | Python (Next BFF) |
| `/api/time-entries/[id]` | PUT, DELETE | 10 | Python (Next BFF) |
| `/api/time-entries` | GET, POST | 10 | Python (Next BFF) |
| `/api/timekeeping/timesheets/[id]/decision` | POST | 10 | Python (Next BFF) |
| `/api/timekeeping/timesheets` | POST | 10 | Python (Next BFF) |
| `/api/users/[id]` | PATCH | 03 | Python (Next BFF) |
| `/api/users` | GET, POST | 03 | Python (Next BFF) |
| `/api/vacations/[id]` | PUT, DELETE | 05 | Python (Next BFF) |
| `/api/vacations` | GET, POST | 05 | Python (Next BFF) |

Итого: 102 route файлов. Новые internal bridge/session endpoints добавляются отдельно. Все найденные методы должны быть учтены, включая negative permissions и binary/multipart ответы.

## Модели PostgreSQL

Все модели mapped на этапе 02; этап в таблице — перенос бизнес-сценариев. Имена таблиц взяты из `@@map`. Column names/defaults/constraints дополняются из живой схемы и SQL миграций в 00.

| Prisma model | Таблица PostgreSQL | Этап сценариев |
|---|---|---|
| `Mol` | `mols` | 04 |
| `Department` | `departments` | 04 |
| `AssetGroup` | `asset_groups` | 04 |
| `Asset` | `assets` | 07 |
| `AssetMaintenance` | `asset_maintenance` | 07 |
| `Operation` | `operations` | 07 |
| `AssetHolding` | `asset_holdings` | 07 |
| `AssetInventory` | `asset_inventories` | 07 |
| `AssetInventoryEntry` | `asset_inventory_entries` | 07 |
| `User` | `users` | 03 |
| `UserRoleAssignment` | `user_role_assignments` | 03 |
| `UserDepartmentScope` | `user_department_scopes` | 03 |
| `UserProjectScope` | `user_project_scopes` | 03 |
| `AuditLog` | `audit_logs` | 03 producer; 14 DB immutability |
| `Notification` | `notifications` | 09 |
| `NotificationPreference` | `notification_preferences` | 09 |
| `NotificationOutbox` | `notification_outbox` | 03 producer; 13 processor |
| `ScheduledAlertRun` | `scheduled_alert_runs` | 13 processor |
| `ApprovalRequest` | `approval_requests` | 09 |
| `ApprovalStep` | `approval_steps` | 09 |
| `ApprovalTemplate` | `approval_templates` | 09 |
| `Project` | `projects` | 06 |
| `Supplier` | `suppliers` | 11 |
| `ProcurementRequest` | `procurement_requests` | 11 |
| `ProcurementItem` | `procurement_items` | 11 |
| `ProcurementContract` | `procurement_contracts` | 11 |
| `ProcurementDelivery` | `procurement_deliveries` | 11 |
| `ProcurementDeliveryItem` | `procurement_delivery_items` | 11 |
| `ProjectMember` | `project_members` | 06 |
| `Task` | `tasks` | 06 |
| `TaskDependency` | `task_dependencies` | 06 |
| `TaskChecklistItem` | `task_checklist_items` | 06 |
| `TaskComment` | `task_comments` | 06 |
| `TaskAssignee` | `task_assignees` | 06 |
| `Employee` | `employees` | 05 |
| `EmployeeSkill` | `employee_skills` | 05 |
| `EmployeeCertificate` | `employee_certificates` | 05 |
| `TimeEntry` | `time_entries` | 10 |
| `Timesheet` | `timesheets` | 10 |
| `StaffSchedule` | `staff_schedule` | 05 |
| `SalaryEntry` | `salary_entries` | 10 |
| `PayrollAdjustment` | `payroll_adjustments` | 10 |
| `PayrollPeriod` | `payroll_periods` | 10 |
| `FinancePlanEntry` | `finance_plan_entries` | 10 |
| `PersonnelAction` | `personnel_actions` | 05 |
| `Vacation` | `vacations` | 05 |
| `Document` | `documents` | 08 |
| `DocumentVersion` | `document_versions` | 08 |
| `ReportPreset` | `report_presets` | 12 |
| `AssetSavedView` | `asset_saved_views` | 07 |
| `SmtpSettings` | `smtp_settings` | 09 |

Итого: 51 исходных моделей. Новая обязательная таблица `backend_sessions` появляется только на этапе 14 после Alembic handoff.

## Общие readers/writers и инфраструктура

| Источник | Что учесть | Этап |
|---|---|---|
| `src/lib/auth.ts`, `src/lib/auth/*` | Credentials, locks, scopes, sessionVersion, forced change | 03, 14 |
| `src/proxy.ts`, providers/login | NextAuth guards и session UI | 14 |
| `src/lib/prisma.ts` | DB factory и Prisma-only audit immutability | 02, 03, 14 |
| `src/lib/payroll-period-transaction.ts` | Все period writers используют общий lock protocol | Helper 05, полный 10 |
| `src/lib/organization/organization-mutation.ts` | Организационная блокировка | 04 |
| `src/features/assets/infrastructure/serializable-transaction.ts` | Bounded concurrency retry | 07 |
| `src/features/documents/infrastructure/*` | Paths, SHA, size и copy volume | 08 |
| `src/worker/*`, notification processors | Claim/lease/retry, один выбранный implementation | 13 |
| `src/lib/observability/*`, `src/instrumentation.ts` | Exporter lifecycle, metrics и traces | 01, 13 |
| `prisma/seed.ts`, `prisma/demo-seed.ts`, `scripts/*` | Все CLI readers/writers, guards, aggregates | 00, 12, 14 |
| `docker-compose*.yml`, Dockerfile, CI | Runtime и migration owner | 01, 13, 14 |
| `ops/observability/*` | Существующие dashboards/alerts | 13 |

Этап 00 расширяет список точными callers в layouts/server actions/scripts. Упоминание директории не означает, что каждый её файл уже изучен.

## Прямые backend-вызовы server pages

Ниже imports application или Prisma, найденные конкретным поисковым pattern. Составные страницы могут переключать reads по частям, но составная запись всегда один согласованный сценарий.

- `src/app/(app)/(main)/admin/departments/page.tsx`
- `src/app/(app)/(main)/admin/users/page.tsx`
- `src/app/(app)/(main)/approvals/[id]/page.tsx`
- `src/app/(app)/(main)/archive/page.tsx`
- `src/app/(app)/(main)/assets/[id]/edit/page.tsx`
- `src/app/(app)/(main)/assets/[id]/page.tsx`
- `src/app/(app)/(main)/assets/[id]/qr/page.tsx`
- `src/app/(app)/(main)/assets/inventory/[id]/act/page.tsx`
- `src/app/(app)/(main)/assets/new/page.tsx`
- `src/app/(app)/(main)/assets/page.tsx`
- `src/app/(app)/(main)/documents/[id]/page.tsx`
- `src/app/(app)/(main)/documents/page.tsx`
- `src/app/(app)/(main)/employees/[id]/page.tsx`
- `src/app/(app)/(main)/employees/page.tsx`
- `src/app/(app)/(main)/groups/page.tsx`
- `src/app/(app)/(main)/mols/page.tsx`
- `src/app/(app)/(main)/notifications/page.tsx`
- `src/app/(app)/(main)/page.tsx`
- `src/app/(app)/(main)/projects/[id]/edit/page.tsx`
- `src/app/(app)/(main)/projects/[id]/page.tsx`
- `src/app/(app)/(main)/projects/page.tsx`
- `src/app/(app)/(main)/reports/page.tsx`

Найдено 22 страниц. Это не доказательство отсутствия других server callers. Полный search/ownership audit обязателен в 00 и 14.
