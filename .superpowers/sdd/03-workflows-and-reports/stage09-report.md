# Отчёт Stage 09 — согласования и notification APIs

## Итог

Stage 09 реализован в ветке `fastapi-runtime-foundation`, базовый commit `6e0f8d25c4c961c265e07978140de1424cf602e1`. Python/FastAPI владеет approval workflows, notification API/preferences и SMTP settings/test; Next API routes остаются BFF, а approval detail и notifications SSR загружают данные через backend bridge. Prisma schema/DDL, `/api/notifications/smtp/process` и `/api/notifications/generate-alerts` остаются TS-owned до Stage 13. `next-env.d.ts` не редактировался агентом и не включается в commits.

## Изменённые пути

- Backend domain/services/API: `backend/app/api/router.py`; `backend/app/db/uow.py`; `backend/app/domain/approvals/rules.py`; `backend/app/domain/ports/approvals.py`; `backend/app/domain/ports/notifications.py`; `backend/app/domain/ports/uow.py`; `backend/app/integrations/smtp.py`; `backend/app/repositories/approvals.py`; `backend/app/repositories/notifications.py`; `backend/app/schemas/approvals.py`; `backend/app/schemas/notifications.py`; `backend/app/services/approvals.py`; `backend/app/services/dto/approvals.py`; `backend/app/services/dto/notifications.py`; `backend/app/services/notifications.py`; `backend/app/services/smtp_settings.py`; `backend/app/api/routes/approvals.py`; `backend/app/api/routes/notifications.py`; `backend/app/api/routes/smtp_settings.py`.
- Python tests/config: `backend/tests/conftest.py`; `backend/tests/unit/approvals/test_router.py`; `backend/tests/contracts/approvals/test_schemas.py`; `backend/tests/contracts/notifications/test_schemas.py`; `backend/tests/integration/approvals/conftest.py`; `backend/tests/integration/approvals/test_workflows.py`; `backend/tests/integration/notifications/conftest.py`; `backend/tests/integration/notifications/test_notifications.py`.
- Next BFF and SSR: `src/lib/backend/stage09.ts`; `src/app/api/approvals/route.ts`; `src/app/api/approvals/[id]/route.ts`; `src/app/api/approvals/[id]/decision/route.ts`; `src/app/api/approvals/[id]/cancel/route.ts`; `src/app/api/approvals/options/route.ts`; `src/app/api/approvals/templates/route.ts`; `src/app/api/approvals/templates/route.test.ts`; `src/app/api/approvals/templates/[id]/route.ts`; `src/app/api/approvals/templates/[id]/route.test.ts`; `src/app/api/notifications/route.ts`; `src/app/api/notifications/route.test.ts`; `src/app/api/notifications/[id]/route.ts`; `src/app/api/notifications/read-all/route.ts`; `src/app/api/notifications/unread-count/route.ts`; `src/app/api/notifications/preferences/route.ts`; `src/app/api/notifications/smtp/route.ts`; `src/app/api/notifications/smtp/test/route.ts`; `src/app/(app)/(main)/approvals/[id]/page.tsx`; `src/app/(app)/(main)/notifications/page.tsx`.
- E2E/config/ownership: `playwright.config.ts`; `e2e/stage09-approvals-notifications.spec.ts`; `docs/backend-migration/stage09-ownership.md`; `docs/superpowers/plans/2026-09-28-fastapi/07-coverage.md`; `docs/superpowers/plans/2026-09-28-fastapi/08-progress.md`.

## Транзакции и совместимость

- `create_approval_in_uow(command, context, uow)` принимает caller-owned UoW, проверяет наличие связанных сущностей и активных согласующих. Неизвестный тип/идентификатор entity отклоняется до создания dangling link. Создание согласования, Document `IN_REVIEW`/`lockVersion`, audit и notification intent входят в один commit/rollback.
- Решение и отмена блокируют approval row через PostgreSQL `FOR UPDATE`, обновляют статус/шаги/Document status и версии, добавляют audit и enqueue notification intent в том же UoW. Параллельный тест подтверждает, что конкурентные попытки не продвигают один шаг дважды. Сохранён legacy error contract: неверный активный шаг/согласующий может вернуть `FORBIDDEN`; коды отсутствующей/изменённой заявки переводятся в `APPROVAL_NOT_FOUND` и `INVALID_APPROVAL_STATE`. Cancel API, как и TS источник, возвращает pre-cancel snapshot, хотя сохранённое состояние уже `CANCELLED`.
- Notification inbox сортируется по `createdAt DESC, id DESC`, ограничен текущим пользователем и `IN_APP`; read/delete чужого уведомления возвращает 404. Уникальный `(userId,eventType,channel)` preference upsert выдерживает конкуренцию; notification dedupe остаётся `(userId,dedupeKey,channel)`.
- SMTP singleton остаётся совместимым с текущими текстовыми значениями. Пароль сохраняется строкой, публичный ответ всегда содержит `password: ""`; пустое значение при update не затирает ранее сохранённый пароль. Test probe поднимает сеть через `asyncio.to_thread` после закрытия read session. `/smtp/process` и `/generate-alerts` не переводились.

## TDD и verification

- RED: перед регистрацией approval router выполнено `UV_CACHE_DIR=/private/tmp/organization-erp-stage09-uv-cache uv run pytest tests/unit/approvals/test_router.py -q`; результат `1 failed` — ожидаемый FastAPI path отсутствовал.
- GREEN: после регистрации route и реализации backend проверки того же теста — `1 passed`. Первый focused schema/router набор — `6 passed`.
- Финальная brief-команда (после targeted corrections): `set -a; source ../.runtime/stage09/test.env; set +a; UV_CACHE_DIR=/private/tmp/organization-erp-stage09-uv-cache uv run pytest tests/unit/approvals tests/integration/approvals tests/contracts/approvals tests/integration/notifications -q` из `backend/` — `13 passed in 1.04s`.
- Точечная PostgreSQL rerun после исправлений: `uv run pytest tests/integration/approvals tests/integration/notifications -q` — `9 passed`. Там же проверена approval race с двумя конкурентными решениями.
- Playwright: `npm run test:e2e -- e2e/stage09-approvals-notifications.spec.ts` под `.runtime/stage09/e2e.env` — `1 passed (13.9s)`. Проверяет Python BFF создание двухшагового согласования, уведомления первого и следующего согласующего, approve/reject и cancel. Первый запуск обнаружил, что выбранный `AUDITOR` по legacy RBAC не имеет `approvals.decide`; сценарий приведён к двум активным согласующим с правом решения и повторно прошёл.
- `npm run typecheck` — exit 0. Changed-file ESLint — exit 0, без warnings после очистки unused import. BFF Vitest route tests — `3 files passed, 6 tests passed`.
- Ruff format check — 23 файла уже отформатированы; Stage09 `ruff check` — `All checks passed!`. Targeted mypy — `Success: no issues found in 8 source files`. `git diff --check` — exit 0.
- SMTP сеть не вызывалась в тестах: проверка connection adapter подменена, проверены redaction и сохранение legacy password. Реальная SMTP доступность и отправка письма не тестировались.

## Изолированные базы и cleanup

- Тестовая БД: `erp_stage09_test`; Playwright БД: `erp_stage09_e2e`. Обе являются копиями `erp_migration_20261007`, использованной только как read-only template. `.runtime/stage09/test.env` и `.runtime/stage09/e2e.env` — локальные ignored env files; credentials в Git и отчёт не копировались. Schema-only migrations не запускались.
- Перед и после финального Python suite проверена только `erp_stage09_test`. После завершения `s09-%` count равен нулю в users, documents, document_versions, approvals, templates, notifications, outbox, preferences и audit.
- После Playwright точечно удалены созданные E2E approvals и связанные audit/notification/outbox записи; read-only проверка в `erp_stage09_e2e` показала `workflowRequests=0`, `stage09Notifications=0`. E2E global setup seed users остаются базовыми fixture rows тестовой копии.
- Ни `project1`, ни `erp_stage08_e2e`, ни исходная `erp_migration_20261007` не использовались как write target. Ветки не создавались. Next-generated `AGENTS.md`/`CLAUDE.md` удалены после завершения Playwright. `next-env.d.ts` оставлен вне staging.

## Commits и caveats

Коммит реализации: `136248aed0487e832aa36e805d6a23d5e0f42051` — `Перенести Stage 09 согласования и уведомления на FastAPI`. Отчёт будет записан отдельным русским docs commit. Push не выполнялся. Stage 10 и Stage 13 не запускались. Единственный внешний verification caveat — SMTP сервер/credentials не проверялись реальным сетевым подключением; обработка test connection выполняется вне DB transaction и покрыта без реального email.
