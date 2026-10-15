# Владение Stage 06: проекты и задачи

Срез за 15 октября 2026. Browser API сохраняет прежние URL и публичные формы; Next.js остаётся аутентифицированной BFF-границей, а Python владеет перечисленными предметными командами и чтениями. Проверки session, Origin, permission/resource scope и Zod остаются до проксирования; backend независимо проверяет actor и scope. Bridge закрыт, ответ no-store, при недоступности backend запрос не переключается на Prisma.

| Путь | Методы и владелец | Контракт/ограничения |
| --- | --- | --- |
| `/api/projects` | GET, POST → FastAPI | Список с прежними фильтрами/пагинацией; POST возвращает 201. |
| `/api/projects/{id}` | GET, PUT, DELETE → FastAPI | Сохранены public DTO и scope checks; malformed nonempty date POST/PUT сохраняет legacy 500. Duplicate code POST=409, PUT=500 — фактическая legacy асимметрия. |
| `/api/projects/{id}/members` | GET, POST → FastAPI | GET raw members и availableEmployees; POST legacy HTTP 200. Membership mutation не создаёт audit/outbox. Зарплата в ответе скрыта от PROJECT_MANAGER без `projectPayroll.read`; ADMIN видит сохранённую сумму. Ставка остаётся видимой. |
| `/api/projects/{id}/members/{memberId}` | PATCH → FastAPI | Archive участника; legacy shape и resource scope. Salary response masking как выше. |
| `/api/projects/{id}/tasks` | GET, POST → FastAPI | Сохранены hierarchy, parent, assignees, embedded checklist/dependencies; POST 201. Нет отдельных mutation endpoints для dependency, checklist или assignee. |
| `/api/tasks/{id}` | PUT, DELETE → FastAPI | PUT принимает полный update и прежний статусный `{status}` для Kanban; DELETE сохраняет FK/cascade semantics. |
| `/api/tasks/{id}/comments` | POST → FastAPI | POST 201. Валидация читает `request.clone()`, оставляя исходный body для BFF proxy. Comment DELETE route отсутствует в исходном публичном API. |
| `/api/projects/references` | GET → FastAPI | Lightweight `id/code/name` список для SSR/forms. |
| `/api/projects/{id}/workspace` | GET → FastAPI | Workspace aggregate и visibility-filtered project/activity projections. Не выполняет команды. Документы компонует отдельным разрешённым TS read call. |
| `/api/projects/{id}/activity` | GET → FastAPI | Permission-filtered audit/task/document activity. |
| `/api/projects/{id}/payroll` | GET → TypeScript до Stage 10 | В Stage 06 не менялся; расчёты/финансовые команды здесь не реализуются. |
| Documents endpoints | Reads/writes → TypeScript до Stage 08 | Страница проекта продолжает отдельный permission-checked документный read; metadata/file mutations не переносятся в Stage 06. |

SSR callers списка проектов и edit form читают FastAPI. Project workspace получает project/tasks/asset/finance aggregates из backend, а documents UI загружает отдельно с текущими правами. New/edit asset forms используют лёгкий project reference read API. Зарплатные поля UI по-прежнему показываются только существующим `canReadPayroll` permission.

Удалённые старые TS project/member/task/workspace writers больше не могут обойти FastAPI. Оставлены только UI-доменные правила критического пути (`critical-path.ts`) и отдельно принадлежащие будущим этапам TS функции. Исторический Stage 00 inventory не менялся.
