# Project1 Accounting

Внутренняя система учёта имущества, сотрудников, проектов и финансового планирования. Это модульный Next.js-монолит; приложение, Prisma-схема, миграции и эксплуатационные файлы находятся в корне репозитория.

## Стек и требования

- Node.js 22 или новее;
- npm (используется `package-lock.json`, зависимости устанавливаются через `npm ci`);
- Docker Engine с Docker Compose v2;
- PostgreSQL 15 и Prisma 6.19.3;
- Next.js 16.2.10 и React 19.2.7;
- Vitest и Playwright.

Проверить локальные версии:

```bash
node --version
npm --version
docker --version
docker compose version
```

## Быстрый локальный запуск

Приложение запускается на хосте, PostgreSQL — в Docker:

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

После запуска приложение доступно по адресу <http://localhost:3001>. Команда `user:create-admin` интерактивно запрашивает логин, имя и скрытый временный пароль длиной не менее 12 символов. После первого входа администратор обязан изменить пароль.

`db:seed` создаёт справочники и демонстрационные записи. Выполняйте эту команду только в локальной или тестовой БД, не в production.

## Переменные окружения

Для локальной разработки скопируйте `.env.example` в `.env`. Файл `.env` содержит секреты и исключён из Git.

| Переменная | Назначение | Локальное значение |
| --- | --- | --- |
| `POSTGRES_USER` | пользователь PostgreSQL в Docker | `project1` |
| `POSTGRES_PASSWORD` | пароль PostgreSQL | задайте свой |
| `POSTGRES_DB` | имя основной БД | `project1` |
| `POSTGRES_PORT` | порт PostgreSQL на хосте только для dev-overlay | `5434` |
| `DATABASE_URL` | подключение Prisma-команд и приложения на хосте | `postgresql://...@localhost:5434/project1` |
| `NEXTAUTH_URL` | канонический URL приложения для NextAuth | `http://localhost:3001` |
| `NEXTAUTH_SECRET` | секрет подписи сессий, минимум 32 символа | уникальный локальный секрет |
| `NEXT_PUBLIC_APP_URL` | публичный URL приложения | `http://localhost:3001` |
| `PORT` | порт приложения при запуске на хосте | `3001` |
| `APP_PORT` | публикация порта контейнера `app` | `3001` |
| `PLAYWRIGHT_BASE_URL` | URL приложения для E2E | `http://127.0.0.1:3001` |

Сгенерировать секрет для NextAuth можно так:

```bash
openssl rand -base64 48
```

Переменные Yandex OAuth присутствуют в `.env.example` как резерв под интеграцию, но текущий код приложения их не читает.

В Compose контейнеры `app` и `migrate` подключаются к PostgreSQL по внутреннему адресу `postgres:5432`; их `DATABASE_URL` собирается из `POSTGRES_USER`, `POSTGRES_PASSWORD` и `POSTGRES_DB`. Значение `DATABASE_URL` из `.env` используется командами, запущенными непосредственно на хосте.

## Ежедневная разработка

Поднять только локальную БД:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
```

Проверить состояние и посмотреть логи:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f postgres
```

Запустить приложение:

```bash
npm run dev
```

Остановить или снова запустить БД без удаления данных:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml stop postgres
docker compose -f docker-compose.yml -f docker-compose.dev.yml start postgres
```

Удалить контейнеры, сохранив данные в Docker volume:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

Полностью удалить локальную БД и начать с нуля — необратимая операция:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
npm run db:migrate:deploy
npm run db:seed
```

Dev-overlay публикует PostgreSQL на хосте и предназначен только для разработки. Не подключайте `docker-compose.dev.yml` в production.

## Prisma и миграции

Схема находится в `prisma/schema.prisma`, история миграций — в `prisma/migrations/`. Схема и созданная миграция должны попадать в один коммит.

### Применить существующие миграции

После получения изменений из Git:

```bash
npm ci
npm run db:generate
npm run db:migrate:deploy
```

`db:migrate:deploy` применяет уже зафиксированные миграции и не пытается изменить их. Эта команда используется в CI и production.

### Создать новую миграцию

1. Поднимите PostgreSQL и убедитесь, что `DATABASE_URL` указывает на локальную БД.
2. Измените `prisma/schema.prisma`.
3. Создайте и примените миграцию:

```bash
npm run db:migrate -- --name add_asset_location
```

4. Проверьте созданный `prisma/migrations/<timestamp>_add_asset_location/migration.sql`.
5. Перегенерируйте Prisma Client и выполните проверки:

```bash
npm run db:generate
npm run db:verify
npm run check
```

6. Закоммитьте изменения схемы и каталог новой миграции.

Имя миграции должно кратко описывать изменение и использовать `snake_case`, например `add_employee_department` или `make_contract_code_optional`.

`db:migrate` запускает `prisma migrate dev` и предназначен только для локальной разработки. В CI и production используйте исключительно `db:migrate:deploy`.

### Миграция с ручным SQL или переносом данных

Создайте миграцию без немедленного применения:

```bash
npm run db:migrate -- --name backfill_asset_holdings --create-only
```

Отредактируйте созданный `migration.sql`, внимательно проверьте блокировки, ограничения и преобразование существующих данных, затем примените миграцию:

```bash
npm run db:migrate
npm run db:verify
```

Для потенциально опасных изменений используйте expand/contract: сначала добавьте новые nullable-поля или таблицы и совместимый код, выполните backfill и проверки, а удаление старых полей вынесите в отдельный релиз.

### Полезные команды Prisma

```bash
npm run db:generate              # перегенерировать Prisma Client
npm run db:studio                # открыть Prisma Studio для локальной БД
npx prisma migrate status        # показать состояние миграций
npm run db:migrate:deploy        # применить миграции без их создания
npm run db:verify                # проверить целостность прикладных данных
```

Полный сброс схемы допустим только для локальной или тестовой БД и удалит все данные:

```bash
npx prisma migrate reset
```

Не используйте `prisma db push` вместо миграций. Не изменяйте уже применённые или попавшие в общую ветку `migration.sql`: исправление оформляется новой миграцией.

Prisma не выполняет автоматический rollback production-миграций. При ошибке безопасный путь — закрыть доступ к приложению, восстановить backup или выпустить проверенную forward-fix миграцию. `prisma migrate resolve` применяется только при ручном разборе инцидента и после проверки фактического состояния БД.

## Seed, администратор и проверка данных

Заполнить локальную БД демонстрационными данными:

```bash
npm run db:seed
```

Seed использует `upsert`, поэтому его можно повторно запускать в dev-среде, однако он не удаляет данные, созданные вручную.

Создать первоначального администратора:

```bash
npm run user:create-admin
```

Команда требует интерактивный TTY и доступ к БД через `DATABASE_URL`. Пароль не передаётся через аргументы или переменные окружения. Повторное создание пользователя с тем же логином завершится ошибкой; последующих пользователей администратор создаёт через интерфейс приложения.

Проверить прикладную целостность данных:

```bash
npm run db:verify
```

Проверяются:

- равенство суммы `AssetHolding.quantity` общему `Asset.quantity`;
- отсутствие отрицательных количеств и стоимостей;
- отсутствие orphan relations;
- отсутствие секретов в audit JSON.

Ненулевой результат любой проверки завершает команду с ошибкой.

## Проверки и тесты

Основной набор перед отправкой изменений:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run db:verify
```

Сокращённая команда выполняет lint, typecheck, unit-тесты и production build:

```bash
npm run check
```

Для первого локального запуска Playwright установите Chromium:

```bash
npx playwright install chromium
```

E2E создаёт пользователей `e2e-admin`, `e2e-viewer` и тестовые записи. Не запускайте E2E с `DATABASE_URL` production-БД. Рекомендуется отдельная тестовая база:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec postgres \
  createdb -U project1 project1_test

DATABASE_URL="postgresql://project1:change-this-local-password@localhost:5434/project1_test" \
  npm run db:migrate:deploy

DATABASE_URL="postgresql://project1:change-this-local-password@localhost:5434/project1_test" \
PLAYWRIGHT_BASE_URL="http://127.0.0.1:3001" \
  npm run test:e2e
```

Подставьте пользователя, пароль и порт из своего `.env`. Playwright сам поднимает dev-сервер, если по `PLAYWRIGHT_BASE_URL` ещё ничего не запущено.

Полный набор, соответствующий CI:

```bash
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --omit=dev --audit-level=high
```

## Команды npm

| Команда | Назначение |
| --- | --- |
| `npm run dev` | dev-сервер в `.next-dev` |
| `npm run dev:turbo` | dev-сервер с отдельным каталогом `.next-dev-turbo` |
| `npm run dev:webpack` | dev-сервер через Webpack |
| `npm run dev:reset` | удалить dev/build-кеш и запустить dev-сервер |
| `npm run clean:next` | удалить `.next`, `.next-dev` и `.next-dev-turbo` |
| `npm run prod:reset` | удалить только каталог production build `.next` |
| `npm run build` | production build |
| `npm run build:clean` | очистить Next-кеш и выполнить build |
| `npm run start` | запустить ранее собранный production build |
| `npm run start:prod` | очистить кеш, собрать и запустить production локально |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript без генерации файлов |
| `npm test` | unit/integration тесты Vitest |
| `npm run test:e2e` | E2E Playwright |
| `npm run check` | lint + typecheck + tests + build |
| `npm run db:generate` | сгенерировать Prisma Client |
| `npm run db:migrate` | создать/применить dev-миграцию |
| `npm run db:migrate:deploy` | применить готовые миграции |
| `npm run db:studio` | Prisma Studio |
| `npm run db:seed` | демонстрационные данные для dev/test |
| `npm run db:verify` | проверка целостности данных |
| `npm run user:create-admin` | интерактивное создание первого ADMIN |

## Локальная проверка production Docker

Полный стек можно собрать и запустить локально в production-подобном режиме:

```bash
docker compose config
docker compose build
docker compose up -d
docker compose ps
```

`docker compose config` выводит итоговую конфигурацию, включая секреты; не публикуйте его вывод.

Compose запускает сервисы в таком порядке:

1. `postgres` — PostgreSQL 15 с постоянным volume;
2. `migrate` — одноразовый контейнер с `prisma migrate deploy`;
3. `app` — production Next.js после успешного завершения миграций.

Статус `Exited (0)` у контейнера `migrate` является нормальным. Логи и health endpoints:

```bash
docker compose logs --tail=100 migrate
docker compose logs -f app
curl --fail http://127.0.0.1:3001/api/health/live
curl --fail http://127.0.0.1:3001/api/health/ready
```

- `GET /api/health/live` — процесс приложения отвечает;
- `GET /api/health/ready` — приложение подключается к PostgreSQL.

Управление стеком:

```bash
docker compose ps                 # состояние сервисов
docker compose logs -f            # общие логи
docker compose restart app        # перезапуск приложения
docker compose stop               # остановить без удаления контейнеров
docker compose start              # снова запустить
docker compose down               # удалить контейнеры и сеть, сохранить БД
```

`docker compose down -v` удаляет production volume с БД. Не выполняйте эту команду на сервере.

## Production

### Подготовка сервера и `.env`

На сервере должны быть установлены Docker Engine и Docker Compose v2. Разворачивайте конкретный проверенный commit/tag из чистого рабочего дерева.

```bash
cp .env.example .env
chmod 600 .env
```

Для production обязательно:

- замените `POSTGRES_PASSWORD` на длинный уникальный пароль;
- сгенерируйте новый `NEXTAUTH_SECRET` минимум из 32 символов;
- задайте одинаковый публичный HTTPS origin в `NEXTAUTH_URL` и `NEXT_PUBLIC_APP_URL`, например `https://accounting.example.org`;
- ограничьте порт приложения loopback-интерфейсом, если reverse proxy работает на том же сервере: `APP_PORT=127.0.0.1:3001`;
- не подключайте `docker-compose.dev.yml` и не публикуйте порт PostgreSQL;
- завершайте TLS на внешнем reverse proxy и проксируйте запросы на `127.0.0.1:3001`.

Проверьте итоговую конфигурацию локально на сервере, не сохраняя и не публикуя вывод:

```bash
docker compose config --quiet
```

### Первый запуск

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 migrate
docker compose logs --tail=100 app
curl --fail http://127.0.0.1:3001/api/health/live
curl --fail http://127.0.0.1:3001/api/health/ready
```

Если `migrate` завершился с ошибкой, `app` не должен запускаться. Изучите логи, исправьте причину и только затем повторите `docker compose up -d`.

Не запускайте `db:seed` в production.

Для первого production-администратора выполните интерактивный скрипт из одноразового management-контейнера. Он использует внутреннюю Docker-сеть и не требует публикации PostgreSQL:

```bash
docker compose run --rm -it \
  -v "$PWD/src:/app/src:ro" \
  -v "$PWD/scripts:/app/scripts:ro" \
  migrate npm run user:create-admin
```

Запускайте команду из корня репозитория после успешного применения миграций. Каталоги исходников подключаются read-only; пароль вводится скрыто через TTY.

### Backup перед обновлением

Перед каждой production-миграцией создайте резервную копию в защищённом каталоге вне репозитория и убедитесь, что файл не пустой:

```bash
BACKUP_FILE="/srv/project1/dumps/project1-$(date +%F-%H%M%S).dump"
docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$BACKUP_FILE"
test -s "$BACKUP_FILE"
ls -lh "$BACKUP_FILE"
```

Каталог `/srv/project1/dumps` должен существовать заранее и быть доступен только администраторам. Копии дополнительно храните вне сервера и регулярно проверяйте восстановление на отдельной БД.

### Обновление production

1. Переведите внешний reverse proxy в maintenance mode или закройте пользовательский доступ.
2. Создайте и проверьте backup.
3. Получите конкретный проверенный commit/tag.
4. Соберите образы и запустите Compose:

```bash
docker compose build
docker compose up -d
```

5. Проверьте миграции, контейнеры и health endpoints:

```bash
docker compose logs --tail=100 migrate
docker compose ps
curl --fail http://127.0.0.1:3001/api/health/live
curl --fail http://127.0.0.1:3001/api/health/ready
```

6. Выполните проверку данных из одноразового management-контейнера:

```bash
docker compose run --rm \
  -v "$PWD/src:/app/src:ro" \
  -v "$PWD/scripts:/app/scripts:ro" \
  migrate npm run db:verify
```

7. Выполните smoke-тест основных сценариев и только после этого отключите maintenance mode.

Не открывайте доступ, если миграция, `db:verify`, health check или smoke-тест завершились ошибкой.

### Восстановление из backup

Восстановление удаляет текущую production-БД и выполняется только в maintenance mode:

```bash
docker compose stop app migrate
docker compose exec -T postgres sh -c \
  'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  < /srv/project1/dumps/project1-YYYY-MM-DD-HHMMSS.dump
docker compose up -d migrate app
```

После восстановления обязательно проверьте:

```bash
docker compose logs --tail=100 migrate
docker compose run --rm \
  -v "$PWD/src:/app/src:ro" \
  -v "$PWD/scripts:/app/scripts:ro" \
  migrate npm run db:verify
curl --fail http://127.0.0.1:3001/api/health/ready
```

Затем выполните smoke-тест и только после успешной проверки откройте пользовательский доступ.

## Rollout AssetHolding

Release A:

1. включить maintenance mode и сделать backup;
2. применить additive-миграцию пользователей и `AssetHolding`;
3. выполнить `npm run db:verify` и smoke/E2E на отдельной тестовой среде;
4. открыть доступ. Приложение читает и пишет holdings, legacy `Asset.molId` временно остаётся для rollback.

Release B после стабильного периода:

1. повторить backup и `db:verify`;
2. удалить legacy `Asset.molId` отдельной миграцией;
3. снова выполнить полный CI и smoke-тесты.

При любой ошибке Release A доступ не открывается, контейнеры останавливаются, а база восстанавливается из backup.

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
- domain-код не зависит от application, infrastructure, UI, Next.js и Prisma Client;
- UI не обращается напрямую к Prisma или infrastructure;
- межмодульный обмен выполняется через `contracts`, а композиция модулей — в `app`;
- HTTP URL, JSON-контракты, роли и Prisma-схема считаются стабильными внешними границами.

## Роли и безопасность

- `ADMIN` — все операции и управление пользователями;
- `EDITOR` — доменные изменения без управления пользователями;
- `VIEWER` — чтение и экспорт.

`proxy.ts` выполняет только раннее перенаправление. Server Components и API повторно проверяют активного пользователя в PostgreSQL. Мутации требуют допустимую роль и same-origin, пароли хранятся как Argon2id, после пяти неверных попыток вход блокируется на 15 минут.

## Структура репозитория

```text
prisma/                 схема, миграции и dev seed
scripts/                служебные команды администратора и проверки БД
src/app/                route groups, страницы-композиции и HTTP API
src/features/           contracts, domain, application, infrastructure и UI
src/components/         общий UI-kit, layout и навигация
src/lib/                auth, DB, HTTP, logger и общая инфраструктура
e2e/                    Playwright smoke/E2E
.github/workflows/      CI
Dockerfile              multi-stage production image
docker-compose.yml      production topology
docker-compose.dev.yml  локальная публикация порта PostgreSQL
```
