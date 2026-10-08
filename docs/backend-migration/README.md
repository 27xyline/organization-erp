# Этап 00: карта текущего backend

Срез 7 октября 2026. Подготовлены текущие контракты и владельцы операций для постепенного переноса на Python. Этап 01 ожидает отдельной команды пользователя.

| Документ | Что показывает |
|---|---|
| [api-contracts.md](api-contracts.md) | Все 102 route-файла / 148 HTTP методов, входные схемы, ответы, ошибки, доступ, binary/multipart |
| [schema-inventory.md](schema-inventory.md) | 51 модель, 29 enums, SQL constraints/indexes/triggers и 41 migration; live source отстаёт на три |
| [frontend-callers.md](frontend-callers.md) | Server pages/layouts, browser fetch/hooks и прямые backend/Prisma зависимости |
| [write-owners.md](write-owners.md) | API, services, CLI/seed/worker writers, транзакции, locks, audit/outbox и внешние эффекты |
| [baseline-validation.md](baseline-validation.md) | Фактические проверки, копии БД/документов, backup/restore и известные красные DB-тесты |

У первых четырёх документов есть одноимённый JSON для автоматической сверки. Это текущие TypeScript contracts/ownership; новый Python backend ещё не создан. Дополнительные новые технологии остаются самостоятельными упражнениями по [основному плану](../superpowers/plans/2026-09-28-fastapi/00-roadmap.md).

## Предлагаемый порядок разбора

1. Прочитать summary baseline и различие source/migration/test DB.
2. Проследить переименование подразделения в write-owners.
3. Найти его HTTP method в api-contracts, модель Department в schema-inventory и browser caller в frontend-callers.
4. Объяснить, какие операции должны попасть в одну Python-транзакцию и почему одной папки `services` для этого недостаточно.
5. По желанию самостоятельно проследить один другой запрос до SQL и ответа.

Этап 00 заканчивается этой учебной паузой. Статус — в [прогрессе](../superpowers/plans/2026-09-28-fastapi/08-progress.md).
