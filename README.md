# ERP организации

Внутренняя система учёта имущества, сотрудников, проектов, закупок, финансов,
документов и согласований. Интерфейс работает на Next.js; FastAPI — единственный
сервер приложения, отвечающий за бизнес-правила, доступ к данным и сессии.
PostgreSQL хранит данные, Alembic управляет схемой, фоновый процесс Python
обрабатывает уведомления.

## Структура проекта

```text
organization-erp/
├── backend/           # FastAPI, бизнес-логика, SQLAlchemy, Alembic, фоновые задачи Python
├── frontend/          # Next.js, интерфейс, BFF, npm, модульные и сквозные тесты
├── docs/              # Инструкции по тестированию
├── ops/               # Общая инфраструктура мониторинга
├── docker-compose.yml
├── docker-compose.dev.yml
└── .env.example       # Общие настройки Compose и команд Python
```

Для разработки Next.js на хосте: `cd frontend`, `npm ci`,
`cp .env.example .env.local`, `npm run dev`. Python запускается из `backend/`:
`uv run --env-file ../.env uvicorn app.main:create_app --factory --reload --port 8000`.
`frontend/.env.local` содержит только URL; корневой `.env` используется Compose и Python.

## Быстрый старт

Нужны Node.js 22+, Python 3.13+, `uv` и Docker Compose.

```sh
cp .env.example .env
# В .env задайте свой POSTGRES_PASSWORD и BACKEND_CSRF_SECRET.
# Секрет можно сгенерировать командой: openssl rand -hex 32
npm --prefix frontend ci
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
```

Compose запускает PostgreSQL 18.6 в новом томе `project1_postgres_data_v18`,
одноразовый сервис `migrate` с `alembic upgrade head`,
FastAPI, Next.js и фоновый процесс уведомлений на Python. Документы хранятся
в отдельном томе Docker. Интерфейс доступен на `http://localhost:3001`,
сервер API — на `http://127.0.0.1:8000`.

Мониторинг запускается отдельно:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml \
  --profile observability up --build -d
```

Для первого входа создайте администратора с хоста. Убедитесь, что
`BACKEND_DATABASE_URL` в `.env` указывает на локальную БД Compose
(`localhost:5434`), затем выполните:

```sh
cd backend
uv run --env-file ../.env python -m app.scripts.create_admin
```

Утилита Python просит логин, имя и скрытый пароль.
Пользователю потребуется сменить временный пароль после входа. Небольшой
связанный учебный набор можно добавить отдельно командой
`uv run --env-file ../.env python -m app.scripts.seed` из `backend/`;
проверка инвариантов данных — `uv run --env-file ../.env python -m app.scripts.verify_data`.

## Переменные окружения

Next.js не подключается к доменной БД. Его серверная часть получает адрес
FastAPI и передаёт сессию Python из браузера для проверки на каждом запросе.

| Переменная | Кто использует | Назначение |
| --- | --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Compose | Создание локальной БД PostgreSQL |
| `BACKEND_DATABASE_URL` | Команды Python на хосте | Адрес БД с драйвером `postgresql+asyncpg`; для локального Docker — `localhost:5434` |
| `BACKEND_BASE_URL` | Next.js | URL FastAPI; `localhost:8000` для запуска на хосте, Compose задаёт `backend:8000` |
| `BACKEND_CSRF_SECRET` | FastAPI | Подпись CSRF-токена |
| `BACKEND_PUBLIC_ORIGIN` | Next.js и FastAPI | Источник браузерных запросов (`Origin`) для проверки запросов, изменяющих данные |
| `NEXT_PUBLIC_APP_URL` | Next.js | Публичный адрес приложения, например для QR-кода |
| `DOCUMENT_STORAGE_ROOT` | FastAPI и фоновый процесс | Корень файлового хранилища документов |

Сгенерируйте секрет отдельным вызовом `openssl rand -hex 32`. Не
используйте значение из `.env.example` как ключ. В Compose сервер API и фоновый
процесс получают `BACKEND_DATABASE_URL` из `POSTGRES_*`; значение в `.env` нужно
для команд Python, запускаемых на хосте.

## Как проходит запрос

Пример — загрузка проекта на странице `/projects`:

1. Страница в `frontend/src/app/(app)/(main)/projects/page.tsx` проверяет
   пользователя и его права для отображения страницы, затем загружает данные
   через клиент серверного рендеринга (SSR), обращающийся к Python.
2. Браузерные запросы идут на тот же источник, например `/api/projects`. Файл в
   `frontend/src/app/api/projects/route.ts` — транспортный адаптер BFF: он проверяет
   сессию и CSRF, сохраняет публичный URL и пересылает запрос в FastAPI.
3. `frontend/src/lib/backend/transport.ts` пересылает cookie сессии Python и
   заголовки CSRF; `frontend/src/lib/backend/client.ts` отправляет запрос на
   фиксированный URL сервера API без кэширования. При недоступности Python
   возвращается ошибка.
4. FastAPI связывает URL с обработчиком в `backend/app/api/routes/projects.py`.
   Схема Pydantic проверяет входные данные и ответ, сервис выполняет сценарий,
   доменный слой применяет бизнес-правила через порты, репозиторий работает
   с моделями и сессией SQLAlchemy.
5. Транзакция фиксируется через единицу работы (Unit of Work). Сервер повторно
   проверяет пользователя, его права и область доступа к ресурсам. Ответ
   возвращается через BFF в браузер.

Путь по слоям исходного кода:

```text
frontend/src/app (страница или маршрут BFF)
  → frontend/src/lib/backend (транспорт с учётом сессии)
  → backend/app/api/routes + backend/app/schemas
  → backend/app/services
  → backend/app/domain
  → backend/app/repositories + backend/app/models
  → backend/app/db + PostgreSQL
```

Для нового поведения ищите бизнес-сценарий в Python `services`, правило — в
`domain`, сохранение — в `repositories`, а также соответствующую схему и маршрут API.
В `frontend/src/features` находятся интерфейс и его контракты; изменение доменных
данных выполняется на стороне Python.

## Архитектурные правила

- FastAPI — единственный сервер бизнес-логики и единственный владелец доменных записей.
- Маршруты API Next.js сохраняют публичные URL для браузера и работают как
  транспортные адаптеры. Они не пишут в БД и не обходят проверки прав и областей
  доступа в Python.
- Сессии, проверка `sessionVersion`, роли и области доступа к ресурсам принадлежат
  Python. Запросы, изменяющие данные, требуют cookie и заголовок CSRF;
  проверка `Origin` не отключается.
- `backend/app/api` зависит от схем и сервисов; сервисы координируют доменный слой
  и репозитории; доменный слой не зависит от FastAPI и SQLAlchemy.
- Alembic — единственный активный инструмент управления схемой БД (DDL). История
  старых SQL-миграций уже включена в зафиксированную исходную миграцию Alembic.
  Схема Prisma сохранена только в `frontend/e2e/prisma/` для тестовых фикстур.
- Redis и Celery не требуются для базового запуска: фоновый процесс уведомлений
  работает на Python и PostgreSQL.

## Команды Python и миграции

В активном окружении миграции выполняет сервис Compose `migrate`. Для команд
на хосте используйте серверную часть на Python и `BACKEND_DATABASE_URL`:

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

Миграции схемы находятся в `backend/migrations/versions/`. Новые изменения
создавайте через `alembic revision --autogenerate`, проверяйте SQL и применяйте
через `alembic upgrade head`. Проверка расхождений ORM: `alembic check`.

## Проверки

Клиентская часть (из `frontend/`):

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Серверная часть (из `backend/`):

```sh
uv sync --frozen
uv run ruff check .
uv run ruff format --check .
uv run mypy app
uv run pytest
```

Playwright требует отдельную временную БД и локальный секретный ключ CSRF.
Клиент Prisma из `frontend/e2e/prisma/schema.prisma` используется только
вспомогательными функциями подготовки данных для сквозных тестов; команда
`npm run test:e2e` генерирует его для теста. Сборка клиентской части и образ
для рабочего окружения от Prisma не зависят.

## Полезные документы

- [Клиентская часть: запуск и тесты](frontend/README.md)
- [Серверная часть: API и слои](backend/README.md)

Рабочие документы при запуске Python на хосте хранятся в `backend/var/documents/`.
В Docker используется отдельный том `project1_document_data`.
Тестовые файлы браузерных проверок находятся в `frontend/.test-data/e2e/`.

Подробный запуск проверок: [Тестирование](docs/testing.md).
