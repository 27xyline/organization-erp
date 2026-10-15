# Stage 06: проверка переноса проектов и задач

Дата: 15 октября 2026. Источник legacy capture: `2d9da58320a27d0a4de03d813153d4ccbb5ce1de`; текущая ветка `fastapi-runtime-foundation`. Python API commit: `827fa102160ee5f58fdca0075d330830c0b3a3d8` (`Перенести проекты и задачи на FastAPI`). Frontend/BFF и отчёты входят в отдельный завершающий коммит этого этапа. Push и remote GitHub Actions не выполнялись.

## Результат

Перенесены проекты, участники, задачи, зависимости, checklist, comments и project workspace/activity reads. Next.js маршруты сохраняют публичный URL, browser session, Origin, permission/resource prechecks, body validation, статусы и DTO; закрытый BFF проксирует в FastAPI, не имея Prisma fallback. SSR списка и форм проекта использует backend references, workspace — backend projection. Документы остаются отдельным авторизованным TypeScript read path до Stage 08; project payroll остаётся TS до Stage 10.

Проверен matrix из таблицы [Stage 06 ownership](stage06-ownership.md). В частности: Kanban использует legacy PUT `{status}`, в UI проверены успешный drag → refresh и сохранённый статус, а также внедрённый HTTP 500 → optimistic rollback. Member role с ограниченным project scope получает отказ; Gantt/critical path получает прежний DTO. Playwright создаёт независимые контексты для admin/member.

## Legacy capture и решения

Synthetic сценарий был исполнен из git archive baseline на отдельной legacy DB: project create/update, member add/archive, predecessor/successor task с assignee/dependency/checklist, составной status/name/progress update, comment, удаление task и project. Нормализованный результат сверяет состояние, raw/flattened relation shapes и 8 полных audit payloads. Python replay прошёл; generated IDs/timestamps нормализованы, значения не подменялись. Notification outbox при обычном workflow равен нулю: legacy mutation не создаёт notification intent. Фактические исходные audit actions: `PROJECT_CREATE`, `PROJECT_UPDATE`, два `TASK_CREATE`, `TASK_UPDATE`, `TASK_COMMENT`, `TASK_DELETE`, `PROJECT_DELETE`.

Фактический HTTP capture legacy подтвердил malformed непустые project/task даты на POST → HTTP 500 с пустым телом; Python сохраняет 500 через generic `internal_error`, без утечки SQL/Prisma детали и без частичной строки/аудита. Duplicate project code создаёт POST=409, PUT=500; асимметрия сохранена и протестирована. Child `parentId` при удалении parent остаётся `NULL` с прежним level, связи dependency/checklist/comment/assignee каскадируются согласно исходной схеме. Actor блокируется до project; конкурентная циклическая edge mutation не оставляет два цикла и не deadlock-ит с actor/scope update. Invalid graph rollback не меняет task/relations/audit.

Согласованное намеренное исправление: PROJECT_MANAGER без `projectPayroll.read` не получает сохранённые зарплаты в POST/PATCH ответах; форму пустого значения legacy API сохраняет. DB snapshot не очищается, ADMIN видит фактическую сумму. Исправление ограничено project-members API и не меняет Stage 05 HR visibility.

## Проверки

Локальные команды загружают закрытые env-файлы штатным механизмом; их нельзя `source`-ить или печатать. Raw логи собраны под ignored `.runtime/stage06/`.

| Проверка | Команда | Результат |
| --- | --- | --- |
| Python suite на изолированной Stage06 test DB | `(cd backend && uv run --env-file ../.runtime/stage06/test.env pytest -q)` | 173 passed, `.runtime/stage06/python-full.log`. Ruff check/format и mypy прошли (`python-ruff.log`, `python-format.log`, `python-mypy.log`). |
| Vitest | `node --env-file=.runtime/stage06/test.env ./node_modules/vitest/vitest.mjs run` | 284 passed, 5 skipped; `.runtime/stage06/vitest-final.log`. Предыдущие TS business service tests удалены вместе с мигрированными writers; соответствующие backend workflows покрыты Python suite. |
| TypeScript | `node --env-file=.runtime/stage06/test.env ./node_modules/typescript/bin/tsc --noEmit` | Passed; `.runtime/stage06/typecheck-final.log`. |
| ESLint изменённого frontend subset | `node --env-file=.runtime/stage06/test.env ./node_modules/eslint/bin/eslint.js <изменённые TS/TSX/E2E/config файлы>` | 0 errors; `.runtime/stage06/eslint-final.log`. ESLint не конфигурирует YAML-файлы CI. Full repo lint завершился nonzero на существующих unrelated файлах; изменения CI проверены diff/CI tests. |
| Playwright full baseline + Stage 06 | `node --env-file=.runtime/stage06/e2e.env node_modules/@playwright/test/cli.js test` | 9 passed; `.runtime/stage06/playwright.log`. Stage06-only: 1 passed (`playwright-stage06.log`). Неудачные диагностические логи сохранены отдельно. |
| Next production build | `node --env-file=.runtime/stage06/test.env /private/tmp/run-stage06-next-build.mjs` | Webpack build прошёл, страницы сгенерированы; `.runtime/stage06/next-webpack-build.log`. Локальный host Turbopack ранее упёрся в EPERM на subprocess; production контейнерный build целевого runner ниже прошёл через Docker Turbopack. |
| Docker images | `docker build --target runner -t organization-erp-stage06-app:local -f Dockerfile .`; `docker build -t organization-erp-stage06-backend:local ./backend` | Оба образа собраны. Raw logs `.runtime/stage06/docker-app-build.log` и `docker-backend-build.log`; runner build повторён на Docker target. |
| Docker readiness and document storage | Изолированная сеть `stage06-smoke`, app/backend containers, own `stage06-smoke-documents` volume | Next `/api/health/live` и `/api/health/ready`: 200; backend live/ready: 200 (`docker-app-*.json`, `docker-backend-*.json`). App запущен как UID 1001 `nextjs`; его процесс создал/удалил пробный файл на `/var/lib/project1/documents`. Volume не общий с пользовательскими документами. |

## Инцидент при Docker smoke и ограничения

Первый `docker build` использовал default final target Dockerfile, которым является notification worker. Ошибочный `stage06-smoke-app` контейнер был запущен на временной Docker network с env, указывающим только на `erp_stage06_e2e`; его stdout содержал `SMTP settings not configured, skipping outbox processing`. Контейнер остановлен и удалён сразу после распознавания target mismatch. Нельзя утверждать, что worker не стартовал: контейнер действительно кратковременно запустился. SMTP не был настроен, worker сообщил о пропуске обработки; никаких внешних email-доставок в этом smoke не выполнялось. Последующая read-only SQL проверка из целевого app контейнера показала `notification_outbox`: total=0, pending=0, processing=0, sent=0, failed=0 (`.runtime/stage06/docker-outbox-check.json`). После этого собран правильный `runner` target, приложение readiness прошло.

Stage06 базы были созданы template-copy из `erp_migration_20261007` с последующей очисткой только собственных изолированных копий. Это не `pg_dump --schema-only`; source baseline и `project1` не были write targets. Для каждой Stage06 DB проверено 52 таблицы и 0 строк до workflow. Приватные `.runtime/stage06/{test,e2e,legacy}.env` имеют mode 0600, независимые secrets; browser origin оставлен `http://localhost:3001`, backend bind `127.0.0.1:8000`. Docker DB evidence содержит только имя `erp_stage06_e2e`, никаких секретов.

Next build backup пользовательского `next-env.d.ts` лежит под ignored `.runtime/stage06/original-next-env.d.ts`; его исходный/итоговый SHA-256 `d55d89a99f49bee7df149125eb311367460827b1d986ae98ca312c9e10caa478`. `tsconfig.json` SHA-256 `3336d447bca5f48a2614cc5b4636c10178f0bfcce92c6fc277fe66f35087f885` сохранён. Docker-generated Next provenance files перенесены целиком в ignored `.runtime/stage06/generated-next-docs`, не коммитятся. Smoke containers/network/volume удалены после сбора log/HTTP evidence; PostgreSQL оставлен запущенным.

Полный repository ESLint и remote CI не являются green gates этого отчёта: полный lint выдаёт ошибки в исходно не затрагиваемых файлах; CI не запускался. Локальный changed frontend ESLint, typecheck, Vitest, Playwright, Python tests, Webpack build и Docker runner/readiness прошли. `next-env.d.ts` уже был пользовательским изменённым файлом и остаётся modified с сохранённым исходным содержимым.

Учебная пауза Stage 06: для графа A → B → C задача B зависит от A, C от B, а критический путь — самый длинный путь по длительностям; отдельно разберите project/depth/date/status правила задач и запрет циклов. Затем самостоятельно добавьте domain-правило deadline (например, срок не раньше даты старта) с красным тестом и доведите его через service → API. Deadline business rule и это упражнение не реализованы. Stage 07 не начат.
