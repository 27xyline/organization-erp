# Organization ERP

Внутренняя система учёта имущества, сотрудников, проектов, закупок, финансов,
документов и согласований. Интерфейс работает на Next.js; FastAPI — единственный
backend и владелец бизнес-правил, доступа к данным и сессий. PostgreSQL хранит
данные, Alembic управляет схемой, Python worker обрабатывает уведомления.

## Структура проекта

```text
organization-erp/
├── backend/           # FastAPI, бизнес-логика, SQLAlchemy, Alembic, Python worker
├── frontend/          # Next.js, UI, BFF, npm, unit/E2E-тесты
├── docs/              # Архитектура, записи миграции и инструкции
├── ops/               # Общая observability-инфраструктура
├── docker-compose.yml
├── docker-compose.dev.yml
└── .env.example       # Общие настройки Compose и Python CLI
```

Для разработки Next.js на хосте: `cd frontend`, `npm ci`,
`cp .env.example .env.local`, `npm run dev`. Python запускается из `backend/`:
`uv run --env-file ../.env uvicorn app.main:create_app --factory --reload --port 8000`.
`frontend/.env.local` содержит только URL; корневой `.env` остаётся у Compose/Python.

## Быстрый старт

Нужны Node.js 22+, Python 3.13+, `uv` и Docker Compose.

```sh
cp .env.example .env
# В .env задайте свой POSTGRES_PASSWORD и BACKEND_CSRF_SECRET.
# Секрет можно сгенерировать командой: openssl rand -hex 32
npm --prefix frontend ci
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
```

Compose запускает PostgreSQL 18.6 в новом volume `project1_postgres_data_v18`,
одноразовый `migrate` с `alembic upgrade head`,
FastAPI, Next.js и Python notification worker. Документы хранятся в отдельном
Docker volume. Интерфейс доступен на `http://localhost:3001`, backend — на
`http://127.0.0.1:8000`. Observability запускается отдельно:

Это fresh-cluster запуск. Существующий PostgreSQL 15 volume сохраняется и не
подключается автоматически к PostgreSQL 18. Перенос его данных требует
отдельно подготовленного и проверенного `pg_upgrade` либо backup/restore;
`alembic upgrade head` управляет схемой, но не переносит данные между кластерами.

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml \
  --profile observability up --build -d
```

Для первого входа создайте администратора с хоста. Убедитесь, что
`BACKEND_DATABASE_URL` в `.env` указывает на локальную Compose БД
(`localhost:5434`), затем выполните:

```sh
cd backend
uv run --env-file ../.env python -m app.scripts.create_admin
```

Python CLI просит логин, имя и скрытый пароль.
Пользователю потребуется сменить временный пароль после входа. Небольшой
связанный учебный набор можно добавить отдельно командой `uv run --env-file ../.env python -m app.scripts.seed` из `backend/`;
проверка инвариантов данных — `uv run --env-file ../.env python -m app.scripts.verify_data`.

## Переменные окружения

Next.js не подключается к доменной БД. Его серверная часть получает адрес
FastAPI и передаёт браузерную Python session для проверки на каждом запросе.

| Переменная | Кто использует | Назначение |
| --- | --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Compose | Создание локальной PostgreSQL БД |
| `BACKEND_DATABASE_URL` | Python CLI на хосте | Адрес БД с драйвером `postgresql+asyncpg`; для локального Docker — `localhost:5434` |
| `BACKEND_BASE_URL` | Next.js | URL FastAPI; `localhost:8000` для запуска на хосте, Compose задаёт `backend:8000` |
| `BACKEND_CSRF_SECRET` | FastAPI | Подпись CSRF token |
| `BACKEND_PUBLIC_ORIGIN` | Next.js и FastAPI | Браузерный origin для проверки unsafe запросов |
| `NEXT_PUBLIC_APP_URL` | Next.js | Публичный адрес приложения, например для QR-кода |
| `DOCUMENT_STORAGE_ROOT` | FastAPI и worker | Корень файлового хранилища документов |

Сгенерируйте секрет отдельным вызовом `openssl rand -hex 32`. Не
используйте значение из `.env.example` как ключ. В Compose backend и worker
получают `BACKEND_DATABASE_URL` из `POSTGRES_*`; значение в `.env` нужно для
host-run CLI и Python-команд.

## Как проходит запрос

Пример — загрузка проекта на странице `/projects`:

1. Страница в `frontend/src/app/(app)/(main)/projects/page.tsx` проверяет actor и
   permission для отображения страницы, затем загружает данные через
   Python-backed SSR client.
2. Браузерные запросы идут на тот же origin, например `/api/projects`. Файл в
   `frontend/src/app/api/projects/route.ts` — BFF transport adapter: он проверяет
   сессию/CSRF, сохраняет публичный URL и пересылает запрос в FastAPI.
3. `frontend/src/lib/backend/transport.ts` пересылает Python session cookie и CSRF
   headers; `frontend/src/lib/backend/client.ts` отправляет запрос на фиксированный
   backend URL без кэширования. Недоступность Python возвращает ошибку;
   Prisma fallback нет.
4. FastAPI связывает URL с обработчиком в `backend/app/api/routes/projects.py`.
   Pydantic schema проверяет вход и ответ, service выполняет сценарий, domain
   применяет бизнес-правила через ports, repository работает с моделями и
   SQLAlchemy session.
5. Транзакция фиксируется через Unit of Work. Backend повторно проверяет actor,
   permission и ресурсный scope. Ответ возвращается через BFF в браузер.

Исходный путь по слоям:

```text
frontend/src/app (страница или BFF route)
  → frontend/src/lib/backend (session-aware transport)
  → backend/app/api/routes + backend/app/schemas
  → backend/app/services
  → backend/app/domain
  → backend/app/repositories + backend/app/models
  → backend/app/db + PostgreSQL
```

Для нового поведения ищите бизнес-сценарий в Python `services`, правило — в
`domain`, сохранение — в `repositories` и соответствующий API schema/route.
В `frontend/src/features` находятся UI и frontend contracts, а не отдельные владельцы
бизнес-записей.

## Архитектурные правила

- FastAPI — единственный backend и единственный владелец доменных записей.
- Next API routes сохраняют browser-facing URL и работают как транспортные
  адаптеры. Они не пишут в БД и не обходят Python permissions/scopes.
- Сессии, проверка `sessionVersion`, роли и resource scopes принадлежат Python.
  Unsafe запросы требуют CSRF cookie/header; проверка `Origin` не отключается.
- `backend/app/api` зависит от schemas и services; services координируют
  domain и repositories; domain не зависит от FastAPI/SQLAlchemy.
- Alembic — единственный активный DDL owner. История старых SQL-миграций
  уже включена в замороженную Alembic baseline. Prisma schema сохранена
  только в `frontend/e2e/prisma/` для тестовых фикстур.
- PostgreSQL и каталог документов должны репетироваться на отдельной копии до
  миграции. Не подключайте старый Prisma runtime к схеме под Alembic.
- Redis/Celery не требуются для базового запуска: notification worker работает
  на Python и PostgreSQL.

## Python CLI и миграции

В активном запуске миграции выполняет Compose service `migrate`. Для host-run
команд используйте Python backend и `BACKEND_DATABASE_URL`:

```sh
cd backend
uv sync --frozen
uv run --env-file ../.env alembic current
uv run --env-file ../.env alembic upgrade head
uv run --env-file ../.env python -m app.scripts.verify_schema
uv run --env-file ../.env python -m app.scripts.seed
uv run --env-file ../.env python -m app.scripts.verify_data
uv run --env-file ../.env python -m app.scripts.create_admin
```

Перед `upgrade head` на существующей базе выполните проверку и handoff из
[Stage 14A](docs/backend-migration/migration-handoff.md). Не запускайте Prisma
migrate, `db push` или `reset` и не удаляйте volumes. Рабочее переключение или
rollback не выполняется этим README; порядок и ограничения rehearsal описаны в
[Stage 14C acceptance](docs/backend-migration/acceptance-report.md),
[cutover runbook](docs/backend-migration/cutover-runbook.md) и
[rollback runbook](docs/backend-migration/rollback-runbook.md).

## Проверки

Frontend (из `frontend/`):

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Backend (из `backend/`):

```sh
uv sync --frozen
uv run ruff check .
uv run ruff format --check .
uv run mypy app
uv run pytest
```

Playwright требует отдельную disposable БД и локальный CSRF secret. Prisma
client из `frontend/e2e/prisma/schema.prisma` используется только тестовыми E2E fixture helpers; команда `npm run
test:e2e` генерирует его для теста. Frontend build и production image от Prisma
не зависят.

## Полезные документы

- [Frontend: запуск и тесты](frontend/README.md)
- [Backend API и слои](backend/README.md)
- [Stage 14B: Python sessions](docs/backend-migration/stage14b-validation.md)
- [Stage 14C: acceptance](docs/backend-migration/acceptance-report.md)
- [Stage 14D: runtime cleanup and validation](docs/backend-migration/stage14d-validation.md)
- [Stage 14A: передача миграций Alembic](docs/backend-migration/migration-handoff.md)
- [Будущие практические упражнения](docs/superpowers/plans/2026-09-28-fastapi/09-future-exercises.md)
