# Волна 5: миграции, собственная Python-сессия и полное переключение

> Для агента: этап 14 разделён на четыре подэтапа с остановками. Не запускать все подэтапы одной командой без явного указания пользователя. Использовать `superpowers:executing-plans`; ветки/коммиты/subagents только по запросу.

**Цель:** FastAPI единственный backend, Alembic единственный migration owner, Next.js содержит frontend и транспортный адаптер.

**Архитектура:** общие слои по [spec](../../specs/2026-09-28-fastapi-backend-design.md), без NextAuth/bridge в конечном backend.

**Стек:** существующая Python основа; PostgreSQL sessions. Redis/Celery не являются условиями завершения.

## Общие ограничения и review focus

- До первой записи на рабочем окружении все подэтапы репетируются на отдельной копии БД/файлов.
- В рамках выполнения на рабочем окружении cutover/deployment выполняется только если пользователь поручил это; подготовка и репетиция входят в технический результат. Не подменять существующий сервис ради подготовки плана.
- Нельзя запустить Prisma и Alembic DDL независимо, пересоздать таблицы или очистить volumes.
- Нельзя удалить старую реализацию, пока route/method + SSR + scripts + background registry не полностью закрыт.
- Пять failure classes: ложный stamp несовпадающей схемы; stale/forged session cookie; login/logout CSRF; откат к schema-incompatible TS; забытый backend import в server page/script.

## Этап 14A. Передача миграций Alembic

**Создать:** `backend/migrations/versions/<baseline_revision>_legacy_schema.py`, `backend/app/scripts/verify_schema.py`, `backend/tests/integration/test_migrations.py`, `docs/backend-migration/migration-handoff.md`.

**Изменить:** migration env/registry и CI/Compose, когда обе rehearsal проверки пройдут. Prisma history сохраняется.

- [x] Заморозить DDL обоих backend на время schema inventory сверки. Все 42 хешированных source inputs совпали с inventory Stage 00.
- [x] Подготовить frozen baseline всех объектов из 41 Prisma SQL migration. Revision хранит буквальную копию исходного DDL и не зависит от ORM metadata.
- [x] Путь 1: пустая disposable PostgreSQL → `uv run alembic upgrade head` → verify_schema → demo seed → relational verify. Каталог совпал с legacy-схемой плюс Stage 14A audit trigger.
- [x] Путь 2: восстановленная existing copy → legacy catalog verification → `uv run alembic stamp 20261024_legacy_schema` → upgrade audit revision → final verification → `uv run alembic check`. Stamp выполнялся только после нулевого расхождения.
- [x] `alembic check` дополнен независимым catalog-level compare constraints, indexes/partial indexes, enum/defaults, functions/triggers. `_prisma_migrations` исключена из обоих сравнений и сохранена в copy.
- [x] Добавлен append-only audit trigger в отдельной revision `20261024_audit_log_append_only`; direct SQL UPDATE/DELETE запрещены, INSERT подтверждён обоими rehearsal tests.
- [x] CI и Compose migration job используют только Alembic; активный Prisma DDL job отключён. Node seed/CLI сохранены до 14D.

Отчёт, catalog artifacts и точные disposable targets: [migration-handoff.md](../../backend-migration/migration-handoff.md). Audit protection отдельной revision добавлена после baseline, чтобы existing-copy rehearsal могла сначала проверить точный legacy catalog, затем безопасно stamp и применить защиту.

**Проверки:** `uv run pytest tests/integration/test_migrations.py -q`; оба пути, schema verifier, audit immutability direct SQL. Записать baseline revision и точные targets/commands.

**Пауза:** пользователь разбирает `upgrade` vs `stamp`, ownership DDL и одну реальную migration.

## Этап 14B. Авторизация полностью на Python

**Создать:** `app/models/sessions.py`, `app/domain/ports/sessions.py`, `app/repositories/sessions.py`, `app/services/sessions.py`, `app/api/routes/auth.py`, `app/integrations/session_security.py`, Alembic session migration; `tests/{unit,integration,contracts}/sessions/`. Для login переиспользуется `CredentialsInput` из `app.schemas.auth`, отдельная session-схема не нужна.

**Контракт:** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/csrf`, `GET /api/account/me`; password endpoint остаётся совместимым. API отдаёт минимальный actor DTO, без hash/secret/внутренних bearer tokens.

- [x] Opaque token минимум 256 бит, в БД только hash; session expiry 8 часов, user/sessionVersion/revoked checks на каждом запросе; login counters из 03 переиспользуются.
- [x] Session cookie HttpOnly, Path=/, SameSite=Lax, Secure в production, без широкого Domain. При logout cookie очищается и session revoked; пароль/деактивация отзывают все sessions через version/rows.
- [x] Защита unsafe methods включая login/logout: проверенный signed double-submit CSRF token, header + cookie, same-origin проверка. Missing Origin не отключает проверку token. GET `/csrf` не раскрывает authentication secret; cross-origin JS не получает credentialed response.
- [x] Tests: login/logout, expired/revoked token, смена пароля, user inactive, forced change, поддельная cookie, wrong CSRF/origin, replay старой сессии после revoke, отсутствие session fixation.
- [x] BFF прозрачно передаёт cookie/Set-Cookie и CSRF headers; SSR uses `/api/account/me` с request cookie и `no-store`. Proxy не доверяет просто наличию cookie.
- [x] Реализовать login/session UI adapter, заменяющий `signIn`, `signOut`, `useSession`, `getServerSession`, `getToken`, session-based UI permissions. Никакие зарплатные поля не выводятся до подтверждения Python actor.

**Проверки:** `uv run pytest tests/unit/sessions tests/integration/sessions tests/contracts/sessions -q`; Playwright login → reload SSR → logout → old session denied; role change, forced password change, CSRF negative.

**Пауза:** browser cookie, server session, CSRF и `sessionVersion`; самостоятельный тест expired session.

## Этап 14C. Репетиция переключения и отката

**Создать:** `docs/backend-migration/cutover-runbook.md`, `rollback-runbook.md`, `acceptance-report.md`; full flow Playwright scenarios.

- [x] На отдельном окружении восстановить копию БД и document volume; зафиксировать counts/relations/hash до переключения.
- [x] Обновить manifest владельцев routes/SSR/scripts; явно записать оставшиеся TS health endpoints и legacy NextAuth adapter; проверить service permissions и транспортный routing.
- [x] В rehearsal включить maintenance fence и проверить unsafe writes, дождаться отсутствия запросов/worker claims, выполнить migration/backend/session smoke. Зафиксировать требование нового входа после возврата с Python session на NextAuth.
- [x] Пройти полный сценарий: сотрудник → проект → задача → закупка → approval → доставка → asset → документ; табель → approval → payroll → close; exports и уведомления; ADMIN и scoped роли.
- [x] Проверить DB counts/audit/outbox/document SHA и ownership после перезапуска, а не только HTTP 200.
- [x] Завершить routing rollback rehearsal на схеме, которую TS умеет читать: legacy TS snapshot `d29003d8adb9` обслужил локальный app entrypoint `127.0.0.1:3302`, подключённый к восстановленным `erp_stage14c_rollback` и `rollback-documents`. NextAuth login, ADMIN read/create/delete, document list/download и scoped asset read/write прошли; out-of-scope read/write запрещены. Это подтверждает проверенные маршруты на копии, но не является production rollback или обещанием универсального env-флага. После новых migrations понадобится совместимый down/forward fix либо restore в maintenance с явно описанной потерей данных после backup.
- [x] Результат содержит команды, фактические результаты, известные ограничения, schema compatibility и обновлённый перечень владельцев. Рабочее окружение переключается отдельной порученной операцией после готовой репетиции.

**Проверки:** frontend lint/typecheck/build, полный backend pytest (`480 passed`), architecture guard (`11 passed`), полный cross-module Playwright, Compose/metrics, DB/data integrity, DB/document restore, Prisma read smoke и изолированная legacy TypeScript route rollback rehearsal прошли.

**Пауза:** пользователь проходит сценарий сам и изучает runbook. Удаление legacy кода — только после успешной репетиции.

## Этап 14D. Удаление TS backend и финальное учебное состояние

**Изменить:** `src/app/api/`, `src/lib/{auth,prisma,backend}/`, `src/proxy.ts`, providers/login/session UI, `package.json`, `Dockerfile`, Compose, CI, README; архивировать описание legacy mapping в docs, не дублировать активные writers.

- [x] Удалить TypeScript services/repositories/worker/Prisma runtime/NextAuth/bridge, которые больше не используются. UI-only helpers остаются, если не являются независимыми бизнес-правилами.
- [x] Заменить frontend импорты enum/type из `@prisma/client` на frontend contracts/API types; Prisma generation остаётся только в E2E fixture script, не во frontend build.
- [x] Next routes остаются транспортными адаптерами с Python permissions; browser-facing same-origin URLs сохранены.
- [x] Убрать Prisma migration/seed/create-admin commands из активного запуска; Python CLI и Alembic описаны в README; неиспользуемые NextAuth/bridge/internal-auth secrets удалены.
- [x] Проверить backend imports/writers и отсутствие frontend runtime `DATABASE_URL`; пользовательский `next-env.d.ts` сохранён с исходным SHA-256.
- [x] Подтверждён fresh Compose старт: frontend + FastAPI + PostgreSQL 18 + documents + Python notification worker; observability остаётся optional, Redis/Celery не нужны.
- [x] Добавлен README walkthrough одного запроса по папкам `api/schemas → services → domain → repositories/models/db`, инструкции tests/migrations и архитектурные ограничения.
- [x] Повторить full checks после удаления; зафиксировать итоговые изменения и измерения в [Stage 14D validation](../../../backend-migration/stage14d-validation.md). Пользователь самостоятельно делает маленькое изменение service/domain и теста.

**Готово:** полностью Python backend, подтверждённые tests/rehearsal, слоистая структура по скриншоту. Для эксплуатации нельзя считать незапущенный deployment выполненным. **Финальная пауза:** разобрать архитектуру и выбрать самостоятельное расширение из [идей](09-future-exercises.md).
