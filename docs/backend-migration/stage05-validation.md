# Проверка этапа 05: кадровые процессы

Функциональные проверки выполнены 13 октября 2026 года; финальная Docker-сборка и smoke gate — 15 октября. Исходный baseline — commit `9b4920e9868e856f5968dbdf5cb2fe957943d1f2`. Тесты записывали только в три изолированные Stage 05 базы; production/source `project1` и migration baseline не использовались как цели записи.

## Изменения и поведенческий контур

Перенесены browser API сотрудников, кадровых действий/sync, отпусков и штатного расписания; SSR сводки и профиля читают Python. Существующие session/Origin/Zod/permission prechecks в Next.js сохранены, backend повторяет проверку actor/scope. Обработка недоступности backend не переключает запрос в Prisma.

Playwright проверил ограниченный кадровый сценарий: HR видит назначенных сотрудников, EMPLOYEE — только собственную кадровую запись; hire → продление договора → перевод на другую QA позицию → отпуск → dismiss; sync с scoped actor не меняет просроченный договор в чужом подразделении; увольнение сохраняет сотрудника в архиве. Дополнительно весь существующий E2E-набор для Stage 03/04 и приложения прошёл.

Актуальные решения по совместимости: профиль и dashboard сохраняют legacy salary fields для прежних employee/staff scope без нового `finance.salary.read` фильтра; project-aware employee references требуют `projectMembers.create`, исключают бывших членов проекта и показывают зарплатную сумму только при `projectPayroll.read`. Payroll lock не применяется, потому что исходные HR маршруты не записывают payroll periods. Отпуска могут пересекаться, а равные границы дат разрешены; выбор года использует включительное пересечение. Кадровый baseline создаёт только предусмотренные аудит-записи и не создаёт notification outbox intents. Scoped sync — намеренное исправление старого отсутствующего access filter; проверка прав actor и idempotent ARCHIVE выполняются под общей транзакционной блокировкой `904202607` и `FOR UPDATE`; golden parity для администратора с ALL scope сохранён. Review cases покрывают nullable signed date и null/0 coercion, пустые issuer/number как SQL NULL, прежние generic-500 mappings для отпуска с неизвестным сотрудником и удаления отсутствующего кадрового действия.

## Legacy golden scenario

Исходный TypeScript service capture был запущен из baseline commit на отдельной schema-only `erp_stage05_legacy` БД. Raw runner/capture и его нормализованный результат лежат локально в ignored `.runtime/stage05/parity-legacy-raw.json` и `.runtime/stage05/parity-golden-legacy.json`; они не содержат секретов и не добавлены в Git. Python contract fixture находится в `backend/tests/contracts/fixtures/stage05-legacy-parity.json`.

Один запуск synthetic сценария прошёл `hire → extend → transfer → vacation → dismiss → expired-contract sync × 2`. Финальный сотрудник имеет статус `DISMISSED`, переведён на `position-b` в `department-b`, сохранил дату конца договора `2027-12-31`, одна запись отпуска; действия истории: `HIRE`, `EXTEND`, `TRANSFER`, `DISMISS`. Первый sync создал одну ARCHIVE action, второй — ноль дублей; архивировано одно истёкшее соглашение. Audit counts: 2 `STAFF_POSITION_CREATE`, 2 `EMPLOYEE_CREATE`, 3 `PERSONNEL_ACTION_CREATE`, 1 `VACATION_CREATE` (всего 8); notification outbox count — 0. В Python contract сравнивается нормализованный результат. Это service-level legacy capture, а не отдельное утверждение о полном HTTP-сравнении каждого route.

Обучающий trace увольнения: route валидирует actor и scope; service получает organization lock и UoW, загружает сотрудника/действие, проверяет доступ и правила перехода, затем repository меняет status, очищает `Department.headEmployeeId`, создаёт запись `PersonnelAction` и аудит в том же transaction. `commit` происходит один раз на границе UoW. При любой ошибке до commit изменения откатываются совместно; исторический сотрудник не удаляется физически. Уведомление не создаётся, так как legacy workflow его не производил.

Самостоятельное упражнение: добавьте правило срока действия сертификата: сначала зафиксируйте требуемые границы дат и поведение для пустого `expiresAt`, затем напишите красный unit test и проведите его через правило → service/DTO → API. Это упражнение намеренно не реализовано в Stage 05; сейчас перенос сохраняет certificate dates и не вводит новый expiry business rule.

## Команды и результаты

Команды ниже читают закрытые env-файлы локально; не печатайте их содержимое и не source-ите как shell script.

| Проверка | Команда | Результат |
| --- | --- | --- |
| Python unit/integration/contracts на `erp_stage05_test` | `(cd backend && uv run --env-file ../.runtime/stage05/test.env pytest -q)` | 154 passed in 7.97s; raw log `.runtime/stage05/python-final-pytest.log`; включает прежние Stage 02/03/04 regressions. |
| Python type/static/style | Из `backend/`: `uv run ruff check app tests`; `uv run ruff format --check app tests`; `uv run --env-file ../.runtime/stage05/test.env mypy app` | Все проверки прошли; 137 файлов Ruff format и 94 source files mypy; raw logs указаны в `python-report.md`. |
| TypeScript | `npm run typecheck` | Passed. |
| Frontend unit tests | `npm test` | 294 passed, 5 skipped; результат получен 13 октября, raw log не сохранён. |
| ESLint changed files | `npx eslint` по изменённым Stage 05 route, SSR, E2E и config файлам | Passed. |
| Playwright | `node --env-file=.runtime/stage05/e2e.env node_modules/@playwright/test/cli.js test` | 8 passed; результат получен 13 октября, raw log не сохранён. Весь E2E-набор включал HR-сценарий и прежние сценарии приложения. |
| Next production build | `next build --webpack` с `.runtime/stage05/e2e.env` в окружении | Passed. Стандартный Turbopack build завершился sandbox EPERM на создании дочернего процесса для PostCSS; Webpack build компиляция, TypeScript, 48 статических страниц и trace прошли. |
| Docker app/backend image build | `docker build --target runner -t erp-stage05-smoke-app:local .`; `docker build -t erp-stage05-smoke-backend:local ./backend` | Оба образа собраны 15 октября; raw logs `.runtime/stage05/docker-build-app.log` и `docker-build-backend.log`. |
| Docker shared-DB readiness smoke | Изолированные app и backend smoke-контейнеры на отдельной Docker network; Next `/api/health/ready`, backend `/api/health/ready`, а также backend readiness через сеть app | Оба сервиса ответили 200 при подключении к `erp_stage05_e2e`. Первый app-запрос вернул 503 из-за отсутствующего в локальном smoke env `DOCUMENT_STORAGE_ROOT`; после добавления Compose-значения `/var/lib/project1/documents` smoke прошёл. Код приложения не менялся. Raw logs: `.runtime/stage05/docker-smoke-app.log`, `docker-smoke-backend.log`; env-файлы имеют mode 0600. Временные Stage 05 smoke-контейнеры и выделенная сеть удалены; PostgreSQL оставлен запущенным. |

## Изоляция и безопасный повторный запуск

`erp_stage05_test`, `erp_stage05_e2e` и `erp_stage05_legacy` — schema-only базы с 52 public tables. Приватные `test.env`, `e2e.env`, `legacy.env` имеют mode `0600` и находятся под ignored `.runtime/stage05/`. Node и Python в E2E указывают на один `erp_stage05_e2e`; `reuseExistingServer` выключен. Playwright проверяет whitelist изолированных DB имён и разные bridge/internal-auth secrets. Node загружает env через `--env-file`, Python через `uv run --env-file`; не используйте `source`, не показывайте secrets и не запускайте миграции.

До Next build user-owned `next-env.d.ts` был сохранён в `.runtime/stage05/original-next-env.d.ts`, SHA-256 `d55d89a99f49bee7df149125eb311367460827b1d986ae98ca312c9e10caa478`. Build добавил Next-generated import; исходный пользовательский файл восстановлен из проверенной копии и его итоговый hash совпадает. `tsconfig.json` не менялся. Stage 05 smoke-контейнеры на базе `erp_stage05_e2e`, включая оставленные при прерывании 13 октября, удалены после проверки. В Docker остался запущен PostgreSQL; remote GitHub Actions не запускался.

Remote GitHub Actions не запускался. Stage 05 изменил локальную CI-конфигурацию, чтобы backend job создавал отдельную `erp_stage05_test` schema-copy и задавал `STAGE05_TEST_DATABASE_URL`; удалённый результат не заявляется.
