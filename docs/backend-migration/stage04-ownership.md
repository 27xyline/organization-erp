# Текущие владельцы подразделений и справочников после этапа 04

Этап 04 переключает browser API и SSR для подразделений, групп имущества и МОЛ. Этот документ фиксирует текущее состояние после Stage 04 и не перезаписывает исторический snapshot этапа 00 в `write-owners.md` / `write-owners.json`.

| Область | Владелец | Граница |
| --- | --- | --- |
| CRUD и scope для `/api/departments*`, `/api/groups*`, `/api/mols*` | Python | Next.js сохраняет публичные URL и проверяет session, Origin, forced-password restriction и локальные permissions; затем fixed-path BFF передает запрос через Stage 03 bridge. Python повторно проверяет actor, permissions и resource/department scopes. Ошибка backend не включает Prisma fallback. |
| Department CRUD, hierarchy invariants и audit | Python | Service использует общий organization lock `904202607`, проверяет parent/head/usage и пишет аудит в одной UoW. Переименование также обновляет денормализованные `Employee.department`, `StaffSchedule.department` и `Mol.department`, сохраняя поведение TS baseline. Employee CRUD остаётся вне Stage 04. |
| Asset group и MOL CRUD, scopes и audit | Python | CRUD идет через catalogs service/repository/UoW. MOL mutation проверяет исходное и целевое подразделение; scoped list и direct-ID checks выполняются в backend. |
| SSR страниц `/admin/departments`, `/groups`, `/mols` и справочники форм | Python для данных; Next.js для рендера | Страницы сначала проверяют прежние permissions, затем вызывают `backendUserFetch` (private/no-store). `/api/departments/references` и `/api/mols/references` — backend SSR data endpoints; они не добавляют публичные Next browser routes. |
| Остальные Prisma reads моделей Department/AssetGroup/MOL | Next.js/Prisma | Не относящиеся к Stage 04 модули и импортеры сохраняют совместимые read paths к общим таблицам. Их бизнес-функции не переключены этим этапом. |
| Очистка `Department.headEmployeeId` при кадровых операциях | Next.js/Prisma, Stage 05 boundary | `clearEmployeeDepartmentLeadership` остаётся частью Employee/Personnel Action mutations и вызывается под organization advisory lock. Это осознанное исключение; Stage 04 не утверждает, что все записи, затрагивающие Department, принадлежат Python. |
| Demo seed и тестовые fixtures | Отдельные TS ops/test entrypoints | `prisma/demo-seed.ts` остаётся gated bootstrap writer под `ALLOW_DEMO_SEED`; E2E setup пишет только synthetic fixtures. Это не browser CRUD путь и не Python writer. Не запускайте seed параллельно с runtime-модификациями: начальные записи должны быть готовы до приложения/тестового сценария. |
| DDL и schema migrations | Prisma до этапа 14 | Stage 04 не применяет Prisma migrations или Alembic и не меняет владельца DDL. |

Публичные ответы чтения и изменений сохраняют `{data: ...}` / `{error: {code, message}}`, прежние URL и методы; создание возвращает HTTP 201. BFF и scope contract, живая legacy TS parity capture и её Python-сравнение описаны в [отчёте Stage 04](stage04-validation.md): тест сравнил девять нормализованных audit events и прошёл в полном наборе `95 passed`.
