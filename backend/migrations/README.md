# Миграции базы данных

Alembic управляет схемой PostgreSQL. Команды выполняются из `backend/`:

```sh
uv run --env-file ../.env alembic current
uv run --env-file ../.env alembic upgrade head
uv run --env-file ../.env alembic check
uv run --env-file ../.env python -m app.scripts.verify_schema
```

Для изменения моделей создайте миграцию `alembic revision --autogenerate -m "описание"`,
проверьте сгенерированные операции и примените её через `alembic upgrade head`.

История в `versions/` необходима для создания и обновления базы. Идентификаторы
существующих ревизий менять нельзя. Исходная ревизия содержит полную схему;
следующие добавляют защиту журнала аудита и таблицу сессий.

`schema_catalog.json` используется сервисом запуска для проверки фактической схемы.
При добавлении миграций обновляйте этот снимок по проверенной тестовой базе.
