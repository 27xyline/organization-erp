# Project1 Accounting

Внутренняя система учёта имущества, сотрудников, проектов и финансового планирования. Это модульный Next.js-монолит; приложение, Prisma-схема и эксплуатационные файлы находятся в корне репозитория.

## Стек и требования

- Node.js 22;
- Next.js 16.2.10 и React 19.2.7;
- PostgreSQL 15 и Prisma 6.19.3;
- NextAuth 4, Argon2id, Zod;
- Vitest и Playwright.

## Локальный запуск

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run user:create-admin
npm run dev
```

`user:create-admin` запрашивает логин, имя и скрытый временный пароль интерактивно. Пароль не передаётся через argv или env; после первого входа ADMIN обязан его изменить.

## Роли и безопасность

- `ADMIN` — все операции и управление пользователями;
- `EDITOR` — доменные изменения без управления пользователями;
- `VIEWER` — чтение и экспорт.

`proxy.ts` выполняет только раннее перенаправление. Server Components и API повторно проверяют активного пользователя в PostgreSQL. Мутации требуют допустимую роль и same-origin, пароли хранятся как Argon2id, после пяти неверных попыток вход блокируется на 15 минут.

## Архитектура

Приложение разделено на предметные модули `assets`, `employees`, `projects`, `finance`, `users` и `exports`. Внутри модуля используются только необходимые слои:

```text
src/features/<feature>/
├── contracts/       Zod-схемы, DTO и публичные типы
├── domain/          чистые бизнес-правила и доменные ошибки
├── application/     запросы, команды и транзакционные сценарии
├── infrastructure/  сложные Prisma-запросы и helpers
└── ui/              предметные React-компоненты и hooks
```

Направление зависимостей:

```text
app ──► feature/application ──► feature/domain
 │               └───────────► feature/infrastructure ──► lib/prisma
 └──► feature/ui
```

Основные правила:

- `src/app` содержит маршрутизацию, авторизацию, HTTP-адаптацию и композицию экранов;
- `src/lib` содержит общую инфраструктуру и не зависит от `features` или `app`;
- domain-код не зависит от application, infrastructure, UI, Next.js и Prisma client;
- UI не обращается напрямую к Prisma или infrastructure;
- межмодульный обмен выполняется через `contracts`, а композиция модулей — в `app`;
- HTTP URL, JSON-контракты, роли и Prisma-схема считаются стабильными внешними границами.

## Проверки

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run db:verify
npm audit --omit=dev --audit-level=high
```

`db:verify` проверяет равенство `SUM(AssetHolding.quantity) = Asset.quantity`, отрицательные остатки, orphan relations и отсутствие секретов в audit JSON.

## Production Docker

Заполните production `.env`, укажите публичные HTTPS URL и запустите:

```bash
docker compose build
docker compose up -d
```

Compose использует PostgreSQL 15 без опубликованного наружу порта. Одноразовый `migrate`-контейнер выполняет `prisma migrate deploy`; приложение запускается non-root пользователем и выполняет только `next start`. HTTPS завершается на внешнем reverse proxy.

Health endpoints:

- `GET /api/health/live` — процесс отвечает;
- `GET /api/health/ready` — приложение видит PostgreSQL.

## Backup и восстановление

Перед каждой production-миграцией:

```bash
docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > backup-$(date +%F-%H%M).dump
```

Восстановление выполняется только в maintenance mode:

```bash
docker compose stop app migrate
docker compose exec -T postgres sh -c \
  'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  < backup.dump
docker compose up -d migrate app
```

После восстановления обязательно выполнить `npm run db:verify` с `DATABASE_URL` восстановленной базы.

## Rollout AssetHolding

Release A:

1. включить maintenance mode и сделать backup;
2. применить additive-миграцию пользователей и `AssetHolding`;
3. выполнить `npm run db:verify` и smoke/E2E;
4. открыть доступ. Приложение читает и пишет holdings, legacy `Asset.molId` временно остаётся для rollback.

Release B после стабильного периода:

1. повторить backup и `db:verify`;
2. удалить legacy `Asset.molId` отдельной миграцией;
3. снова выполнить полный CI и smoke-тесты.

При любой ошибке Release A доступ не открывается, контейнеры останавливаются, а база восстанавливается из backup.

## Структура

```text
prisma/                 схема и миграции
src/app/                тонкие route groups, страницы-композиции и HTTP API
src/features/           contracts, domain, application, infrastructure и UI модулей
src/components/         общий UI-kit, layout и навигация
src/lib/                auth, DB, HTTP, logger и общая инфраструктура
e2e/                    Playwright smoke/E2E
.github/workflows/      CI
Dockerfile              multi-stage production image
docker-compose.yml      production topology
```
