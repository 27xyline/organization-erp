# Этап 04: подразделения и справочники

Проверено 10 октября 2026 года. Этап переключает browser API и SSR для подразделений, групп имущества и материально ответственных лиц (МОЛ). Employee CRUD, другие бизнес-модули, worker и смена владельца DDL остаются за рамками этапа.

## Владельцы и границы

Актуальные владельцы описаны в [реестре Stage 04](stage04-ownership.md). Next.js сохраняет публичные URL, session/Origin/forced-password guards, permission prechecks, Zod-проверку запросов и Stage 03 bridge. После этих проверок фиксированный BFF передаёт запрос Python; backend повторно проверяет actor, права и scope. Ошибка или недоступность Python не включает Prisma fallback. SSR-страницы сохраняют свои permission checks и читают данные через `backendUserFetch` с `private, no-store`. Prisma остаётся владельцем DDL до Stage 14.

Переименование подразделения по-прежнему обновляет денормализованные `Employee.department`, `StaffSchedule.department` и `Mol.department` под общей блокировкой организации. Это часть паритета department mutation, а не перенос Employee CRUD. `clearEmployeeDepartmentLeadership` остаётся TS-побочным эффектом кадровых операций под той же блокировкой и является явной границей Stage 05. `prisma/demo-seed.ts` остаётся отдельным gated bootstrap writer за `ALLOW_DEMO_SEED`; он не является browser API и его нельзя запускать одновременно с runtime-записями.

## Живое сравнение с TypeScript

Legacy TypeScript из commit `3850217` был запущен на отдельной schema-only БД `erp_stage04_legacy`. Сохранённые runner и нормализованный результат находятся в ignored-каталоге `.runtime/stage04/legacy-parity.ts` и `.runtime/stage04/legacy-parity.json`; там же лежат сырые логи. Runner выполнил создание, дубликат, переименование и удаление подразделения, CRUD и ошибку дубликата группы, а также CRUD и ошибку дубликата МОЛ. Сравнивались ответы и ошибки, состояние записей, девять audit events и обновление трёх денормализованных подписей при переименовании. Идентификаторы были нормализованы, временные метки исключены.

Ожидаемое поведение сохранено в [fixture parity](../../backend/tests/contracts/fixtures/stage04-legacy-parity.json). Полный Python-набор повторно сравнил с ним результаты и все девять нормализованных audit events: `95 passed`. Проверка очистки отдельной legacy-БД подтвердила отсутствие созданных runner-ом строк в `users`, `departments`, `employees`, `staff_schedule`, `mols`, `asset_groups` и `audit_logs`. БД `project1` и migration-copy не использовались как цели записи.

## Проверки

| Проверка | Результат |
| --- | --- |
| Python unit, integration и contract tests | `95 passed`, включая parity fixture; Ruff check/format и mypy прошли. |
| Vitest | 97 файлов прошли, 2 пропущены; `309 passed`, `5 skipped`. |
| TypeScript typecheck | Прошёл. |
| ESLint изменённых BFF, SSR, service ownership и E2E-файлов | Прошёл. |
| Playwright на изолированной E2E-БД | `7/7 passed`: шесть прежних сценариев и Stage 04 CRUD/ошибки/scoped-MOL сценарий. |
| Next.js production Webpack build | Прошёл. Host Turbopack для этой проверки не использовался из-за известного `EPERM` при создании subprocess в sandbox. |
| Docker Compose build | Образы `app` и `backend` собраны. |
| Docker smoke | `/api/health/ready` ответил `200` у обоих контейнеров; собственные smoke-контейнеры остановлены после проверки. |
| Защищённый `next-env.d.ts` | После сборки восстановлен SHA-256 `d55d89a99f49bee7df149125eb311367460827b1d986ae98ca312c9e10caa478`; резервная копия совпадает. |

Playwright проверил администраторский список, создание, редактирование и ошибки подразделений, групп и МОЛ, а также работу ограниченного `ASSET_CUSTODIAN`: список ограничен назначенным подразделением, прямой доступ к чужому МОЛ и создание в чужом подразделении отклоняются, разрешённые создание и изменение проходят.

## Изолированные базы и безопасный повторный запуск

`erp_stage04_test`, `erp_stage04_e2e` и `erp_stage04_legacy` — schema-only копии 52-табличной migration-copy. Тестовые записи создаются только в этих трёх БД. Приватные env-файлы с правами `0600` и raw logs находятся в ignored `.runtime/stage04/`; секреты не сохраняются в этом документе или Git. Stage 04 не применяет исходные Prisma migrations, Alembic и worker.

В `test.env`, `e2e.env` и `legacy.env` заданы независимые Stage 04 database settings и bridge keys. Загружайте значения через `node --env-file` или `uv --env-file`, не печатая env-файлы. Playwright требует, чтобы `DATABASE_URL` совпадал с `STAGE04_E2E_DATABASE_URL`, а ключи bridge и internal auth различались. Stage 03 сохраняет fallback-настройку; для проверки Stage 04 нужен именно Stage 04 E2E env.

## Обучающий trace: создание подразделения

Для запроса `POST /api/departments` с телом `{code: ' qa ', name: 'Отдел  качества'}` значение проходит через [Next.js route](../../src/app/api/departments/route.ts) и [Python router/schema](../../backend/app/api/routes/departments.py): браузерный контракт и проверки Next.js сохраняются, а Python schema превращает camelCase-ввод в команду use case. [DepartmentService.create](../../backend/app/services/departments.py) проверяет actor и `departments.create`, нормализует код в `QA`, а название — в `Отдел качества`, затем входит в одну UoW. Под общей блокировкой организации service повторно проверяет actor/session version и применяет правила уникальности, родителя и руководителя.

Service зависит от [domain port](../../backend/app/domain/ports/departments.py), а не от ORM. [SQLAlchemy repository](../../backend/app/repositories/departments.py) сохраняет запись; та же UoW добавляет `DEPARTMENT_CREATE` с ключами `code`, `name`, `parentId`, `headEmployeeId` и `isActive`, после чего выполняется один явный commit. Router возвращает сохранённое подразделение в `{data: ...}` со статусом `201`. Ошибка до commit откатывает и запись, и аудит; BFF не переключает запись в Prisma.

Для самостоятельного упражнения добавьте фильтр списка по `parentId`: сначала зафиксируйте query contract и красный тест, затем проследите URL → Next route → Python router/schema/service/port/repository → ответ и проверьте, что scope применяется до выдачи строк. Фильтр не входит в Stage 04 и здесь не реализован.

## Статус

Реализация и перечисленные проверки Stage 04 завершены. Учебная пауза после этапа остаётся отдельным шагом; Stage 05 не начат и ждёт отдельной команды пользователя.
