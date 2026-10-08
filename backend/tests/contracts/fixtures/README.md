# Обезличенные примеры контрактов этапа 00

Все JSON созданы синтетически. Здесь нет выгрузки пользователей, паролей, токенов, production ID и документов.

`preconditions` — что должен подготовить будущий contract test. Synthetic IDs не нужно отправлять в рабочую БД: сначала создать тестовые сущности и подставить реальные test IDs. `expected.json` фиксирует стабильную часть HTTP error contract; request ID проверяется по наличию, а не по конкретному значению.

Статус `source-reviewed` означает проверку источников и текущих regression tests, а не выполненный HTTP replay каждого примера. Отдельный пример `approval-query-false-coercion` фиксирует поведение Zod: строка `"false"` становится true через `z.coerce.boolean()`. Его expected — результат schema parsing, не тело HTTP ответа.

На этапе 00 standalone validator проверяет реальные Zod/HTTP error mappers, но не создаёт FastAPI, pytest scaffold или runtime. Будущие Python contract tests используют эти fixtures после настройки отдельной test DB.
