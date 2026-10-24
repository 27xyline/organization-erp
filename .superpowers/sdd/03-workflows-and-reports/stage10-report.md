# Stage 10 — текущий validation report

## Статус

Stage 10 implementation и stage-wide browser workflow выполнены с одной зафиксированной оговоркой по HR master data. Close/edit/approve Playwright smoke прошёл на отдельной `erp_stage10_e2e`; финальный backend brief прошёл на PostgreSQL 18 `erp_stage10_test`. Общий advisory gate подключён к PayrollPeriod row-lock path, текущим payroll calculation reads и HR master-data writers. Новые независимые PG-session tests для этого follow-up пока не прошли: настроенный endpoint недоступен в текущем окружении. Checkbox плана о lock связанных HR writers остаётся unchecked до PG verification; Stage 10 имеет статус **DONE_WITH_CONCERNS**.

## Готовые изменения

- Добавлены Decimal labor/payroll/finance calculators и finance-plan allocation rules. Реализованы округление `ROUND_HALF_UP`, нормативные часы, бюджетные deltas, план-факт и прибыльность.
- Добавлены Pydantic schemas для time entry/timesheet payloads и payroll period.
- Добавлены `PayrollPeriodRepository` port и SQLAlchemy adapter: upsert уникального `(year, month)`, `SELECT FOR UPDATE`, проверка pending timesheets, close/reopen и обязательная причина reopen.
- `PayrollPeriodService` использует caller-owned UoW, пишет audit в той же транзакции и не добавляет audit при идемпотентном повторе. Зарегистрирован `PUT /api/payroll/period`.
- Test bootstrap распознаёт `STAGE10_TEST_DATABASE_URL` с жёстким ожидаемым именем `erp_stage10_test`; finance integration fixture отказывается подключаться к другим БД.
- Payroll month export и payslip workbook строятся через `openpyxl`; API возвращает XLSX bytes с legacy filenames, `Content-Disposition`, media type и `Cache-Control: no-store`.
- Payroll payload загружается через `get_month`; после закрытия UoW синхронный renderer запускается через `asyncio.to_thread`. Export routes проверяют `payroll.export`, payslip ищет сотрудника только среди доступных в scope строк.
- Stage10 BFF export/payslip routes сохраняют legacy URL/query validation и проксируют исходные binary headers/body через authenticated bridge без TS renderer fallback.
- Playwright config допускает только явный `erp_stage10_e2e` для Stage 10 и использует отдельный `.runtime/stage10/e2e` document storage root. Конфигурационные isolation tests проходят; stage-wide workflow проверен на этой отдельной БД.

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
- BFF RED→GREEN: тесты сначала вызвали прежние Prisma handlers; после переключения `/api/payroll` GET/POST, `/api/payroll/adjustments/{id}` DELETE и `/api/payroll/period` PUT сохраняют auth/Zod prechecks и проксируют через authenticated Stage10 bridge (**3 Vitest files, 4 passed**; это evidence промежуточного среза до export slice).
- Payroll export renderer RED→GREEN: новые workbook contract tests сначала упали из-за отсутствующего `payroll_export` renderer; GREEN проверяет XLSX bytes, worksheet titles, creator, legacy Russian headers/rows, 12 колонок, currency format, freeze/filter и controlled Arial font.
- Payroll export HTTP/service RED→GREEN: route tests сначала получили 404 для export paths, а export permission unit test показал отсутствующий service method; GREEN проверяет XLSX media type, filenames, disposition, no-store, payslip not-found/404, запрет без `payroll.export` и то, что `asyncio.to_thread` вызывается после выхода из фактического UoW.
- Payroll export BFF RED→GREEN: начальные route tests дошли до старого `PayrollService.getMonth()` и упали до прокси из-за отсутствующего access context; после ownership switch tests проверяют `payroll.export`, исходные query/path и binary bytes/headers для обоих endpoints (**2 files, 4 passed**).
- Stage10 E2E config RED→GREEN: новый storage isolation test сначала не находил resolver; после реализации Stage10 path guard и `STAGE10_E2E_DATABASE_URL` allowlist принимают только `erp_stage10_e2e`; вместе с Stage08 isolation tests **2 files, 7 passed**.
- Stage-wide Playwright: первый диагностический test ошибочно ждал `Response.finished()` от браузерного success response, хотя UI success path использует только status и затем загружает payroll заново. Direct FastAPI ответ, proxy stream и отдельные Playwright APIRequestContext/in-page fetch вернули полные JSON bytes. Диагностика не выявила BFF дефекта; instrumentation удалена. E2E проверяет success status, отдельный полный BFF JSON, закрытый badge, отказ edit после close, reopen и фактические browser downloads обоих XLSX с legacy filenames и ZIP signature. Для повторных запусков выбирается неиспользованный месяц для E2E-сотрудника из допустимого диапазона годов по существующим timesheet/time-entry. Targeted workflow прошёл: **1 passed**.
- Payslip BFF year validation использует общую `payrollQuerySchema` (2000–2100), согласованную с backend query schema; регрессия для `year=2101` проходит.
- XLSX controlled font refactor: тест утверждает Arial на workbook cells; приватный `Workbook._fonts` registry заменён явным font assignment, сохраняющим title/header bold и размеры.

## Проверки

- PostgreSQL 18.6 из официального `postgres:18.6-alpine` (image digest `sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5`), пустая отдельная `erp_stage10_test`: mapped schema создана через `Base.metadata.create_all`; исходные данные и migration baseline не копировались. Запущенный контейнер уже использовал этот digest; образ подтянут без перезапуска.
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
- Export backend focused tests: `./.venv/bin/pytest tests/unit/test_payroll_service.py tests/unit/test_payroll_export_service.py tests/contracts/finance/test_payroll_schemas.py tests/contracts/finance/test_payroll_http.py tests/contracts/finance/test_payroll_exports.py -q` → **15 passed**.
- Export scope formatting/types: scoped Ruff check → **All checks passed**; Ruff format check → **6 files already formatted**; mypy payroll renderer/service/schema/routes → **Success: no issues found in 4 source files**.
- Stage10 BFF owner check: Vitest for all timekeeping, finance, project payroll and payroll route tests plus Stage08/10 storage isolation → **14 files, 26 passed**.
- Frontend `npm run typecheck` → passed; ESLint on export/payslip routes/tests, Stage10 storage resolver, and Playwright config → passed.
- Final backend brief command from `backend/`: `./.venv/bin/pytest tests/unit/timekeeping tests/unit/finance tests/integration/timekeeping tests/integration/finance tests/contracts/finance -q` with `.runtime/stage10/test.env` → **52 passed** on isolated PostgreSQL 18 `erp_stage10_test`. First invocation without network escalation was denied opening `127.0.0.1:55432`; the scoped retry with the approved test DB endpoint passed. No credentials were printed.
- Stage10 owner route tests before review refinements: **13 files, 22 passed**. After the payslip year-range regression was added, the affected route file was rerun: **3 passed**.
- Final Stage-wide Playwright workflow used only coordinator-provided `erp_stage10_e2e` and separate storage root; result **1 passed**, including payroll and payslip browser downloads. No Docker lifecycle command was run.
- Final frontend quality checks: `npm run typecheck` → passed; ESLint on changed payroll period/export/payslip routes and tests, Stage10 storage resolver, E2E spec, and Playwright config → passed.
- Final changed backend scope: Ruff check → **All checks passed**; `ruff format --check` → **9 files already formatted** after formatting the export contract test; targeted mypy → **Success: no issues found in 5 source files**.
- `/timekeeping` SSR source review: server page only calls `requirePagePermission('timekeeping.read')` and renders the client component; отдельного SSR data loader не существовало. Client loads the month through the stable `/api/time-entries` URL, now owned by the BFF bridge.
- HR master-data caveat: `Employee` schedule/rate/status have no effective date; legacy TS and Python month reads use their current values for any historical period. HIRE/TRANSFER/PROMOTE/DISMISS/EXTEND and workforce schedule/salary changes can therefore alter historical closed-month calculations. No fake current-period lock was added to unrelated HR routes. Snapshot/effective-date semantics require a separate product decision.

## Фактические writer observations

- Текущие Python writers периода: time-entry create/update/delete; timesheet submit/decision; finance plan/project payroll; payroll adjustment create/delete; payroll period close/reopen. Они используют общий Stage10 row-lock protocol.
- Payroll month/adjustment/period/export/payslip handlers теперь проксируются в Python. В Stage10-owned API cluster direct TS Prisma fallbacks не обнаружены; finance/timekeeping/project SSR остаются на своих permission-gated pages и загружают данные через переключённые BFF URLs.
- HR master-data salary/rate changes have no effective date. Независимая сверка подтвердила, что legacy TS и Python payroll расчёт используют текущие Employee schedule/rate/status для любого выбранного года/месяца; такое изменение ретроактивно влияет на исторический закрытый payroll. Срез сохраняет это legacy поведение; period lock применяется только к period-indexed writers и не обещает immutable payroll snapshots. Отдельная temporal/snapshot модель остаётся вне этого slice.

## Caveats / оставшаяся работа

- Stage-wide close/edit/approve Playwright smoke on `erp_stage10_e2e` passed. The HR and payroll lock wiring is implemented, but plan checkbox 47 remains unchecked until the new independent PostgreSQL-session acceptance tests run successfully. Separately, legacy calculations still use current employee values for historical periods, so HR changes can alter later recalculations of closed history.
- Временный PostgreSQL 18.6 использует пустую изолированную `erp_stage10_test`; mapped schema создана через `Base.metadata.create_all`, source dump/migration baseline не загружались. При cleanup удалялись только тестовые fixture rows с `s10-` идентификаторами.
- Close-vs-edit and close-vs-approve were verified with independent PostgreSQL sessions. Browser workflow timesheet → approval → payroll calculation → close → edit denied → reopen passed against separate `erp_stage10_e2e`.
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

## Review follow-up — payroll input gate (PostgreSQL verification pending)

- Source wiring adds one transaction-scoped PostgreSQL advisory gate: Stage 10 payroll and salary calculation reads, employee project references, and `ProjectMemberService.add` snapshots take the shared lock; EmployeeService create/update/dismiss, PersonnelActionService create/delete/sync, and WorkforceService save/delete position take the exclusive lock after `lock_actor` and before HR row access. `PayrollPeriodRepository.lock_period` takes the shared lock before period upsert and `SELECT FOR UPDATE`.
- Historical payroll behavior is unchanged: calculations still use current Employee/StaffSchedule values for past months. No snapshots or effective dates were added; closed historical calculations can still change after HR master-data edits.
- Offline RED was observed for the missing `SqlAlchemyPayrollInputLockRepository`; focused unit tests pass after implementation: payroll input lock **3 passed**, project-member snapshot ordering **1 passed**, and payroll export service **2 passed**. They verify shared/exclusive transaction advisory SQL and gate-before-period-row/snapshot-lock ordering. Scoped Ruff, format, mypy and `git diff --check` passed.
- The independent PostgreSQL-session integration tests are present but remain unverified: the configured `erp_stage10_test` endpoint at `127.0.0.1:55432` refused connection. No Docker lifecycle command was run. The plan checkbox for HR writers remains unchecked until those PG tests pass.

## Изменённые пути

Backend domain/calculations: `app/domain/timekeeping/`, `app/domain/finance/`, `app/domain/ports/payroll_periods.py`, `app/domain/ports/finance.py`, `app/domain/ports/payroll_input_lock.py`.

Backend transaction/repository/API: `app/db/uow.py`, `app/domain/ports/{approvals,payroll_periods,timekeeping,finance,uow}.py`, `app/repositories/{approvals,payroll_periods,timekeeping,finance}.py`, `app/repositories/payroll_input_lock.py`, `app/services/{approvals,finance_periods,timekeeping,payroll,employees,personnel_actions,workforce,project_members}.py`, `app/schemas/{finance,timekeeping,payroll}.py`, `app/api/{dependencies.py,router.py,routes/payroll.py,routes/timekeeping.py}`, `app/integrations/payroll_export.py`.

Tests: `tests/conftest.py`, `tests/unit/{approvals,finance,timekeeping}/`, `tests/unit/test_stage10_*.py`, `tests/unit/test_payroll_export_service.py`, `tests/unit/test_payroll_input_lock.py`, `tests/unit/projects/test_project_members.py`, `tests/integration/{finance,timekeeping}/`, `tests/integration/finance/test_payroll_input_lock.py`, `tests/contracts/{finance,timekeeping}/`, `tests/contracts/finance/test_payroll_exports.py`.

Frontend BFF/tests/config: `src/lib/backend/stage10.ts`, `src/lib/stage10-e2e-storage.ts`, `src/lib/stage10-e2e-storage.test.ts`, `playwright.config.ts`, `src/app/api/time-entries/`, `src/app/api/timekeeping/timesheets/`, `src/app/api/finance/{plans,salary}/`, `src/app/api/projects/[id]/payroll/`, `src/app/api/payroll/{route,period,adjustments,export,export-payslip}/`.

Ownership evidence: `docs/backend-migration/stage10-ownership.md`, `docs/backend-migration/frontend-callers.md`, and Stage 10 rows in `docs/superpowers/plans/2026-09-28-fastapi/07-coverage.md`. Plan checks are updated only for confirmed acceptance; the HR writer lock bullet stays unchecked pending PostgreSQL acceptance. The legacy temporal-semantics caveat is separate from the concurrency lock requirement.
