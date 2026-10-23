# Stage 10 — текущий validation report

## Статус

Stage 10 остаётся **в работе**. Timekeeping workflow, finance plans/salary, project payroll, payroll month/adjustments и payroll period ownership slices переключены на Python через Next BFF. Payroll exports/payslips и полный close/edit/approve browser E2E остаются незавершёнными. Полный Stage 10 acceptance пока не достигнут.

## Готовые изменения

- Добавлены Decimal labor/payroll/finance calculators и finance-plan allocation rules. Реализованы округление `ROUND_HALF_UP`, нормативные часы, бюджетные deltas, план-факт и прибыльность.
- Добавлены Pydantic schemas для time entry/timesheet payloads и payroll period.
- Добавлены `PayrollPeriodRepository` port и SQLAlchemy adapter: upsert уникального `(year, month)`, `SELECT FOR UPDATE`, проверка pending timesheets, close/reopen и обязательная причина reopen.
- `PayrollPeriodService` использует caller-owned UoW, пишет audit в той же транзакции и не добавляет audit при идемпотентном повторе. Зарегистрирован `PUT /api/payroll/period`.
- Test bootstrap распознаёт `STAGE10_TEST_DATABASE_URL` с жёстким ожидаемым именем `erp_stage10_test`; finance integration fixture отказывается подключаться к другим БД.

## RED → GREEN evidence

- Calculators: RED — отсутствовали `app.domain.timekeeping`/`app.domain.finance`; GREEN — focused unit набор прошёл.
- Stage10 DB guard: RED — `STAGE10_TEST_DATABASE_URL` не распознавался; GREEN — принимает только PostgreSQL `erp_stage10_test`, неверное имя отклоняет.
- UoW registration: RED — у UoW отсутствовал `payroll_periods`; GREEN — repository доступен через общий UoW.
- Period workflow: RED — repository не имел `set_status`; GREEN — close/reopen, обязательная причина reopen и тесты на конкурирующий writer проходят.
- Payroll-period service: RED — сервис отсутствовал; затем добавлен отдельный тест, который выявил audit при идемпотентном status update; GREEN — повторный status update возвращает прежний период без audit.
- Route registration: RED — `PUT /api/payroll/period` отсутствовал; GREEN — метод опубликован в OpenAPI.
- Schemas: RED — модули schemas отсутствовали; GREEN — camelCase и date/Decimal inputs сохраняются, RETURN требует причину.

### Timekeeping slice

- UoW ports/repository: RED — отсутствовали `TimekeepingRepository` и UoW field; GREEN — unit registration и PG18 load/save relation test проходят.
- GET month contract: RED — фактический PG18 read выявил `project_options()` scalar unpack ошибки (`ValueError: too many values to unpack`); GREEN — task projection использует row result; проверены employees/projects/tasksList, summary totals, virtual `DRAFT`, period status и serializable relations.
- GET sorting: RED — PG18 тест подтвердил несовпадение порядка entry с прежним `(workDate, employee.fullName)`; GREEN — repository сортирует по дате и имени сотрудника.
- Reviewer chain: RED — dismissed head выбирался как reviewer; GREEN — reviewer query исключает `EmployeeStatus.DISMISSED` и использует HR/Admin fallback. Отдельно проверен подходящий department head.
- Approval composition: RED — отсутствовал caller-owned `decide_approval_in_uow`; GREEN — submit создаёт ApprovalRequest/step/audit через `create_approval_in_uow`, decision переиспользует Stage09 state/audit/notification логику в том же UoW. PG18 test проверяет approval + timesheet rollback при ошибке commit и успешный повтор с notification intent.
- Period concurrency: RED — первая PG18 проверка выявила только загрязнённый фиксированный год тестовым периодом; тест переведён на уникальный период и исправлен порядок cleanup для `closedById`; GREEN — отдельные sessions подтверждают ожидание period row lock, `PERIOD_CLOSED` и неизменённые часы.
- Approved corrections: RED — PG18 `update` оставлял утверждённый табель `APPROVED`; GREEN — create/update/delete сбрасывают табель в `DRAFT` в той же UoW, сбрасывая submit/decision metadata.
- Optional DELETE body: RED — OpenAPI показывал required requestBody, хотя прежний browser caller отправляет DELETE без body; GREEN — body опционален, маршрут OpenAPI отражает legacy contract.
- BFF ownership: RED — четыре новых route tests вызвали прежние Prisma services и завершились database connection errors/undefined auth; GREEN — route handlers сохраняют authorize/schema prechecks и проксируют запросы через authenticated Stage10 bridge. Targeted Vitest: **6 passed**.
- BFF body forwarding: route validation использует `request.clone().json()`; исходное тело остаётся доступным proxy bridge.

### Finance plans, salary и project payroll slice

- Repository/UoW: RED — `FinanceRepository` port/repository и UoW field отсутствовали; GREEN — plan entries, project/member/scope queries и replace/clear доступны через общий caller-owned session.
- Finance DTO/schemas: RED — workflow schemas отсутствовали; GREEN — camelCase payloads принимают legacy decimal strings, нормализуют значения и валидируют period fields.
- Plan/project payroll workflow: PG18 integration подтверждает replace/clear, fixed-two-decimal strings, legacy salary detail strings и атомарные изменения `Project.actualBudget`; scope ограничивает замену project payroll только текущим проектом. Все finance writes вызывают общий `payroll_periods.assert_open()` до изменения данных.
- HTTP envelopes: RED — новый contract test обнаружил лишний `{data: ...}` в plan/project payroll responses; GREEN — GET plans/project payroll возвращают legacy raw payload, POST/PUT/DELETE сохраняют legacy `success` shape, salary GET сохраняет `{data: ...}`.
- BFF ownership: RED — исходные Next handlers вызывали Prisma services; GREEN — plans/salary/project-payroll handlers сохраняют permission/schema/year/project scope checks и проксируют в authenticated Stage10 bridge. Упоминаний `FinancePlanService`/`ProjectPayrollService` вне самих TS service modules больше нет.
- SSR/caller review: finance pages сохраняют permission gate и используют клиентские BFF URLs; project page permission-gates SSR workspace, а payroll section загружает данные через `/api/projects/{id}/payroll`. `/finance/payroll` SSR только проверяет `payroll.read` и передаёт permission flags; клиент загружает таблицу через `/api/payroll`. Отдельный SSR payroll query отсутствует.
- Finance RED→GREEN targeted checks: `tests/contracts/finance/test_http_envelopes.py` сначала падал на envelope mismatch, затем прошёл; PG18 integration + schema/route/UoW checks: **14 passed**; Vitest BFF routes: **3 files, 5 passed**; `npm run typecheck` passed; changed-route ESLint passed; scoped mypy **7 source files** passed; Ruff check/format passed после форматирования contract test.
- Отдельный предыдущий timekeeping commit `44684c4` исправил review findings RETURN→edit→resubmit→approve и audit `correctionReason`; его evidence в разделе Review follow-up выше. Проверки этих fixes были targeted, не полный Stage10 suite.
- Дополнительный money contract RED→GREEN: обновлённая PG18 salary-table assertion сначала поймала `details[].amount` как JSON number, тогда как legacy TS serializer возвращает `toFixed(2)` string; service serializer исправлен. Один affected PG18 test после фикса → **1 passed**.

### Payroll month, adjustments и period slice

- RED→GREEN: `tests/contracts/finance/test_payroll_schemas.py` сначала не импортировался из-за отсутствовавших payroll schemas; camelCase query/adjustment inputs, CUID/period validation, positive amount и trimmed description проходят. `PayrollPeriodInput` экспортируется из payroll schema module без изменения payload contract.
- RED→GREEN: `tests/contracts/finance/test_payroll_http.py` выявил отсутствующие payroll route dependencies/handlers; GET month, POST adjustment, DELETE adjustment и PUT period сохраняют legacy `{data: ...}` envelope и POST 201 (**8 schema/HTTP tests passed**).
- RED→GREEN: PG18 payroll golden проверяет fallback `SalaryEntry → OKLAD → schedule salary × employmentRate`, payroll formulas, cent rounding, числовые JSON поля, options, department totals, project forecast, dismissed employees и department access filtering. Отдельный RED выявил пропущенные `closedById`, `createdAt`, `updatedAt` в существующем period response; добавленные поля проходят legacy-shape assertion. Adjustment create/delete использует общий `payroll_periods.assert_open()` до записи и audit в той же транзакции (**3 PG18 service tests passed**).
- RED→GREEN: новый unauthenticated unit test обнаружил `AttributeError` до UoW; service теперь возвращает `UNAUTHENTICATED` (**1 passed**).
- Реальные lock acceptance на PostgreSQL 18.6: `PayrollPeriodService.set_status(CLOSED)` удерживает row lock, а настоящий `TimekeepingService.update()` ждёт и затем получает `PERIOD_CLOSED`, без изменения записи/audit. Во втором тесте submitted sheet блокирует close; реальный approve коммитит state/audit, затем реальный close проходит и post-close decision получает `PERIOD_CLOSED`. Оба теста используют отдельные DB sessions (**2 PG18 tests passed**). Первый RED был вызван оставшейся точной `s10-` fixture предыдущего падения без sheet для нового random period; удалена только эта fixture.
- BFF RED→GREEN: tests сначала вызвали прежние Prisma handlers; после переключения `/api/payroll` GET/POST, `/api/payroll/adjustments/{id}` DELETE и `/api/payroll/period` PUT сохраняют auth/Zod prechecks и проксируют через authenticated Stage10 bridge (**3 Vitest files, 4 passed**). Export и payslip остаются TypeScript-owned.

## Проверки

- PostgreSQL 18.6, пустая отдельная `erp_stage10_test`: mapped schema создана через `Base.metadata.create_all`; исходные данные и migration baseline не копировались.
- `tests/integration/finance/test_period_lock.py` на двух независимых PostgreSQL sessions: **3 passed**. Проверены close-vs-edit и close-vs-approve ожидания row lock, запрет записи после закрытия, close/reopen и требование причины. Повторено после замены временного сервера на PostgreSQL 18.6.
- Targeted unit/contracts: **23 passed**.
- Targeted mypy: **Success, 16 source files**.
- Targeted Ruff check: **All checks passed**.
- Stage10 timekeeping+finance period integration: `uv run pytest tests/integration/timekeeping tests/integration/finance -q` → **12 passed** на PostgreSQL 18.6.
- Brief-команда backend: `uv run pytest tests/unit/timekeeping tests/unit/finance tests/integration/timekeeping tests/integration/finance tests/contracts/finance -q` → **30 passed** на PostgreSQL 18.6.
- Expanded scoped checks (unit/contracts, approvals UoW and Stage10 route/UoW/DB guard tests) → **46 passed** в сумме по последнему focused run; отдельный rerun brief-команды после fixture fix → 30 passed.
- Targeted BFF Vitest: `npx vitest run 'src/app/api/time-entries/route.test.ts' 'src/app/api/time-entries/[id]/route.test.ts' 'src/app/api/timekeeping/timesheets/route.test.ts' 'src/app/api/timekeeping/timesheets/[id]/decision/route.test.ts' --reporter=dot` → **4 files, 6 passed**.
- Targeted frontend `npm run typecheck` → passed; targeted ESLint по четырём BFF routes, helper и route tests → passed without warnings.
- Finance BFF Vitest: `npx vitest run 'src/app/api/finance/plans/route.test.ts' 'src/app/api/finance/salary/route.test.ts' 'src/app/api/projects/[id]/payroll/route.test.ts' --reporter=dot` → **3 files, 5 passed**.
- Финальный finance-focused backend run на отдельной PostgreSQL 18.6 `erp_stage10_test`: `uv run pytest tests/integration/finance/test_plan_project_payroll.py tests/contracts/finance/test_http_envelopes.py tests/contracts/finance/test_schemas.py tests/unit/test_stage10_uow_registration.py tests/unit/test_stage10_routes.py -q` → **14 passed**.
- `npm run typecheck` → passed; ESLint по трём изменённым BFF routes и их tests → passed.
- Changed backend finance scope: `ruff check` → passed; `ruff format --check` → 13 files formatted; `mypy` → **Success: no issues found in 7 source files**.
- Scoped backend mypy → `Success: no issues found in 23 source files`; scoped Ruff check → `All checks passed`.
- Итоговый scoped backend run на PostgreSQL 18.6 `erp_stage10_test`: `uv run pytest tests/unit/test_payroll_service.py tests/contracts/finance/test_payroll_schemas.py tests/contracts/finance/test_payroll_http.py tests/integration/finance/test_payroll_service.py tests/integration/finance/test_payroll_locks.py tests/integration/finance/test_plan_project_payroll.py -q` → **16 passed**.
- Payroll BFF: `./node_modules/.bin/vitest run src/app/api/payroll/route.test.ts src/app/api/payroll/period/route.test.ts 'src/app/api/payroll/adjustments/[id]/route.test.ts'` → **3 files, 4 passed**. Один `pnpm vitest` вызов был недоступен offline и временно переместил пакеты в `node_modules/.ignored`; локальные пакеты восстановлены из recovery directory. Direct local Vitest после восстановления прошёл; зависимости не устанавливались.
- Frontend: `npm run typecheck` и ESLint для шести изменённых payroll BFF route/test files → passed.
- Payroll changed backend scope: `ruff check` → **All checks passed**; `ruff format --check` → **11 files formatted**; targeted mypy → **Success: no issues found in 6 source files**.
- `/timekeeping` SSR source review: server page only calls `requirePagePermission('timekeeping.read')` and renders the client component; отдельного SSR data loader не существовало. Client loads the month through the stable `/api/time-entries` URL, now owned by the BFF bridge.
- Playwright stage-wide workflow отложен до финансового slice, как оговорено в `stage10-timekeeping-brief.md`.

## Фактические writer observations

- Текущие Python writers периода: time-entry create/update/delete; timesheet submit/decision; finance plan/project payroll; payroll adjustment create/delete; payroll period close/reopen. Они используют общий Stage10 row-lock protocol.
- Payroll month/adjustment/period handlers теперь проксируются в Python. Payroll export/payslip handlers пока используют legacy TypeScript `PayrollService.getMonth()` до следующего slice.
- HR `StaffSchedule.salary` меняет базу для будущего payroll расчёта, однако текущий TS HR handler не берёт payroll period lock. В Stage 05 HR mutations периода напрямую не записывают; фиктивный lock в несвязанные endpoints не добавлялся. Требуется отдельная проверка временной семантики salary edits перед ownership switch.

## Caveats / оставшаяся работа

- Оставшиеся Stage10 slices: payroll export and payslip renderers and their BFF/SSR ownership, plus stage-wide close/edit/approve browser E2E. Payroll month/adjustment/period routes, finance plans/salary and project payroll are switched, but Stage10 checklist remains unchecked until all acceptance points are verified.
- Временный PostgreSQL 18.6 использует пустую изолированную `erp_stage10_test`; mapped schema создана через `Base.metadata.create_all`, source dump/migration baseline не загружались. При cleanup удалялись только тестовые fixture rows с `s10-` идентификаторами.
- Close-vs-edit для timekeeping и close-vs-approve в period integration проверялись на независимых PostgreSQL sessions; полная browser цепочка табель → финансы → close → reopen остаётся отложенной до finance slice.
- Временный PostgreSQL test container создан координатором; он остаётся под его управлением и здесь не останавливался.
- `/timekeeping` не имел серверной загрузки таблицы; серверная permission gate сохранена, данные идут через переключённый BFF.
- `next-env.d.ts` был изменён до начала этого среза пользователем; файл не редактировался и не должен попадать в индекс.

## Review follow-up — timekeeping lifecycle

- RED: PG18 regression `test_submit_creates_timesheet_approval_and_audit_in_same_uow` воспроизвёл RETURN → повторную отправку → approve: решение падало на `INVALID_APPROVAL_STATE`, потому что entity lookup возвращал старый rejected request.
- GREEN: repository добавил `get_pending_for_entity`, фильтрующий только `PENDING` и использующий `scalar_one_or_none`; неоднозначное состояние с несколькими pending requests завершается ошибкой вместо произвольного выбора. PG18 regression проверяет полный путь RETURN → создание time entry → повторная отправка → `REJECTED`, `PENDING` → approve новой заявки.
- RED: `test_corrected_entry_update_and_delete_reset_approved_timesheet` показал отсутствие `correctionReason` в audit details для update/delete.
- GREEN: correction audit включает переданную причину; обе записи проверяются на PG18.
- Scoped verification: оба targeted PG18 tests → **2 passed**; `ruff check` → passed; `ruff format --check` → 4 files formatted; scoped mypy → `Success: no issues found in 3 source files`.
- Эти follow-up fixes отдельны от следующего finance slice и не меняют финансовые writers.

## Изменённые пути

Backend domain/calculations: `app/domain/timekeeping/`, `app/domain/finance/`, `app/domain/ports/payroll_periods.py`, `app/domain/ports/finance.py`.

Backend transaction/repository/API: `app/db/uow.py`, `app/domain/ports/{approvals,payroll_periods,timekeeping,finance,uow}.py`, `app/repositories/{approvals,payroll_periods,timekeeping,finance}.py`, `app/services/{approvals,finance_periods,timekeeping,payroll}.py`, `app/schemas/{finance,timekeeping,payroll}.py`, `app/api/{dependencies.py,router.py,routes/payroll.py,routes/timekeeping.py}`.

Tests: `tests/conftest.py`, `tests/unit/{approvals,finance,timekeeping}/`, `tests/unit/test_stage10_*.py`, `tests/integration/{finance,timekeeping}/`, `tests/contracts/{finance,timekeeping}/`.

Frontend BFF/tests: `src/lib/backend/stage10.ts`, `src/app/api/time-entries/`, `src/app/api/timekeeping/timesheets/`, `src/app/api/finance/{plans,salary}/`, `src/app/api/projects/[id]/payroll/`, `src/app/api/payroll/{route,period,adjustments}/`.

Ownership evidence: `docs/backend-migration/stage10-ownership.md`, `docs/backend-migration/frontend-callers.md`, and timekeeping rows in `docs/superpowers/plans/2026-09-28-fastapi/07-coverage.md`. Stage 10 plan checkboxes remain unchecked because this is one workflow slice, not full Stage 10 acceptance.
