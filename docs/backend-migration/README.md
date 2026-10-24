# Этап 00: карта текущего backend

> Это исторический срез Stage 00 от 7 октября 2026 года. Этапы 01–09 выполнены позднее; актуальный общий статус и проверки см. в [08-progress.md](../superpowers/plans/2026-09-28-fastapi/08-progress.md).

Срез 7 октября 2026. Подготовлены текущие контракты и владельцы операций для постепенного переноса на Python. Этап 01 ожидает отдельной команды пользователя.

| Документ | Что показывает |
|---|---|
| [api-contracts.md](api-contracts.md) | Все 102 route-файла / 148 HTTP методов, входные схемы, ответы, ошибки, доступ, binary/multipart |
| [schema-inventory.md](schema-inventory.md) | 51 модель, 29 enums, SQL constraints/indexes/triggers и 41 migration; live source отстаёт на три |
| [frontend-callers.md](frontend-callers.md) | Server pages/layouts, browser fetch/hooks и прямые backend/Prisma зависимости |
| [write-owners.md](write-owners.md) | API, services, CLI/seed/worker writers, транзакции, locks, audit/outbox и внешние эффекты |
| [baseline-validation.md](baseline-validation.md) | Фактические проверки, копии БД/документов, backup/restore и известные красные DB-тесты |
| [stage12-ownership.md](stage12-ownership.md) | Runtime API owner для отчётов, dashboard, my-actions, поиска, exports и CLI |
| [stage12-validation.md](stage12-validation.md) | Stage 12 проверки, DB gates и baseline измерений |

У первых четырёх документов есть одноимённый JSON для автоматической сверки. На дату исходного среза это были текущие TypeScript contracts/ownership, а новый Python backend ещё не был создан. Дополнительные новые технологии остаются самостоятельными упражнениями по [основному плану](../superpowers/plans/2026-09-28-fastapi/00-roadmap.md).

## Этап 02: модель данных и граница транзакции

Результаты этапа и ограничения проверок описаны в [stage02-validation.md](stage02-validation.md). Для разбора полезно удерживать три разных понятия:

- **ORM** описывает строки, типы колонок и связи PostgreSQL; он не заменяет доменные правила или права доступа.
- **Domain port** задаёт нужную прикладной операции возможность простым Python-протоколом и DTO, не привязываясь к SQLAlchemy.
- **Unit of Work** держит одну сессию и транзакцию для целой операции. Репозитории/адаптеры добавляют изменения в эту транзакцию, а прикладной сценарий принимает одно явное решение `commit`. При ошибке или выходе без commit изменения откатываются.

Вложенный шаг должен получить тот же UoW. Если каждый шаг создаст свою сессию и зафиксирует её независимо, первая запись может сохраниться, а следующая — упасть. Для конкурентных запросов, наоборот, нужны отдельные UoW и `AsyncSession`: одну сессию нельзя одновременно делить между задачами.

## Предлагаемый порядок разбора

1. Прочитать summary baseline и различие source/migration/test DB.
2. Проследить переименование подразделения в write-owners.
3. Найти его HTTP method в api-contracts, модель Department в schema-inventory и browser caller в frontend-callers.
4. Объяснить, какие операции должны попасть в одну Python-транзакцию и почему одной папки `services` для этого недостаточно.
5. По желанию самостоятельно проследить один другой запрос до SQL и ответа.

Для этапа 02 можно дополнительно проследить путь audit-записи и notification outbox: `AuditRecord`/`NotificationIntent` → typed port → SQLAlchemy adapter → общая транзакция UoW → explicit commit или rollback. Сохранение outbox-строки само по себе не означает, что уведомление уже отправлено.

Этап 00 заканчивается этой учебной паузой. Статус — в [прогрессе](../superpowers/plans/2026-09-28-fastapi/08-progress.md).
