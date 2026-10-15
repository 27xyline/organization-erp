# Волна 2: кадры, проекты, имущество и документы

> Для агента: только выбранный этап, затем учебная пауза. Использовать `superpowers:executing-plans`; не создавать ветки/коммиты/subagents автоматически.

**Цель:** переносить предметные модули по работающему образцу этапа 04.

**Архитектура:** общие слои из [spec](../../specs/2026-09-28-fastapi-backend-design.md). API schemas — Pydantic; service commands/results — dataclasses; repositories реализуют domain ports.

**Стек:** уже созданный Python backend; новые системы не добавляются.

## Общие правила волны

Для каждого подмодуля сначала уточнить команды/DTO и публичные service signatures по его зафиксированным HTTP-контрактам. Не переводить TypeScript построчно и не менять пользовательское поведение ради удобства ORM.

Каждая подзадача проходит цикл: failing regression/contract test → минимальная реализация → unit/real PostgreSQL tests → переключение конкретных routes и SSR callers → Playwright сценарий → запись ownership. Команды выполняются из `backend/`; для frontend — из корня.

ORM-модели уже mapped в 02. Ни один repository не commit-ит сам. Для составного сценария общий UoW, аудит/outbox — из 03. DDL остаётся Prisma. Отдельные test cases не заменяют полную route/method matrix.

## Приоритеты проверки

1. Данные кадров и денег видны только разрешённым ролям и scope.
2. Archive/deactivate сохраняют ссылки и исторические данные.
3. Concurrent изменение количества имущества не нарушает остатки.
4. Зависимости задач не образуют цикл и не выходят за проект.
5. Ошибка сохранения документа не оставляет фиктивную версию или доступный чужому пользователю файл.

## Этап 05. Кадровые процессы

**Источники:** `src/features/employees/{application,domain,infrastructure}/`, `src/features/departments/`, routes employees/personnel-actions/vacations/staff-schedule; текущие tests и страницы.

**Создать:** `app/domain/employees/{rules,employment}.py`, `app/domain/ports/employees.py`, `app/services/{employees,workforce,personnel_actions}.py`, `app/services/dto/employees.py`, `app/repositories/{employees,workforce}.py`, `app/schemas/employees.py`, `app/api/routes/{employees,personnel_actions,vacations,staff_schedule}.py`; тесты `tests/{unit,integration,contracts}/employees/`.

**Потребляет:** auth/department ports, mapped Employee/Skill/Certificate/PersonnelAction/Vacation/StaffSchedule. **Производит:** Python кадровые use cases и совместимый employee reference API для проектов.

- [x] Профиль, list/filter/pagination, skills/certificates: сохранить legacy visibility полей по прежним правам и scope, а также null/date и relation shape. Не вводить новое сокрытие зарплатных полей; eager load без N+1.
- [x] Workforce/contracts: повторить правила ставок и типов занятости из `hr-domain.ts`; duplicate/invalid rate/неактивная позиция проверяются тестами.
- [x] Приём/перевод/увольнение: бизнес-изменения и аудит атомарны. Сохранить фактический legacy behavior без нового notification intent. Повторный кадровый sync не создаёт дублей и ограничен actor scope; не затрагивает чужие подразделения.
- [x] Отпуска/больничные: границы дат, пересечения и access rules сохраняются; false assumptions о датах не заменяют текущий контракт.
- [x] Staff schedule и salary-related read contracts: сохранить permissions и фактическую visibility. Payroll-period lock здесь не применяется: в переносимых кадровых маршрутах нет записи payroll-периода; финансовые расчёты и payroll остаются в этапе 10.
- [x] Переключить API и все кадровые SSR-callers; department head/MOL references продолжают работать. Не переключать финансовый расчёт раньше 10.

**Проверки:** `uv run pytest tests/unit/employees tests/integration/employees tests/contracts/employees -q`; frontend typecheck; UI сотрудник → контракт → перевод → отпуск → увольнение; HR против EMPLOYEE и чужого department.

**Готово:** кадровые workflows на Python, история и права сохранены. Реализация ожидает пользовательского разбора. **Пауза:** разбор увольнения с транзакцией; самостоятельное правило срока сертификата с тестом (правило истечения сертификата в этом этапе не реализовывать).

## Этап 06. Проекты и задачи

**Источники:** `src/features/projects/application/`, `domain/{task-rules,critical-path}.ts`, project/task routes; project workspace и Gantt/Kanban UI.

**Создать:** `app/domain/projects/{task_rules,critical_path}.py`, `app/domain/ports/projects.py`, `app/services/{projects,project_members,tasks,project_workspace}.py`, `app/services/dto/projects.py`, `app/repositories/projects.py`, `app/schemas/projects.py`, `app/api/routes/{projects,tasks}.py`; `tests/{unit,integration,contracts}/projects/`.

**Потребляет:** Employee references, project scopes, notification intent, audit. **Производит:** Project/Member/Task/Dependency/Checklist/Comment/Assignee workflows. `/projects/{id}/payroll` остаётся на TS до 10.

- [ ] Проект и участники: budgets/status/archive, ставки, membership, допустимость назначения и scope фильтрация.
- [ ] Задачи: hierarchy depth, parent relationships, dates/status/assignees, checklist/comments. Перенести правила из domain, не прятать их в Pydantic validators/repository.
- [ ] Dependencies/critical path: numeric fixtures, цикл, cross-project edge, удаление parent с зависимыми элементами. Algorithm tests на чистом Python.
- [ ] Составные updates записывают audit/outbox через тот же UoW; rollback при invalid dependency не меняет задачу частично.
- [ ] Workspace aggregates заменяются Python API; пока документы ещё TS, composition страницы делает отдельные read calls. Мутация не распределяется между двумя backend.
- [ ] Переключить project/task API и SSR; сохранить PUT `{status}` для Kanban, optimistic rollback и Gantt DTO.

**Проверки:** `uv run pytest tests/unit/projects tests/integration/projects tests/contracts/projects -q`; существующий Playwright дополняется реальным drag → refresh → status persisted; error → optimistic rollback; scoped member denied.

**Готово:** проектный UI питается Python, кроме явно оставленного payroll. **Пауза:** граф зависимостей и правила задачи; самостоятельно добавить проверку deadline с тестом.

## Этап 07. Имущество и учёт остатков

**Источники:** `src/features/assets/application/{asset,asset-lifecycle,inventory,asset-import,saved-view}.service.ts`, domain и serializable-transaction helper; routes assets/operations/export и UI.

**Создать:** `app/domain/assets/{lifecycle,inventory,maintenance}.py`, `app/domain/ports/assets.py`, `app/services/{assets,asset_lifecycle,inventory,asset_import,saved_views}.py`, `app/services/dto/assets.py`, `app/repositories/assets.py`, `app/schemas/assets.py`, `app/api/routes/{assets,inventory,operations}.py`, `app/integrations/asset_import.py`; тесты `tests/{unit,integration,contracts}/assets/`.

**Потребляет:** catalogs/MOL/project references, UoW, audit. **Производит:** все asset commands и внутренняя `create_asset_in_uow(command, context, uow)` для будущей капитализации закупок.

- [ ] List/detail/saved views/archive/restore: preserve filter/order/access; архив не равен физическому удалению.
- [ ] Приход/перемещение/списание/AssetHolding: Decimal quantity, nonnegative totals, нельзя списать больше наличия. Гонка двух операций тестируется двумя независимыми connections.
- [ ] Повторить serializable/locking и bounded retries только для допустимых serialization/deadlock errors; rollback перед retry; не повторять произвольную ошибку с внешним эффектом.
- [ ] Maintenance/inventory/scan/complete/resolve: переходы статусов, двойной scan, повтор complete, агрегаты и акты. Зафиксировать семантику идемпотентности текущих команд.
- [ ] Import preview/commit/template: одинаковый разбор, duplicate inventory number, неподходящий файл, пустые строки, частичный сбой и atomicity как в старом контракте.
- [ ] QR/binary outputs: Content-Type/Disposition и access. Предварительный экспорт assets не должен оставаться скрытым TS DB writer/read path после 12.
- [ ] Переключить routes/SSR, проверить totals по project/MOL и состояние после одновременных операций.

**Проверки:** `uv run pytest tests/unit/assets tests/integration/assets tests/contracts/assets -q`; UI движение имущества → inventory → archive/restore; количественные инварианты в PostgreSQL, не только 200 response.

**Готово:** asset lifecycle целиком Python, резервный frontend route не исполняет старую запись. **Пауза:** concurrent write и optimistic/pessimistic/serializable механизм; самостоятельно написать regression test на двойное списание.

## Этап 08. Документы и файловая инфраструктура

**Источники:** `src/features/documents/{application,domain,infrastructure}/`, documents routes, `.runtime/documents`, `DOCUMENT_STORAGE_ROOT`, Docker volume. Работать с копией файлов.

**Создать:** `app/domain/documents/{access,file_policy,versioning}.py`, `app/domain/ports/documents.py`, `app/services/documents.py`, `app/services/dto/documents.py`, `app/repositories/documents.py`, `app/schemas/documents.py`, `app/api/routes/documents.py`, `app/integrations/{document_storage,document_rendering}.py`; тесты `tests/{unit,integration,contracts}/documents/`.

**Потребляет:** StoragePort (put/get/delete/stage/promote), auth scopes, related entity references. **Производит:** document/version/download APIs; metadata/read port для approvals/procurement.

- [ ] Upload/options/versions/archive/generate: сохранить categories/status/entity links и rule доступа. Multipart transport проходит BFF без потери boundary/файла.
- [ ] Сопоставить Python storage с существующим path/key layout, проверить symlink/path traversal, max size, MIME/file policy и SHA-256. Файлы не становятся публичными.
- [ ] Создание version/currentVersion атомарно в БД; сначала version существует, затем назначается currentVersion. Уникальность номера защищена при двух concurrent uploads.
- [ ] Описать и проверить протокол FS+DB: stage/temp, finalize, DB commit, cleanup/orphan recovery. Файловая система не участвует в DB transaction; падение в каждом промежутке должно быть воспроизводимо.
- [ ] Download streaming проверяет доступ до чтения, hash/size integrity, Content-Disposition и полный файл; BFF не буферизует большой upload/download без лимита.
- [ ] Document rendering вынести из event loop через thread pool; большой export не держит transaction. Повторить шаблоны, таблицы и русские шрифты; открыть реальные DOCX/PDF результаты.
- [ ] Переключить docs API/SSR, проверить ранее созданные файлы по copy volume, обновить workspace composition из 06.

**Проверки:** `uv run pytest tests/unit/documents tests/integration/documents tests/contracts/documents -q`; upload → version → download → compare SHA → archive, отказ доступа и повреждённый файл.

**Готово:** документы сохранены и доступны через Python, нет фиктивных currentVersion. **Пауза:** repository vs storage integration, транзакция БД vs внешний эффект; самостоятельно протестировать превышение размера.
