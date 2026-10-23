# Stage 10 — текущий validation report

## Статус

Stage 10 остаётся **в работе**. В этом срезе завершён timekeeping workflow и его четыре Next BFF route; finance plans/salary, payroll CRUD/adjustments/exports и project payroll остаются TypeScript owners. Полный Stage 10 acceptance и финансовый E2E пока не достигнуты.

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
- Scoped backend mypy → `Success: no issues found in 23 source files`; scoped Ruff check → `All checks passed`.
- `/timekeeping` SSR source review: server page only calls `requirePagePermission('timekeeping.read')` and renders the client component; отдельного SSR data loader не существовало. Client loads the month through the stable `/api/time-entries` URL, now owned by the BFF bridge.
- Playwright stage-wide workflow отложен до финансового slice, как оговорено в `stage10-timekeeping-brief.md`.

## Фактические writer observations

- Текущие TS writers периода: time-entry create/update/delete; timesheet submit/decision; payroll adjustment create/update/delete; payroll period close/reopen. В них используется общий TS `lockPayrollPeriod`/`lockPayrollPeriods` protocol.
- Project payroll и finance-plan mutations уже вызывают `ensurePayrollPeriodOpen`, но должны быть перенесены вместе с соответствующими routes.
- HR `StaffSchedule.salary` меняет базу для будущего payroll расчёта, однако текущий TS HR handler не берёт payroll period lock. В Stage 05 HR mutations периода напрямую не записывают; фиктивный lock в несвязанные endpoints не добавлялся. Требуется отдельная проверка временной семантики salary edits перед ownership switch.

## Caveats / оставшаяся работа

- Оставшиеся Stage10 slices: SalaryEntry/FinancePlanEntry/PayrollAdjustment, payroll calculation, project payroll, exports/payslip renderer и их BFF/SSR ownership.
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

Backend domain/calculations: `app/domain/timekeeping/`, `app/domain/finance/`, `app/domain/ports/payroll_periods.py`.

Backend transaction/repository/API: `app/db/uow.py`, `app/domain/ports/{approvals,payroll_periods,timekeeping,uow}.py`, `app/repositories/{approvals,payroll_periods,timekeeping}.py`, `app/services/{approvals,finance_periods,timekeeping}.py`, `app/schemas/{finance,timekeeping}.py`, `app/api/{dependencies.py,router.py,routes/payroll.py,routes/timekeeping.py}`.

Tests: `tests/conftest.py`, `tests/unit/{approvals,finance,timekeeping}/`, `tests/unit/test_stage10_*.py`, `tests/integration/{finance,timekeeping}/`, `tests/contracts/{finance,timekeeping}/`.

Frontend BFF/tests: `src/lib/backend/stage10.ts`, `src/app/api/time-entries/`, `src/app/api/timekeeping/timesheets/`.

Ownership evidence: `docs/backend-migration/stage10-ownership.md`, `docs/backend-migration/frontend-callers.md`, and timekeeping rows in `docs/superpowers/plans/2026-09-28-fastapi/07-coverage.md`. Stage 10 plan checkboxes remain unchecked because this is one workflow slice, not full Stage 10 acceptance.
