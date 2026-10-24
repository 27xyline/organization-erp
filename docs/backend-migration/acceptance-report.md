# Stage 14C: отчёт acceptance

Статус: **runtime rehearsal пройдена; полный acceptance пока не закрыт**. Все runtime-проверки сделаны в отдельном disposable Compose project. Полный backend pytest оставляет один архитектурный failure, а переключение маршрутизации обратно на TypeScript в rehearsal не выполнялось. Production не переключался.

## Окружение и сохранность данных

| Пункт | Результат |
|---|---|
| Compose project | `org-erp-stage14c-rehearsal-20261024`; рабочие `project1` и другие Compose проекты не затрагивались |
| База сценариев | `erp_stage14c_e2e`; app/backend/worker подключены к ней |
| PostgreSQL | `postgres:18.6-alpine`; Alembic revision `20261024_user_sessions`; 41 завершённая Prisma migration сохранена |
| Источник документов | До E2E: 66 файлов / 15 980 байт; список source-файлов совпал с disposable volume по ключу, размеру и SHA-256 |
| Документы после полного E2E | 74 файла / 16 344 байта; manifest SHA-256 `0984565c76912b3f675ef053ff8f631ab74de7bb310ebb5556c0cd750c0be93f` совпал до и после рестарта |
| Counts до/после рестарта | 54 таблицы; fingerprints `9b070cd0c932e684a7865e230cd51a439cc1dd122b1c00d904bc3d7dce0b8d55` и `8f3d4aa021a8126834c81e8341989a18c40f85bf3c7273bd7df501dd326d5290` |
| Ожидаемая разница counts | `user_sessions` +1 из-за verify-only login; `audit_logs` +1 из-за контрольного скачивания документа; прочие строки совпали |

Counts TSV и fingerprints сохранены в `/private/tmp/organization-erp-stage14c-20261024/`. Source dump от 7 октября не используется для утверждения parity с более поздним Stage12 состоянием: наборы данных и counts различаются.

## Runtime и Compose-проверки

| Gate | Результат |
|---|---|
| Maintenance fence | Readiness GET возвращал 200; unsafe POST при включённом fence возвращал 503 `MAINTENANCE` |
| Drain и миграция | Перед миграцией активных DB sessions и outbox claims не было; выполнен один `migrate`, catalog verifier сообщил `Schema catalog matches the configured expected catalog.` |
| Cross-module Playwright | `8 passed, 1 skipped`: Stage06, 07, 08, 09, 10, 12, 14B и полный Stage14C procurement → delivery → asset/document сценарий; skipped test предназначен для запуска после рестарта |
| Persistence после рестарта | App/backend/worker перезапущены; отдельный `STAGE14C_VERIFY_ONLY=1` сценарий прошёл: `1 passed` |
| Data invariants | `verify_data`: все 12 проверок равны нулю, включая orphan/negative holdings, audit secrets, department cycles, текущие версии документов и missing/corrupt files |
| Audit и outbox | После проверки: 178 audit rows; `notification_outbox` — 0 строк, claims — 0 |
| Readiness и health | App, backend, worker и PostgreSQL healthy; все три приложения использовали `erp_stage14c_e2e` |
| Metrics | Prometheus target `otel-collector` имеет `health=up`, query `up` вернула `1`; Grafana `/api/health` вернул `database: ok`, версия 11.5.2; Tempo и OTel collector запущены |

Четыре дополнительных документа, созданных cross-module сценариями, учтены в post-E2E fingerprints. Документы и строки не менялись при рестарте; единственные изменения counts вызваны verify-only login и download.

## Backup/restore и TypeScript compatibility

Создан custom-format dump disposable базы (SHA-256 `1fb0850feae4aa2e242965a9ecc70ca3322dab5e6930f783236759ecbcac74fe`), восстановлен в отдельную `erp_stage14c_rollback`. Restore успешно завершился; в копии — 54 public tables. Копия document volume содержала 70 файлов и полностью совпала с сохранённым post-flow manifest.

На восстановленной БД штатный `@prisma/client` прочитал counts legacy-моделей: `user 13`, `employee 42`, `project 28`, `task 199`, `procurementRequest 37`, `asset 123`, `document 63`, `documentVersion 70`, `timesheet 80`, `payrollPeriod 8`. Это подтверждает schema read compatibility для этих моделей. BFF/runtime назад на TypeScript не переключался; полноценный route rollback остаётся отдельным незакрытым gate. При возвращении к NextAuth сессии Python не переносятся, пользователи должны войти заново.

## Кодовые gates

| Проверка | Результат |
|---|---|
| `npm run lint` | Успех; 0 errors, 89 существующих warnings. `.runtime/**` исключён из lint, поскольку там лежит архивная сборка, а не исходный код |
| `npm run typecheck` | Успех (`tsc --noEmit`) |
| Next production build | App image собран успешно в `2026-10-24T21:28:57Z`, после production auth change; после сборки менялись только E2E/config/docs, app source не менялся |
| Полный backend pytest | `477 passed, 1 failed`; единственный failure — `test_domain_and_core_context_do_not_depend_on_framework_or_infrastructure`, который находит 17 импортов из `services.*` в запрещённые слои. Эти сервисы Stage14C не менял; failure требует отдельного архитектурного решения |
| Stage10 finance tests | Три первоначальных failure были вызваны остаточными тестовыми строками в `erp_stage10_test`; очищена только эта disposable test-БД, затем целевые тесты прошли `3 passed`. Последний полный pytest после очистки оставил только архитектурный failure |

Полный lint также сначала обошёл архив `.runtime/migration-baseline` и выдал lint errors на собранных JS-файлах. После добавления `.runtime/**` в `eslint.config.mjs` штатный `npm run lint` прошёл без errors.

## Команды и ограничения

Полный E2E запускать после загрузки локального disposable env: `DATABASE_URL` и `STAGE14C_E2E_DATABASE_URL` должны указывать на одну disposable `erp_stage14c_e2e` БД. Не выводить env и secrets в отчёт:

```sh
set -a
source /path/to/rehearsal.env
set +a
export PLAYWRIGHT_BASE_URL='http://127.0.0.1:3301'

npx playwright test --config=playwright.stage14c.config.ts

# После рестарта тех же disposable app/backend/worker контейнеров:
STAGE14C_VERIFY_ONLY=1 npx playwright test \
  --config=playwright.stage14c.config.ts \
  --grep "Stage 14C persistence survives"

docker compose -p org-erp-stage14c-rehearsal-20261024 ps
docker exec org-erp-stage14c-rehearsal-20261024-backend-1 \
  python -m app.scripts.verify_data
```

Secrets остаются в локальном disposable env и не записаны в этот отчёт. Stage14C не удалял legacy TypeScript backend, не менял production routing и не выполнял production cutover.
