# Волна 3: согласования, финансы, закупки и отчётность

> Для агента: выбранный этап завершается проверкой и учебной остановкой. Использовать `superpowers:executing-plans`; следующий этап, ветки/коммиты/subagents автоматически не запускать.

**Цель:** перенести связанные бизнес-сценарии без потери транзакций и прав.

**Архитектура:** [слоистый backend](../../specs/2026-09-28-fastapi-backend-design.md); services используют UoW и предметные ports. HTTP schemas не являются domain models.

**Стек:** текущая Python основа, библиотеки для существующих экспортов; Redis/Celery не нужны.

## Ограничения и проверка

Все mappings уже есть, но mapping не равен готовому сценарию. Межсервисная операция принимает общий UoW; нельзя вызвать соседний HTTP endpoint и назвать это одной транзакцией. Аудит и outbox сохраняются вместе с изменениями.

Пять обязательных failure classes: двойное решение согласования; запись в закрываемый период; повторная капитализация; aggregates за пределами первой страницы; утечка scopes через поиск/экспорт. Тесты ниже закрепляют каждый случай на реальной PostgreSQL там, где нужна конкуренция.

## Этап 09. Согласования и notification APIs

**Источники:** `src/features/approvals/application/approval.service.ts`, `src/features/notifications/application/{notification,smtp}.service.ts`, notification contracts, approvals routes/templates/options; `/api/notifications*` и admin SMTP UI.

**Создать:** `app/domain/approvals/rules.py`, `app/domain/ports/approvals.py`, `app/services/{approvals,notifications,smtp_settings}.py`, `app/services/dto/{approvals,notifications}.py`, `app/repositories/approvals.py`, `app/schemas/{approvals,notifications}.py`, `app/api/routes/{approvals,notifications,smtp_settings}.py`, `app/integrations/smtp.py`; `tests/{unit,integration,contracts}/{approvals,notifications}/`.

**Интерфейсы:** `create_approval_in_uow(command, context, uow)`; `ApprovalService.decide(id, command, context)`; notification producer из 03; delivery processor ещё TS до 13.

- [x] Templates/create/list/detail/options/cancel: current statuses, approver order, deadline и visibility. Согласование неизвестной entity не создаёт dangling link.
- [x] Decision transition/version/locking: два одновременных решения не завершают один шаг дважды; неактивный/чужой approver получает прежний error contract.
- [x] Audit и notification intent записываются атомарно; сбой enqueue откатывает decision. Нельзя отправить SMTP прямо в DB transaction.
- [x] In-app list/count/read/read-all/preferences; duplicate event/dedupe поведение по текущему source contract. Чтение чужой notification запрещено.
- [x] SMTP settings/test port: secret не возвращается клиенту; test email outside transaction; совместимость существующих settings/encryption проверена. Не создавать новую incompatible схему секрета в mixed phase.
- [x] Переключить API/SSR этих групп. Manual `/smtp/process` и `/generate-alerts` остаются контролируемыми TS processors до 13; backend ownership registry фиксирует исключение.

**Проверки:** `uv run pytest tests/unit/approvals tests/integration/approvals tests/contracts/approvals tests/integration/notifications -q`; Playwright двухшаговое approve/reject/cancel, правильное уведомление, гонка на PostgreSQL.

**Готово:** UI и producer Python, только delivery/manual processing явно TS. **Пауза:** state machine, optimistic conflict, outbox vs фактическая доставка.

## Этап 10. Табель и финансовые расчёты

**Источники:** `src/features/timekeeping/`, `src/features/finance/`, `src/lib/payroll-period-transaction.ts`, payroll period lock и integration tests. Routes time-entries/timekeeping/payroll/finance/project-payroll.

**Создать:** `app/domain/timekeeping/{rules,labor_calculator}.py`, `app/domain/finance/{finance_calculator,payroll_calculator,period_rules}.py`, `app/domain/ports/{timekeeping,finance}.py`, `app/services/{timekeeping,timesheets,payroll,project_payroll,finance_plans}.py`, `app/services/dto/{timekeeping,finance}.py`, `app/repositories/{timekeeping,finance,payroll_periods}.py`, `app/schemas/{timekeeping,finance}.py`, `app/api/routes/{timekeeping,payroll,finance}.py`; `tests/{unit,integration,contracts}/{timekeeping,finance}/`.

**Потребляет:** employees/workforce/project references, approvals port, period helper из 05. **Производит:** финансовые сервисы и все period writes в Python.

- [x] Golden numeric fixtures на Decimal: ставки, часы, отпуск/больничный, adjustments, project payroll, rounding и границы месяца. Ожидаемые суммы получены из действующих правил и проверены вручную.
- [x] Time entry CRUD и timesheet submit/decide: одна atomic workflow с approval/locking, scoped employees, даты/пересечения/повторное решение.
- [x] SalaryEntry/FinancePlanEntry/PayrollAdjustment CRUD и пересчёт: precision/date/response aliases; Python Decimal serialization настроить явно, чтобы frontend не получил неожиданные строки вместо чисел.
- [ ] Close/open payroll period: upsert + `SELECT FOR UPDATE` по `(year,month)`, все связанные writers используют один протокол, включая кадровые операции из 05. *(Периодные writers используют общий lock; HR master-data writers не блокируются: у них нет effective date, и legacy расчёты используют текущие данные для исторических периодов. Смотрите `stage10-report.md`.)*
- [x] Два concurrent сценария close period vs edit/approve выполняются в отдельных sessions; ни один writer не проходит после закрытия. Ошибка approval не оставляет locked/partially changed timesheet.
- [x] Если текущие API Number-преобразования ограничивают точность, сохранить совместимость на границе и описать отдельную будущую версию контракта; внутренние вычисления всё равно Decimal.
- [x] Payroll exports/payslip: синхронные Python renderers, контролируемые fonts и permissions; heavy rendering outside event loop/DB lock.
- [x] Переключить весь кластер routes и SSR. Общую close/edit workflow нельзя разделить между TS/Python без одинакового tested lock protocol.

**Проверки:** `uv run pytest tests/unit/timekeeping tests/unit/finance tests/integration/timekeeping tests/integration/finance tests/contracts/finance -q`; golden totals и real concurrency; Playwright табель → согласование → расчёт → закрытие → edit denied → reopen.

**Готово:** финансовые итоги совпадают на fixtures и правила закрытия работают. **Пауза:** Decimal/rounding, transaction boundaries и row locks; пользователь меняет правило расчёта на учебной ветке только при явном запросе создать её.

## Этап 11. Полный цикл закупки

**Источники:** `src/features/procurement/`, procurement routes, approvals/documents/assets service composition; текущие supplier/INN правила.

**Создать:** `app/domain/procurement/{rules,inn}.py`, `app/domain/ports/procurement.py`, `app/services/procurement.py`, `app/services/dto/procurement.py`, `app/repositories/procurement.py`, `app/schemas/procurement.py`, `app/api/routes/procurement.py`; `tests/{unit,integration,contracts}/procurement/`.

**Потребляет:** `create_approval_in_uow` из 09, `create_asset_in_uow` из 07, Document metadata port из 08. **Производит:** заявку/контракт/поставку/капитализацию целиком в Python.

- [ ] Supplier/INN, request/items/options: сохранить pagination+summary, numbered uniqueness, quantities/prices и access targets.
- [ ] Submit создаёт approval и меняет request одним UoW; повтор submit не создаёт второе согласование.
- [ ] Contract/deliveries: документ доступен и подходящего состояния, dates/budget/received quantities проверены, partial deliveries не завышают итог.
- [ ] Capitalize: concurrent запросы одной delivery item дают ровно один asset и корректный link; unique constraint/row lock и общий UoW. Повтор возвращает текущую контрактную ошибку или результат, не создаёт новое имущество.
- [ ] Ошибка в asset/audit/approval операции откатывает изменения всех участвующих таблиц. Передача committed id из отдельной транзакции не считается атомарной.
- [ ] Переключить все procurement routes вместе; UI заявка → согласование → контракт → две частичные поставки → постановка на учёт. Сверить sums/assets/relations в БД.

**Проверки:** `uv run pytest tests/unit/procurement tests/integration/procurement tests/contracts/procurement -q`; один asset при concurrent capitalize, rollback составного сценария, totals по всем items.

**Готово:** закупка связана с готовыми Python-модулями. **Пауза:** orchestration нескольких сервисов, idempotency и почему общий UoW важнее количества классов.

## Этап 12. Отчёты, dashboard, поиск и экспорт

**Источники:** `src/features/{reporting,search,exports}/`, report/dashboard/my-actions services, `/api/reports*`, `/api/search`, `/api/export`, root dashboard, exports UI и scripts/verify-data.ts.

**Создать:** `app/domain/reporting/aggregators.py`, `app/domain/ports/reporting.py`, `app/services/{reporting,dashboard,my_actions,search,exports}.py`, `app/services/dto/reporting.py`, `app/repositories/{reporting,search}.py`, `app/schemas/{reporting,search}.py`, `app/api/routes/{reports,search,exports}.py`, `app/integrations/exports.py`, `app/scripts/{seed,verify_data,create_admin}.py`; `tests/{unit,integration,contracts}/{reporting,search,exports}/`.

**Потребляет:** все перенесённые модули и auth scopes. **Производит:** последние пользовательские read APIs, export renderers, Python CLI; инфраструктурные processors перенесутся в 13.

- [ ] Все report kinds, preset ownership, KPI/dashboard/my-actions: SQL агрегаты считаются по полному доступному scope, не по загруженной странице. Fixture >100 записей проверяет totals/pagination.
- [ ] Search: проверять права в запросах и result shaping по каждой entity; user без доступа не видит title/snippet/ID чужого объекта.
- [ ] XLSX/DOCX/PDF/QR: сверить поля/таблицы/суммы, открыть generated files, проверить русские шрифты и filenames. Валидный файл не обязан быть побайтно равен старому renderer.
- [ ] Report exports применяют те же scopes, что list; нельзя получить запрещённые поля через другой format. Binary endpoints сохраняют HTTP status/headers.
- [ ] Перенести seed/verify/create-admin CLI через services. Seed идемпотентен, имеет guard от рабочей БД; relational totals проверяются, создание admin не логирует пароль. Demo seed обязателен для учебной копии, production auto-seed запрещён.
- [ ] Убрать оставшиеся SSR imports services/Prisma; nested relation DTO не lazy-load-ится после session close.
- [ ] Измерить baseline: latency и число SQL на dashboard/report, dataset/filters/iterations фиксируются. Кэш пока отсутствует; это исходная точка для будущего самостоятельного Redis.

**Проверки:** `uv run pytest tests/unit/reporting tests/integration/reporting tests/contracts/reporting tests/integration/search tests/integration/exports -q`; Python verify_data, frontend lint/typecheck, Playwright dashboard/report/search/export; API coverage registry показывает все пользовательские методы в Python.

**Готово:** все пользовательские backend-функции Python, кроме явно временной сессии/processor bridge. **Пауза:** aggregates, N+1, query plan и scope leakage; самостоятельно улучшить один запрос и показать измерение.
