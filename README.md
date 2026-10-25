# ERP организации

Веб-приложение для учёта сотрудников, имущества, проектов, закупок, финансов и документов. Интерфейс сделан на Next.js, сервер приложения — на FastAPI, данные хранятся в PostgreSQL.

## Структура проекта

```text
organization-erp/
├── backend/                 # API, бизнес-логика и миграции базы данных
├── frontend/                # веб-интерфейс на Next.js
├── ops/observability/       # настройки мониторинга
├── docker-compose.yml       # сервисы приложения
├── docker-compose.dev.yml   # порты для локального запуска
└── .env.example             # пример настроек
```

## Запуск на своём компьютере

Понадобится Docker Desktop или Docker Engine с Docker Compose.

1. Скачайте проект и перейдите в его папку:

   ```sh
   git clone https://github.com/27xyline/organization-erp.git
   cd organization-erp
   ```

2. Создайте файл настроек и задайте секрет для CSRF:

   ```sh
   cp .env.example .env
   openssl rand -hex 32
   ```

   Скопируйте полученное значение в `BACKEND_CSRF_SECRET` в файле `.env`.

3. Соберите и запустите приложение:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
   ```

   После запуска откройте [http://localhost:3001](http://localhost:3001). API доступен на [http://localhost:8000](http://localhost:8000).

4. Создайте учётную запись администратора:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python -m app.scripts.create_admin
   ```

   Команда попросит указать логин, имя и пароль.

Чтобы остановить приложение, выполните:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

## Подробные инструкции

- [Frontend: локальный запуск и проверки](frontend/README.md)
- [Backend: зависимости, API, миграции и тесты](backend/README.md)
