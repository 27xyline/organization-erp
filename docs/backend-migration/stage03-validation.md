# Stage 03: проверка перехода auth/RBAC на FastAPI

Дата: 10 октября 2026. Scope: credentials, actor authorization для перенесённых API, user/password mutations, transition BFF, совместимые audit/notification-intent producers. Другие бизнес-модули и Alembic/DDL cutover не выполнялись.

## Результат и владельцы

Реализация соответствует [плану этапа 03](../superpowers/plans/2026-09-28-fastapi/01-foundation.md#этап-03-auth-rbac-и-переходный-frontend-bridge). Точная граница владельцев описана в [stage03-ownership.md](stage03-ownership.md). Python теперь владеет credential verification, users/roles/scopes/password writes и связанными audit/outbox intents; NextAuth продолжает владеть browser JWE/session lifecycle. Next.js `requireUser()` по-прежнему читает actor/scope данные из Prisma для неперенесённых модулей и сверяет active/version claims. Он не вызывает Python actor endpoint. Python самостоятельно re-checks actor, permissions и scopes на bridged user/password API.

Публичные браузерные пути остаются Next.js BFF: `GET/POST /api/users`, `PATCH /api/users/{id}` и `POST /api/account/password`. Для SSR формы добавлен `GET /api/users/references`. BFF оставляет URL query, method, body, response status, request ID и `traceparent`, стримит тело, фильтрует заголовки, ставит `private, no-store` и не пересылает browser cookie/authorization. Backend URL фиксируется серверной настройкой. Python bridge JWT подписывается HS256 отдельным ключом, содержит issuer `erp-next`, audience `erp-python`, `sessionVersion` и TTL 60 секунд. Internal credentials endpoint принимает отдельный bearer secret.

Перенос user writes инвалидирует JWE через `sessionVersion` после изменения ролей/scopes, employee link или активного статуса. Это осознанное укрепление отзыва сессий. Ошибки/timeout backend и отсутствующие auth secrets завершаются отказом; fallback на Prisma login/user writers отсутствует. Исходная NextAuth browser lifecycle и read-only legacy permission/session guard сохранены.

## Проверки

| Проверка | Результат |
| --- | --- |
| Python `uv run pytest` на PostgreSQL `erp_stage03_test` | 71 passed. Cleanup proof зафиксировал ноль строк в `users`, `audit_logs`, `notifications`, `notification_outbox`, `departments`, `employees` и `projects`. |
| Python Ruff check/format и mypy | Все прошли. Логи лежат в ignored `.runtime/stage03/python-*-final.log`. |
| Полный Vitest | 313 passed, 5 skipped; 95 test files passed, 2 skipped. |
| TS BFF/auth focused Vitest | 10 passed: provider delegation, session claims, bridge signing/secrets, forwarding, timeout mapping and no-retry behavior. |
| TypeScript typecheck и ESLint изменённых TS/тестов | Прошли. Полный `npm run lint` отдельно не запускался. |
| Production build с Webpack | `npm run build -- --webpack` прошёл, включая TypeScript и вывод маршрута `/api/users/references`. |
| Host Turbopack build | В sandbox завершался `EPERM` на PostCSS subprocess/bind; это ограничение процесса сборки на хосте. |
| Полный Playwright E2E на общей `erp_stage03_e2e` базе | 6/6 passed: старые 5 сценариев и forced-password flow с ограничением API, сменой пароля, отклонением stale JWE, отказом старого пароля и успешным новым входом. Повторён после последней BFF правки. |
| Docker Compose images и runtime | `organization-erp-backend` и `organization-erp-app` пересобраны из финального кода. Builder прошёл locked Python install, Next Turbopack build, TypeScript и worker bundle. Оба контейнера дали `/api/health/ready` HTTP 200 на общей тестовой БД; после проверки app/backend остановлены. |

Независимый review не нашёл actionable security/spec дефектов. CI workflow обновлён, но удалённый GitHub Actions прогон не запускался. При image build npm сообщил 26 уязвимостей полного dependency tree (1 low, 5 moderate, 19 high, 1 critical) и 7 production dependencies (2 moderate, 4 high, 1 critical). Это известный dependency baseline; обновление зависимостей не входит в этап 03.

## Базы и исходное состояние

Операционные auth-тесты использовали только `erp_stage03_test` и `erp_stage03_e2e`. Обе БД созданы schema-only копированием 52-табличной Prisma migration copy `erp_migration_20261007`; на старте в них было 0 users и employees. `erp_stage03_e2e` наполнялся синтетическими E2E fixtures. Исходная `project1` и migration copy не использовались как runtime targets. Команды Stage 03 не запускали DDL migration/Alembic и не меняли исходную схему.

Последняя документированная Stage 02 baseline указывала для исходной `project1` 38 migration records и 50 таблиц, для migration copy — 41 record и 52 таблицы. Stage 03 повторно не снимал полный исходный fingerprint; этот отчёт не утверждает послетестовую независимую сверку всех исходных строк. Python integration test после cleanup оставил семь проверенных таблиц `erp_stage03_test` пустыми. Аутентификационные fixtures не посылали реальные внешние сообщения.

Все generated check logs и private env-файлы находятся в игнорируемом `.runtime/stage03/`; никаких секретов или DB URLs с паролями нет в Git. `next-env.d.ts` сохранён с исходным пользовательским SHA-256 `d55d89a99f49bee7df149125eb311367460827b1d986ae98ca312c9e10caa478`; `tsconfig.json` не менялся. Локальные `AGENTS.md`/`CLAUDE.md` и Next build caches не входят в Stage 03 commit.

## Повторный локальный запуск

Подготовьте schema-only базы `erp_stage03_test` и `erp_stage03_e2e` из миграционной копии; не используйте `project1` как target. В приватных ignored файлах `.runtime/stage03/test.env` и `.runtime/stage03/e2e.env` задайте DSN на эти две БД, минимум 32 случайных байта для каждого из двух разных backend secrets, а в E2E env — отдельный `NEXTAUTH_SECRET`. Не печатайте ключи или DSN в терминал и выставьте `chmod 600`.

Точные параметры подключения:

- `test.env`: `STAGE03_TEST_DATABASE_URL`, `BACKEND_TEST_DATABASE_URL`, `BACKEND_DATABASE_URL` направлены в `erp_stage03_test`.
- `e2e.env`: `DATABASE_URL` равно `STAGE03_TEST_DATABASE_URL` и направлено в `erp_stage03_e2e`; `BACKEND_DATABASE_URL` направлено туда же с драйвером `postgresql+asyncpg`.
- Для Playwright задайте `NEXTAUTH_URL` и `PLAYWRIGHT_BASE_URL` как `http://localhost:3001`, `PLAYWRIGHT_BACKEND_URL` как `http://127.0.0.1:8000`. Этот host выбран потому, что Next dev request URL нормализует Origin к `localhost`; same-origin guard не ослаблялся.

Команды из корня репозитория:

```sh
(cd backend && uv run --env-file ../.runtime/stage03/test.env pytest)

node --env-file=.runtime/stage03/e2e.env node_modules/@playwright/test/cli.js test
```

Playwright поднимает оба процесса и до старта проверяет одинаковую E2E DB и разные достаточной длины bridge keys. После проверки локальные Next/Python процессы и PostgreSQL можно остановить; Compose volumes и тестовые БД не удаляются.

## Статус

Этап 03 реализован и проверен 10 октября 2026; ожидает разбора пользователя. Stage 04 не начат. Продолжение после учебной паузы требует отдельной явной команды пользователя.
