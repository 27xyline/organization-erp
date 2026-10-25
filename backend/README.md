# Бэкенд FastAPI

FastAPI управляет сессиями, авторизацией, бизнес-правилами, доступом к PostgreSQL,
документами и уведомлениями. Next.js обслуживает интерфейс и BFF с тем же источником.
Alembic — единственный действующий инструмент управления миграциями схемы.

## Локальная настройка

Корневой `.env.example` используется и Compose, и командами Python на хосте.

| Переменная | Назначение |
| --- | --- |
| `BACKEND_DATABASE_URL` | Команды Python CLI и тесты на хосте; асинхронный URL SQLAlchemy. На macOS используйте `localhost` и опубликованный порт среды разработки. |
| `BACKEND_TEST_DATABASE_URL` | Отдельная база данных для интеграционных тестов. |
| `BACKEND_CSRF_SECRET` | Ключ подписи CSRF для схемы двойной отправки токена, используемый только Python; не менее 32 байт. |
| `BACKEND_PUBLIC_ORIGIN` | Видимый браузеру источник, используемый в проверках CSRF, а не внутренний URL Compose. |
| `BACKEND_ENVIRONMENT` | Установите `production`, чтобы отключить интерактивную документацию API. |
| `DOCUMENT_STORAGE_ROOT` | Общий каталог документов для бэкенда и обработчика Python. |
| `BACKEND_OTEL_ENABLED` | Включает необязательные трассировки и метрики Python. |

Создайте локальный секрет CSRF командой `openssl rand -hex 32`; не добавляйте его в коммиты.
Сервисы Compose получают URL базы данных из `POSTGRES_*`. Для команд на хосте
`BACKEND_DATABASE_URL` использует `localhost` и порт, опубликованный в
`docker-compose.dev.yml`.

## Локальный запуск

Из корня репозитория:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
```

Задача миграции выполняет `alembic upgrade head` и проверяет схему перед запуском
сервисов приложения. Внутри Compose Next.js использует `http://backend:8000`.
Для запуска фронтенда на хосте скопируйте `frontend/.env.example` в
`frontend/.env.local` и выполните `npm ci` / `npm run dev` из `frontend/`.

API бэкенда предоставляет `/api/health/live`, `/api/health/ready` и `/openapi.json`.
Вне рабочей среды также доступны `/docs` и `/redoc`.

Для запуска API на хосте, из `backend/`:

```sh
uv sync --frozen
uv run --env-file ../.env uvicorn app.main:create_app --factory --reload --port 8000
```

## Alembic и Python CLI

Выполняйте команды из `backend/`, задав в `BACKEND_DATABASE_URL` нужную базу данных:

```sh
uv sync --frozen
uv run --env-file ../.env alembic current
uv run --env-file ../.env alembic upgrade head
uv run --env-file ../.env python -m app.scripts.verify_schema
uv run --env-file ../.env python -m app.scripts.seed
uv run --env-file ../.env python -m app.scripts.verify_data
uv run --env-file ../.env python -m app.scripts.create_admin
```

Создание схемы и обновления выполняются через Alembic; см. [миграции](migrations/README.md).

## Проверки

```sh
uv sync --frozen
uv run ruff check .
uv run ruff format --check .
uv run mypy app
uv run pytest
```

Для интеграционных тестов требуется изолированная база PostgreSQL. Не направляйте
тесты, репетиционные команды или бэкенд на хосте в рабочую базу данных.
