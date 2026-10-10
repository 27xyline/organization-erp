# Волна 1: основа Python backend и первый модуль

> Для агента: выполнять только явно выбранный пользователем этап. Следовать `superpowers:executing-plans` по задачам; не запускать subagents без запроса пользователя. После каждого этапа обязательная учебная пауза. Автоматические ветки/коммиты запрещены.

**Цель:** получить понятную основу FastAPI и первый работающий путь из существующего UI до PostgreSQL.

**Архитектура:** общие `app/api`, `services`, `repositories`, `models`, `schemas`, `domain`, `db`, `core`, `integrations`, `tasks`; слои по [архитектуре](../../specs/2026-09-28-fastapi-backend-design.md).

**Стек:** Python 3.13, uv, FastAPI/Pydantic 2, SQLAlchemy 2.x/asyncpg, Alembic, pytest/AnyIO/HTTPX, Ruff/mypy.

## Общие ограничения

- Всё новое Python размещается в `backend/`; текущий frontend остаётся в `src/`.
- ORM только в models/repositories/db; services зависят от `domain/ports`.
- Только отдельная учебная БД/копия документов; исходная БД не сбрасывается.
- Prisma единственный владелец DDL до этапа 14; на этапах 01–13 Alembic не меняет бизнес-схему.
- Ни один этап не включает следующий автоматически. Полный набор команд ниже предназначен для реализации, сейчас эти файлы/команды ещё не существуют.

## Приоритеты проверки

1. Анонимный/чужой actor не получает данные через bridge или repository-фильтр.
2. Ошибка после первой записи откатывает изменения, аудит и outbox.
3. SQLAlchemy mapping сохраняет SQL names, enum values, defaults и типы.
4. Отозванная сессия и forced password change работают во всех переходных endpoints.
5. HTTP errors, camelCase, Decimal/date/null и BFF streaming совместимы с frontend.

## Этап 00. Инвентаризация и фиксирование поведения

**Источники:** `src/app/api/**/route.ts`, `src/app/**/page.tsx`, `src/features/`, `prisma/schema.prisma`, `prisma/migrations/`, `src/lib/auth/`, `src/worker/`, `.github/workflows/ci.yml`.

**Создать:** `docs/backend-migration/api-contracts.md`, `schema-inventory.md`, `frontend-callers.md`, `write-owners.md`, `baseline-validation.md`, `backend/tests/contracts/fixtures/` с обезличенными примерами.

**Потребляет:** существующие route/schema/service/test contracts. **Производит:** проверяемый полный реестр; [исходная матрица](07-coverage.md) — отправная точка, не замена детальному контракту.

- [x] Для всех 102 route файлов выписать методы, URL/query/body, status, response shape, ошибки, permissions/scopes, binary/multipart поведение и вызываемые services.
- [x] Зафиксировать неоднородные ответы: `{data}`, `{data,pagination}`, дополнительные `summary`, raw JSON и файловые ответы. Не унифицировать их скрыто при переносе.
- [x] Найти все прямые Prisma/backend imports в страницах, layouts, server actions, CLI, seed/verify и worker; включить их в реестр writers/callers.
- [x] Для каждой модели выписать фактические SQL table/column names, ID/defaults, FK/onDelete, unique/index/check, enum, date/time, Decimal и nullable.
- [x] Отдельно прочитать SQL миграций: raw constraints и индексы не гарантированно видны из schema.prisma.
- [x] Составить fixtures для отрицательных сценариев: права, duplicate, неверные даты, closed period, failed approval, повреждённый файл. Не копировать реальные персональные данные/секреты.
- [x] Выполнить доступные текущие проверки (`npm run lint`, `npm run typecheck`, `npm test`, DB/E2E при готовом окружении) и записать baseline. Отличить инфраструктурный сбой от регрессии; сохранить пользовательское изменение `next-env.d.ts`.
- [x] Подготовить отдельную migration DB и отдельный document root; сделать backup/restore rehearsal на копии. Записать команды и целевые имена БД. Без подтверждённой копии не переходить к записи.

**Готово:** реестр покрывает API, схемы, callers и side effects; исходные проблемы записаны. **Пауза:** разобрать один существующий запрос и показать его слои до переноса.

**Фактический результат 7 октября 2026:** [реестры этапа 00](../../../backend-migration/README.md) и [baseline](../../../backend-migration/baseline-validation.md). Lint/typecheck/unit/E2E и backup/restore выполнены; DB baseline содержит два неустранённых outbox failures (3/5 passed). Original DB оставлена с 38 migrations; все 41 применены только к трём отдельным копиям. Учебная пауза ожидает разбора пользователя.

## Этап 01. Runtime, HTTP и тестовая среда

**Создать:** `backend/{pyproject.toml,uv.lock,.python-version,Dockerfile}`, `backend/app/{__init__.py,main.py}`, `app/core/{config,context,container,logging,middleware,observability}.py`, `app/api/{router,dependencies,errors}.py`, `app/api/routes/health.py`, `app/schemas/common.py`, `app/domain/errors.py`, `app/db/{base,session}.py`, `backend/tests/{conftest.py,unit/test_config.py,integration/test_health.py,contracts/test_error_envelope.py,architecture/test_layers.py}`.

**Изменить:** `docker-compose.yml`, `docker-compose.dev.yml`, `.env.example`, `.gitignore`, `.github/workflows/ci.yml` — добавить Python-сервис и проверки, не переключая существующий API.

**Интерфейсы:** `create_app(settings: Settings | None = None) -> FastAPI`; `Actor`/`RequestContext` dataclasses; engine/session factory создаются в lifespan и освобождаются при shutdown.

- [x] Написать тесты: live 200 даже при недоступной БД; ready 503 при недоступной БД и 200 при `SELECT 1`; error response имеет `{error:{code,message}}` и request ID.
- [x] Создать FastAPI с `/api/health/live`, `/api/health/ready`, `/openapi.json`; docs доступны в dev, production-политика описана. Общий prefix `/api` сохраняется.
- [x] Настроить Python package `app`, config из env, engine pool, `expire_on_commit=False`, request ID/trace propagation. Не логировать пароль/SQL bind values/целое тело запроса.
- [x] Запуск dev Python на 8000; frontend остаётся 3001. В Compose backend внутренний сервис, localhost port только в dev-overlay.
- [x] Создать HTTPX ASGITransport fixtures с явным lifespan, AnyIO backend `asyncio`, отдельную test DB. Тест, которому нужна PostgreSQL, не заменять SQLite.
- [x] Реализовать архитектурный pytest-тест по AST import graph: запреты из spec, включая транзитивную зависимость через core. Контрольный запрещённый import должен выявляться.
- [x] Зафиксировать зависимости lockfile; CI: `uv sync --frozen`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy app`, `uv run pytest` из backend directory.
- [x] Подключить минимальный OTEL lifespan к имеющемуся Collector; недоступный Collector не валит API. Остальные метрики этап 13.

**Проверка:** `uv run pytest tests/unit/test_config.py tests/integration/test_health.py tests/contracts/test_error_envelope.py tests/architecture/test_layers.py -q`. Должны пройти проверенные сценарии, а не только импорт приложения.

**Готово:** frontend и Python запускаются одновременно, production API всё ещё TS. **Пауза:** lifespan, Depends, настройки и тестовые fixtures.

**Фактический результат 8 октября 2026:** [проверки этапа 01](../../../backend-migration/stage01-validation.md). Полный Python набор прошёл на выделенной PostgreSQL `erp_stage01_test` (25 passed); Ruff, mypy и Docker build прошли. Одновременная проверка Next.js на 3001 и Python на 8000 успешна; production сохраняет `/openapi.json`, а `/docs` и `/redoc` возвращают 404. DDL/API owner не переключался; исходная `project1` не использовалась Python backend. Этап 02 не начат. **Пауза:** разобрать lifespan, Depends, настройки и тестовые fixtures.

## Этап 02. Mapping SQLAlchemy и UoW

**Создать:** `backend/app/models/{users,departments,catalogs,employees,projects,assets,documents,approvals,timekeeping,finance,procurement,notifications,reporting}.py`, `app/db/{registry,uow}.py`, `app/domain/ports/{uow,audit,notifications}.py`, `backend/migrations/env.py`, `backend/alembic.ini`, `backend/tests/integration/{test_schema_mapping,test_uow,test_async_loading}.py`.

**Интерфейсы:** все SQLAlchemy declarative models импортируются через `app/db/registry.py`; `UnitOfWorkFactory` и `UnitOfWork` Protocol из spec. Concrete `SqlAlchemyUnitOfWork` скрывает AsyncSession.

- [x] Описать все 51 модели в группах: identity/catalogs → HR/projects → assets/documents → workflows/finance/procurement → reporting/notifications. Допустима пауза после группы; не считать этап готовым при частичном mapping.
- [x] Сохранить фактические имена camelCase columns и snake_case tables, PG enum names/values, string IDs, Decimal precision и timezone/date semantics. Определить Python-генерацию совместимых ID; проверить отсутствие неявной смены на integer/UUID.
- [x] Повторить Prisma-only поведение `@updatedAt`, relation loading и application defaults: SQLAlchemy mapping сам по себе не переносит эти гарантии.
- [x] Написать read/write mapping tests на отдельной копии и проверить IDs/FK/null/date/Decimal round trips; изменения тестов откатываются.
- [x] Написать UoW tests: rollback при ошибке после insert, rollback без commit, успешный commit, отсутствие repository commits и общий connection/session во вложенном сценарии.
- [x] Реализовать минимальные typed audit/notification persistence adapters в UoW; бизнес-сервисы и интеграции остаются за пределами этапа. Read UoW не commit-ит автоматически.
- [x] Проверить eager-loading сериализацию после закрытия UoW и отдельные session в двух concurrent задачах; зафиксировать запрет implicit lazy IO.
- [x] Подготовить Alembic для read-only metadata review/будущей baseline. Изменяющие схему команды и revision generation не запускать до этапа 14. `_prisma_migrations` не удалять.

**Проверка:** `uv run pytest tests/integration/test_schema_mapping.py tests/integration/test_uow.py tests/integration/test_async_loading.py -q` на disposable PostgreSQL.

**Готово:** ORM всех таблиц согласован с inventory, транзакции работают. **Пауза:** ORM против domain, session против transaction, rollback и lazy loading.

## Этап 03. Auth, RBAC и переходный frontend bridge

**Источники:** `src/lib/auth.ts`, `src/lib/auth/{authorization,permissions,access-context,resource-scopes}.ts`, `src/proxy.ts`, `src/features/users/`, `src/lib/prisma.ts`, notification producer contracts.

**Создать:** `backend/app/domain/{auth/rules,ports/users,ports/audit,ports/notifications}.py`, `app/services/{auth,users,audit,notification_intents}.py`, `app/services/dto/auth.py`, `app/repositories/{users,audit,notifications}.py`, `app/schemas/{auth,users}.py`, `app/api/routes/{auth_internal,users,account}.py`, `app/integrations/auth_bridge.py`; `src/lib/backend/{client,bridge}.ts`. Переходные владельцы Next.js/Python зафиксированы в `docs/backend-migration/stage03-ownership.md`.

**Изменить:** NextAuth Credentials provider и user/password routes; существующие session/UI пока сохраняются. Добавить связанные Python/TS тесты.

**Интерфейсы:** `authenticate_credentials(username: str, password: str) -> CredentialResult`; `resolve_actor(user_id: str, session_version: int) -> Actor`; `require_permission(actor, permission, target)`; `AuditPort.append(record)` и `NotificationIntentPort.enqueue(intent)` внутри UoW. DTO pure dataclass.

- [x] Перенести нормализацию логина, Argon2id verification/rehash policy, 5 неудачных попыток и блокировку 15 минут; неизвестный пользователь не раскрывается отдельной ошибкой.
- [x] Защитить counters lock/update от concurrent login; покрыть threshold/lock expiry/reset тестом на PostgreSQL.
- [x] Перенести role assignments, scopes NONE/ALL/ASSIGNED/SELF, descendant departments, membership и `sessionVersion`. Проверять actor в БД на каждый запрос.
- [x] Реализовать internal bridge JWT из spec (HS256, отдельный secret, 60 секунд); закрыть internal credentials endpoint от недоверенного клиента. Проверки wrong aud/iss/alg, expired token, forged header, stale version.
- [x] BFF client forwarding: URL/query/method/body, status, request ID/traceparent; timeout и сетевые ошибки без fallback writes. Не пересылать внутреннюю подпись браузеру.
- [x] Написать negative tests: disabled user, смена пароля, forced password change (разрешён только account password path), доступ к чужому project/department, list фильтрация, direct ID, export option scope.
- [x] Реализовать совместимые audit/outbox producers: rollback вместе с доменной записью, payload понимает старый TS worker. Append-only repository не предоставляет update/delete API.
- [x] Перенести `/api/users*` и `/api/account/password`; NextAuth авторизация делегирует проверку паролей в Python. Старые дублирующие user/password writers отключить.

**Проверка:** `uv run pytest tests/unit/auth tests/integration/auth tests/contracts/auth -q`; Vitest bridge/client tests; реальный браузер login → restricted screen → смена пароля → повторный вход. Нужные test directories создать в этом этапе.

**Готово:** browser session NextAuth, credentials/access/user mutations Python; один владелец, проверенные scopes. **Пауза:** authentication vs authorization, BFF, signing и отзыв сессии.

## Этап 04. Первый полный модуль: подразделения и справочники

**Источники:** `src/features/departments/`, `src/features/assets/application/catalog.service.ts`, `src/lib/organization/organization-mutation.ts`, routes `/api/departments`, `/api/groups`, `/api/mols` и их страницы.

**Создать:** для `departments` и `catalogs`: `app/domain/<module>/rules.py`, `app/domain/ports/<module>.py`, `app/services/<module>.py`, `app/services/dto/<module>.py`, `app/repositories/<module>.py`, `app/schemas/<module>.py`, `app/api/routes/<module>.py`; unit/integration/contract tests по этим модулям.

**Интерфейсы эталона:** `DepartmentService.list(query, context)`, `create(command, context)`, `update(id, command, context)`, `delete(id, context)`; port `DepartmentRepository.list_visible`, `get`, `ensure_unique`, `add`, `update`, `delete`. Конкретные command/result dataclasses фиксируются по этапу 00 до кодирования.

- [x] Тесты на parent tree, дубликат, несуществующего руководителя, удаление используемого подразделения, scoped list и rollback аудита; сохранена сериализация ошибок.
- [x] Перенести организационную блокировку и invariants вместе с CRUD; проверены удаления, переименование и области доступа.
- [x] Реализовать router → service → port → repository и зафиксировать полный пример в [обучающем trace](../../../backend-migration/stage04-validation.md).
- [x] Перенести группы и МОЛ, оставив Employee CRUD вне этапа; читать справочные данные через уже mapped таблицы.
- [x] Переключить только routes подразделений, групп и МОЛ; SSR использует backend client с `no-store`; текущие владельцы записаны в [реестре Stage 04](../../../backend-migration/stage04-ownership.md).
- [x] Пройти UI create/edit/list и ошибки для ADMIN и scoped роли; сравнить состояние и аудит с живым TS baseline на отдельной БД.

**Проверка:** `uv run pytest tests/unit/departments tests/integration/departments tests/contracts/departments -q` и аналогичные directories `catalogs`; frontend lint/typecheck, focused Vitest и Playwright сценарии подразделений.

**Готово:** вертикальный путь реализован и проверен без Prisma/service imports в страницах этих модулей. Результаты — [отчёт Stage 04](../../../backend-migration/stage04-validation.md). **Пауза:** пользователь самостоятельно добавляет поле фильтра или бизнес-правило с тестом; следующий этап ждёт отдельной команды.
