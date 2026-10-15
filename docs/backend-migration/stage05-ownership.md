# Этап 05: кадровые процессы

Функциональная реализация и проверки Stage 05 завершены 13 октября 2026 года; финальные Docker build/readiness gate и два scoped commit завершены 15 октября. Этап переносит кадровые API и два серверных вызова страниц сотрудников на FastAPI и ожидает пользовательского разбора. Таблицы и Prisma DDL остаются прежними; финансовый расчёт, проекты, отчёты, worker и смена владельца миграций остаются в своих последующих этапах.

## Владельцы API и SSR

Next.js остаётся внешней границей браузерного API: сохраняет URL и HTTP-методы, сессию, Origin, Zod-проверки и permission/scope prechecks, затем передаёт запрос через защищённый Stage 03 bridge. FastAPI повторно проверяет пользователя, permission и scope. При недоступности backend ответ ошибки возвращается вызывающему; Prisma fallback отсутствует. SSR страниц сотрудников вызывает защищённый `backendUserFetch` с `private, no-store` и типизированным `{data}` envelope. SSR не импортирует Prisma или TS HR services.

| Контракт | Внешний browser API | Внутренний FastAPI API | SSR/caller |
| --- | --- | --- | --- |
| Сотрудники: список и создание | `/api/employees`: GET, POST | `/api/employees`: GET, POST | Страница списка получает сводку через dashboard API ниже; browser CRUD — `use-employees-page.ts` и archive page. |
| Сотрудник: изменение и архивное удаление | `/api/employees/{id}`: PUT, DELETE | `/api/employees/{id}`: PUT, DELETE | `use-employees-page.ts`, archive page; сохранены Zod/query contracts и статус ответов. |
| Профиль: изменение | `/api/employees/{id}/profile`: PUT | `/api/employees/{id}/profile`: PUT | Browser caller редактирует профиль; чтение профиля SSR выполняется напрямую через внутренний GET ниже. |
| Кадровая сводка | — | `/api/employees/dashboard?year=YYYY`: GET | `/employees` читает dashboard с текущим годом; ответ нормализуется для существующей UI-модели. |
| Профиль: чтение | — | `/api/employees/{id}/profile`: GET | `/employees/{id}` читает профиль; отсутствующая/недоступная запись ведёт к `notFound()`. |
| Справочник сотрудников | — | `/api/employees/references`: GET | API для совместимых employee references. Вариант `?projectId=...` поддерживает project permission/projection; Stage 06 project routes пока остаются TS и здесь не считаются перенесёнными. |
| Кадровые действия и синхронизация | `/api/personnel-actions`: GET, POST; `/api/personnel-actions/{id}`: DELETE; `/api/personnel-actions/sync`: POST | Те же пути и методы | `use-employees-page.ts` и archive page: hire, extend, transfer, dismiss, delete, expired-contract sync. |
| Отпуска и больничные | `/api/vacations`: GET, POST; `/api/vacations/{id}`: PUT, DELETE | Те же пути и методы | HR UI передаёт год календаря и выполняет CRUD. Существующие правила пересечений, дат и доступа сохранены. |
| Штатное расписание | `/api/staff-schedule`: GET, POST; `/api/staff-schedule/{id}`: PUT, DELETE | Те же пути и методы | HR UI выполняет list/CRUD позиций и использует существующий salary projection. |

Остальные потребители кадровых данных остаются у своих владельцев: отчётные exports и финансовые вычисления не переключались, проектные route handlers/страницы не переподключались, departments API не расширялся сверх Stage 04. Demo seed остаётся отдельным gated bootstrap writer; обычные HR записи проходят только через Python.

## Права и совместимость

Legacy visibility полей профиля и сводки сохранена в пределах прежних employee/staff permission и department scope. Суммы зарплаты не скрыты новым finance permission: исходный HR контракт отдавал эти поля и сотрудникам с `employees.read`, и для HR-scoped чтения. Это осознанно сохраняет поведение; изменение модели видимости требует отдельного решения и тестов.

Обычные HR mutations ограничивают записи actor scope и сохраняют существующие статусы ошибок, nullable/date преобразования, relation shape, фильтры и пагинацию. Синхронизация истёкших договоров теперь проверяет `personnelActions.sync` scope и под общей транзакционной блокировкой `904202607`, с повторной блокировкой пользователя через `FOR UPDATE`, создаёт не более одного ARCHIVE на сотрудника/дату договора. Старый sync handler не применял этот access filter; ограничение scoped HR на назначенные подразделения — намеренное исправление утечки, администраторский ALL scope сохраняет golden parity. HR baseline пишет audit только там, где это было предусмотрено, и не создаёт notification intent/outbox entries.

Отпуска сохраняют пересечения и допускают равные границы дат; выбор календарного года основан на включительном пересечении. Nullable и date inputs повторяют прежнее преобразование, включая nullable/нулевую дату подписания при update и SQL NULL для пустых/пробельных issuer/number сертификата. Project-aware employee references оставлены совместимой read-функцией для Stage 06: требуется `projectMembers.create`, бывшие участники исключаются, salary projection доступна только при `projectPayroll.read`; project mutations остаются в Stage 06.

Увольнение сохраняет сотрудника и его исторические действия, меняя статус и очищая ссылку руководителя подразделения в той же UoW. Старые TypeScript HR services/repositories и их вызываемые mutators удалены, включая старую очистку department head; поиск production imports этих HR writers завершён без оставшихся ссылок. Stage 04 ownership snapshot остаётся историческим и не переписывается. Payroll-period lock не добавлен: фактические Stage 05 HR routes не записывают payroll periods и не вызывали условный helper. Payroll и финансовые расчёты остаются в Stage 10.

Prisma продолжает владеть DDL и миграциями. Stage 05 не запускал Prisma migrations, Alembic revision/upgrade, worker или внешнюю отправку уведомлений. CI создаёт отдельную schema-only базу `erp_stage05_test` и задаёт `STAGE05_TEST_DATABASE_URL`, сохраняя настройки Stage 02/03.
