# Backend

Python-сервис ERP на FastAPI. Он владеет API, сессиями, авторизацией, бизнес-правилами и доступом к PostgreSQL. Next.js отвечает за интерфейс и передаёт запросы браузера в API.

## Стек

- Python 3.13 (проект поддерживает Python `>=3.13,<3.15`).
- FastAPI и Uvicorn.
- SQLAlchemy 2 с async-драйвером `asyncpg`.
- Alembic для миграций PostgreSQL.
- Pydantic 2 и `pydantic-settings` для схем и настроек.
- PostgreSQL 18.6 в Docker Compose.
- `uv` и `uv.lock` для управления Python и зависимостями.
- Асинхронный код на `async`/`await`.

## Структура проекта

```text
backend/
├── app/
│   ├── api/
│   │   └── routes/      # маршруты FastAPI
│   ├── core/            # настройки, логирование, безопасность, метрики
│   ├── db/              # SQLAlchemy, сессии и Unit of Work
│   ├── domain/          # доменные правила и порты
│   ├── integrations/    # почта, документы и внешние адаптеры
│   ├── models/          # ORM-модели
│   ├── repositories/    # чтение и запись данных
│   ├── schemas/         # Pydantic-схемы API
│   ├── scripts/         # команды администрирования и проверки данных
│   ├── services/        # прикладные сценарии
│   └── tasks/           # фоновые задачи
├── migrations/
│   ├── env.py
│   └── versions/        # версии миграций Alembic
├── tests/
│   ├── architecture/
│   ├── contracts/
│   ├── integration/
│   └── unit/
├── .python-version
├── alembic.ini
├── Dockerfile
├── pyproject.toml
├── uv.lock
└── README.md
```

Настройки для локального запуска находятся в [корневом `.env.example`](../.env.example).

## Реализованные модули

- Аутентификация, сессии, пользователи и профиль текущего пользователя.
- Подразделения, сотрудники, штатное расписание и отпуска.
- Каталоги, имущество, инвентаризация, импорт и экспорт.
- Проекты и задачи.
- Заявки и согласования, закупки и договоры.
- Финансы, зарплаты и кадровые действия.
- Документы, отчёты и поиск.
- Уведомления и настройки SMTP.

## Зависимости

Нужны `uv` и Python 3.13. Команды выполняются из `backend/`:

```sh
uv python install 3.13
uv sync --frozen
```

`uv sync --frozen` создаёт виртуальное окружение и устанавливает зависимости приложения и группы разработки из `uv.lock`, не обновляя lock-файл.

## Локальный запуск в Docker Compose

Из корня репозитория подготовьте настройки и задайте свой CSRF-секрет:

```sh
cp .env.example .env
openssl rand -hex 32
```

Вставьте полученное значение в `BACKEND_CSRF_SECRET` в `.env`. Затем запустите приложение:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
```

Compose запускает:

- `postgres` — PostgreSQL 18.6;
- `migrate` — выполняет `alembic upgrade head` и проверяет схему;
- `backend` — FastAPI;
- `worker` — обработчик фоновых уведомлений;
- `app` — интерфейс Next.js.

Веб-интерфейс доступен на [http://localhost:3001](http://localhost:3001), API — на [http://localhost:8000](http://localhost:8000). Документация API в режиме разработки: [http://localhost:8000/docs](http://localhost:8000/docs). В рабочем режиме `/docs` и `/redoc` отключены.

Первого администратора создайте вручную: готовых учётных данных и страницы SQLAdmin в проекте нет.

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python -m app.scripts.create_admin
```

Команда запросит постоянный пароль администратора. Логин и имя будут `admin`, учётная запись получит роль администратора, а менять пароль после первого входа не потребуется. Пароль должен быть непустым и не длиннее 512 символов.

Для ручного просмотра разделов можно добавить демо-данные прямо в основную локальную базу `organization_erp_dev`. Сначала запустите PostgreSQL и приложение, затем выполните из `backend/`:

```sh
uv run --env-file ../.env python -m app.scripts.seed --allow-local-demo-db
```

Команда добавляет подразделения, сотрудников, проекты с задачами, имущество с ответственными и три документа с файлами. Она использует существующую активную учётную запись как автора документов; аккаунты не создаются. Если такой учётной записи нет, команда завершится до добавления записей. Повторный запуск не дублирует демо-набор. Команда не удаляет данные. Файлы записываются в `DOCUMENT_STORAGE_ROOT`; если Compose backend запущен, команда проверяет и синхронизирует эти три файла в его хранилище. Без Compose backend файлы остаются по пути из настроек локального backend. Флаг работает только для локальной базы `organization_erp_dev` в окружении `development`; production, тестовые и удалённые базы отклоняются.

Полезные команды из корня репозитория:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

## Запуск API локально

В этом режиме PostgreSQL работает в Compose, а FastAPI — в локальном Python-окружении. После создания `.env` запустите базу из корня репозитория:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
```

Затем из `backend/` примените миграции и запустите сервер:

```sh
uv run --env-file ../.env alembic upgrade head
uv run --env-file ../.env uvicorn app.main:create_app --factory --reload --port 8000
```

Uvicorn перезапускает API при изменении Python-файлов. Администратора в этом режиме создайте отдельной командой из `backend/`:

```sh
uv run --env-file ../.env python -m app.scripts.create_admin
```

## Миграции

Alembic настроен в `alembic.ini`; окружение и модели подключаются в `migrations/env.py`, версии хранятся в `migrations/versions/`. При полном запуске Compose миграции выполняет сервис `migrate`.

Ручные команды запускайте из `backend/`:

```sh
uv run --env-file ../.env alembic current
uv run --env-file ../.env alembic upgrade head
uv run --env-file ../.env alembic check
uv run --env-file ../.env python -m app.scripts.verify_schema
```

После изменения ORM-моделей создайте миграцию, проверьте её содержимое и примените:

```sh
uv run --env-file ../.env alembic revision --autogenerate -m "описание изменения"
uv run --env-file ../.env alembic upgrade head
```

Подробности про версии и `schema_catalog.json` — в [README миграций](migrations/README.md).

## Тесты и проверки

Unit-тесты можно запускать отдельно:

```sh
uv run pytest tests/unit
```

Полный `pytest` требует отдельную PostgreSQL-базу `organization_erp_test`. Запустите Compose PostgreSQL, затем из корня репозитория создайте базу один раз:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" organization_erp_test'
```

Из `backend/` укажите URL `organization_erp_test`, примените миграции к этой базе и запустите тесты. Если вы изменили параметры подключения в `.env`, подставьте их в URL:

```sh
export BACKEND_TEST_DATABASE_URL="postgresql+asyncpg://organization_erp_app:change-this-local-password@localhost:5434/organization_erp_test"
export BACKEND_DATABASE_URL="$BACKEND_TEST_DATABASE_URL"
uv run alembic upgrade head
uv run pytest
```

Интеграционные тесты очищают данные в `organization_erp_test` перед каждым тестом. Проверка запрещает направлять тесты на другую базу.

Статические проверки из `backend/`:

```sh
uv run ruff check .
uv run ruff format --check .
uv run mypy app
```

Pre-commit в репозитории не настроен; CI запускает эти проверки напрямую.

## Основные переменные окружения

| Переменная | Назначение |
| --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Учётные данные и имя базы в Docker Compose. |
| `BACKEND_DATABASE_URL` | Подключение локального Python API и CLI к PostgreSQL; в `.env.example` используется `localhost:5434`. В контейнере Compose формирует URL из `POSTGRES_*`. |
| `BACKEND_TEST_DATABASE_URL` | Подключение тестов; путь должен оканчиваться на `/organization_erp_test`. Задаётся в окружении при запуске тестов. |
| `BACKEND_CSRF_SECRET` | Секрет подписи CSRF-токенов; для локальной разработки задайте случайное значение длиной не менее 32 байт. |
| `BACKEND_PUBLIC_ORIGIN` | Публичный Origin веб-приложения для проверки CSRF. |
| `BACKEND_ENVIRONMENT` | Окружение приложения: `development`, `test` или `production`. |
| `DOCUMENT_STORAGE_ROOT` | Каталог файлов документов. |
| `DOCUMENT_MAX_FILE_SIZE_BYTES` | Максимальный размер загружаемого документа. |
