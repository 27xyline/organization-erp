# Project1 Accounting

Внутренняя система учёта организации: имущество, сотрудники, проекты, закупки, финансы, документооборот и согласования. Модульный Next.js-монолит с PostgreSQL и ролевой моделью доступа.

---

## Содержание

- [Функциональность](#функциональность)
- [Стек технологий](#стек-технологий)
- [Быстрый старт](#быстрый-старт)
- [Переменные окружения](#переменные-окружения)
- [Архитектура](#архитектура)
- [Бизнес-модули](#бизнес-модули)
- [Роли и безопасность](#роли-и-безопасность)
- [Ежедневная разработка](#ежедневная-разработка)
- [Prisma и миграции](#prisma-и-миграции)
- [Тестирование](#тестирование)
- [Команды npm](#команды-npm)
- [Docker и production](#docker-и-production)
- [Структура репозитория](#структура-репозитория)

---

## Функциональность

| Модуль | Возможности |
| --- | --- |
| **Имущество** | Реестр ТМЦ с инвентарными номерами, группами, статусами. Операции поступления, перемещения, списания. Распределённый учёт через МОЛ и `AssetHolding`. Обслуживание и плановые проверки. |
| **Сотрудники** | Кадровый учёт, табельные номера, контракты (основной, внутренний, внешний). Навыки, сертификаты, менеджерская иерархия. Кадровые действия: приём, перевод, увольнение. Отпуска и больничные. |
| **Проекты** | Проекты с бюджетами (план/факт, доходы/расходы), участниками, задачами с 3-уровневой иерархией. Диаграмма Ганта, критический путь, зависимости, вехи, чек-листы, комментарии. |
| **Финансы** | Штатное расписание, зарплатные ведомости, финансовый план (оклад + надбавка), расчёт зарплаты по проектам. Расчётные периоды с закрытием. |
| **Закупки** | Полный цикл: заявка → согласование → контракт с поставщиком → поставки → постановка на учёт. Привязка к проектам и документам. Валидация ИНН. |
| **Документы** | Электронный документооборот: версионирование файлов с SHA-256, категории (договор, приказ, акт, счёт…), статусы жизненного цикла. Хранение на локальной файловой системе. |
| **Согласования** | Многошаговые цепочки согласований с произвольными участниками. Статусы шагов, сроки, напоминания. Оптимистичная блокировка. |
| **Уведомления** | In-app и email уведомления. Настраиваемые предпочтения по типам событий. Outbox-паттерн для email. Scheduled-алерты: просроченные задачи, истекающие контракты, обслуживание имущества, перерасход бюджета. |
| **Табель** | Учёт рабочего времени по сотрудникам, проектам и задачам. Типы: рабочий день, отпуск, больничный, командировка, сверхурочные. |
| **Подразделения** | Иерархическая оргструктура. Руководители подразделений. Связь с сотрудниками, МОЛ, штатным расписанием. |
| **Отчётность** | Дашборд с KPI: численность, ФОТ, бюджеты проектов, статусы имущества. Аналитика по подразделениям. Сохранённые пресеты отчётов. |
| **Экспорт** | Выгрузка реестров в Excel (ExcelJS), Word (docx), PDF (PDFKit). |
| **Аудит** | Журнал действий пользователей с привязкой к сущностям. Request ID для трассировки. |

---

## Стек технологий

| Слой | Технология |
| --- | --- |
| Runtime | Node.js ≥ 22 |
| Фреймворк | Next.js 16, React 19, TypeScript |
| БД | PostgreSQL 15, Prisma ORM 6.19 |
| Аутентификация | NextAuth 4 (Credentials), JWT-сессии, Argon2id |
| UI | TailwindCSS 3, Radix UI, Lucide React |
| Валидация | Zod |
| Экспорт | ExcelJS, docx, PDFKit |
| Тесты | Vitest (unit/integration), Playwright (E2E) |
| CI/CD | GitHub Actions |
| Инфраструктура | Docker, Docker Compose v2 |

Проверить локальные версии:

```bash
node --version    # ≥ 22.0.0
npm --version
docker --version
docker compose version
```

---

## Быстрый старт

Приложение запускается на хосте, PostgreSQL — в Docker:

```bash
# 1. Настройка окружения
cp .env.example .env           # задайте POSTGRES_PASSWORD и NEXTAUTH_SECRET

# 2. Запуск БД
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres

# 3. Установка и инициализация
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run db:seed                # демо-данные (только dev/test!)
npm run user:create-admin      # интерактивно: логин, имя, пароль ≥ 12 символов

# 4. Запуск
npm run dev
```

Приложение доступно на **http://localhost:3001**. После первого входа администратор обязан сменить пароль.

Сгенерировать секрет для NextAuth:

```bash
openssl rand -base64 48
```

---

## Переменные окружения

Скопируйте `.env.example` в `.env`. Файл `.env` содержит секреты и исключён из Git.

| Переменная | Назначение | Локальное значение |
| --- | --- | --- |
| `POSTGRES_USER` | пользователь PostgreSQL в Docker | `project1` |
| `POSTGRES_PASSWORD` | пароль PostgreSQL | задайте свой |
| `POSTGRES_DB` | имя основной БД | `project1` |
| `POSTGRES_PORT` | порт PostgreSQL на хосте (dev-overlay) | `5434` |
| `DATABASE_URL` | подключение Prisma и приложения на хосте | `postgresql://...@localhost:5434/project1` |
| `NEXTAUTH_URL` | канонический URL приложения | `http://localhost:3001` |
| `NEXTAUTH_SECRET` | секрет подписи сессий, минимум 32 символа | уникальный секрет |
| `NEXT_PUBLIC_APP_URL` | публичный URL | `http://localhost:3001` |
| `PORT` | порт на хосте | `3001` |
| `APP_PORT` | публикация порта контейнера `app` | `3001` |
| `PLAYWRIGHT_BASE_URL` | URL для E2E-тестов | `http://127.0.0.1:3001` |
| `DOCUMENT_STORAGE_ROOT` | каталог хранения документов | `./.runtime/documents` |
| `DOCUMENT_MAX_FILE_SIZE_BYTES` | максимальный размер файла (≤ 100 МБ) | `26214400` |

В Compose контейнеры `app` и `migrate` подключаются к PostgreSQL по `postgres:5432`. `DATABASE_URL` из `.env` используется командами на хосте.

Документы хранятся на локальной ФС. В Docker — отдельный volume `project1_document_data`. Не размещайте каталог внутри `public`, `.next`, `src` или `node_modules`.

Переменные Yandex OAuth присутствуют в `.env.example` как резерв, но код их не использует.

---

## Архитектура

### Модульная структура

Приложение разделено на предметные модули внутри `src/features/`. Каждый модуль использует только нужные слои:

```
src/features/<feature>/
├── contracts/       Zod-схемы, DTO, публичные типы
├── domain/          чистые бизнес-правила, доменные ошибки
├── application/     запросы, команды, транзакционные сценарии
├── infrastructure/  сложные Prisma-запросы и helpers
└── ui/              предметные React-компоненты и hooks
```

### Направление зависимостей

```
app ──► feature/application ──► feature/domain
 │               └───────────► feature/infrastructure ──► lib/prisma
 └──► feature/ui
```

### Основные правила

- `src/app` — маршрутизация, авторизация, HTTP-адаптация, композиция экранов
- `src/lib` — общая инфраструктура, не зависит от `features` или `app`
- **domain** не зависит от application, infrastructure, UI, Next.js, Prisma Client
- **UI** не обращается напрямую к Prisma или infrastructure
- межмодульный обмен — через `contracts`; композиция модулей — в `app`
- HTTP URL, JSON-контракты, роли и Prisma-схема — стабильные внешние границы

---

## Бизнес-модули

### Имущество (`assets`)

Центральная сущность — `Asset` с инвентарным номером, ценой, группой и статусом жизненного цикла:

`IN_STOCK` → `IN_USE` → `UNDER_REPAIR` → `PLANNED_FOR_DISPOSAL` → `PARTIALLY_DISPOSED` → `FULLY_DISPOSED`

Имущество привязано к **МОЛ** (материально ответственное лицо) через `AssetHolding` — одно ТМЦ может быть распределено между несколькими МОЛ. Каждая операция (поступление, перемещение, списание, смена статуса) фиксируется в `Operation`.

Обслуживание (`AssetMaintenance`): плановые осмотры, калибровки, ремонты с отслеживанием дат и стоимости.

### Сотрудники (`employees`)

Полный кадровый учёт: табельный номер, подразделение, должность, тип контракта (основной / внутреннее / внешнее совместительство), ставка, контактные данные.

Кадровые действия (`PersonnelAction`): приём, увольнение, перевод, продление, повышение — с историей изменений.

Отпуска и отсутствия (`Vacation`): отпуск, больничный, командировка, отпуск без содержания.

Навыки (`EmployeeSkill`) и сертификаты (`EmployeeCertificate`) с датами выдачи и истечения.

### Проекты (`projects`)

Проекты с бюджетным планированием (план/факт расходов и доходов), датами, статусами (`ACTIVE`, `COMPLETED`, `ARCHIVED`).

**Задачи** — 3-уровневая иерархия с зависимостями (Finish-to-Start с lag), приоритетами, рисками, вехами. Чек-листы и комментарии. Алгоритм **критического пути** для выявления узких мест.

**Участники проекта** — сотрудники с должностью, ставкой и зарплатой в контексте проекта.

Визуализация: **диаграмма Ганта** (SVAR React Gantt).

### Финансы (`finance`)

- **Штатное расписание** (`StaffSchedule`): должности, ставки, оклады по подразделениям
- **Зарплатные ведомости** (`SalaryEntry`): помесячные записи по сотрудникам
- **Финансовый план** (`FinancePlanEntry`): оклады и надбавки по сотрудникам и проектам
- **Корректировки** (`PayrollAdjustment`): премии, разовые выплаты, удержания
- **Расчётные периоды** (`PayrollPeriod`): открытие/закрытие с фиксацией ответственного

### Закупки (`procurement`)

Полный цикл от заявки до постановки на баланс:

```
DRAFT → SUBMITTED → APPROVED → CONTRACTED → PARTIALLY_DELIVERED → DELIVERED → CAPITALIZED
```

- **Заявка** (`ProcurementRequest`): позиции, бюджетный лимит, валидация (сумма ≤ лимит)
- **Согласование**: многошаговая цепочка через модуль `approvals`
- **Контракт** (`ProcurementContract`): поставщик с валидацией ИНН, сумма, сроки
- **Поставки** (`ProcurementDelivery`): приёмка позиций, привязка к активам

### Документы (`documents`)

Электронный документооборот с версионированием файлов:

- Категории: общий, договор, приказ, акт, счёт, кадровый, проектный, имущественный
- Жизненный цикл: `DRAFT` → `IN_REVIEW` → `APPROVED` → `SIGNED` → `ARCHIVED`
- Каждая версия хранится с SHA-256 хешем, MIME-типом и оригинальным именем
- Оптимистичная блокировка (`lockVersion`) для конкурентного доступа
- Документы привязываются к проектам, сотрудникам, имуществу

### Согласования (`approvals`)

Универсальный механизм многошаговых согласований:

- Произвольное количество шагов с именованными согласователями
- Последовательная обработка: `WAITING` → `PENDING` → `APPROVED`/`REJECTED`
- Сроки и напоминания (`reminderSent`)
- Привязка к документам, проектам, закупкам
- Оптимистичная блокировка

### Уведомления (`notifications`)

- **In-app**: нотификации в интерфейсе (колокольчик)
- **Email**: SMTP-рассылка через outbox-паттерн с ретраями
- Настраиваемые предпочтения по типам событий и каналам
- **Scheduled-алерты**: истекающие контракты сотрудников, просроченные задачи, плановое списание имущества, обслуживание, перерасход бюджета

### Табель (`timekeeping`)

Учёт рабочего времени: рабочие дни, отпуска, больничные, командировки, сверхурочные. Привязка к сотруднику, проекту и задаче.

### Отчётность (`reporting`)

Дашборд с ключевыми показателями:

- Численность и загруженность штатного расписания
- ФОТ: план vs факт
- Бюджеты проектов: использование, отклонения, средний прогресс
- Имущество: количество, стоимость, требующие внимания
- Текущие отсутствия, просроченные задачи
- Аналитика по подразделениям
- Сохранённые пресеты отчётов

---

## Роли и безопасность

### Ролевая модель (RBAC)

Система использует двухуровневую ролевую модель:

**Системные роли** (`UserRole`) — базовый уровень доступа:

| Роль | Описание |
| --- | --- |
| `ADMIN` | все операции и управление пользователями |
| `EDITOR` | доменные изменения без управления пользователями |
| `VIEWER` | только чтение и экспорт |

**Прикладные роли** (`AppRole`) — гранулярные полномочия с область видимости:

| Роль | Описание |
| --- | --- |
| `ADMIN` | Полный доступ ко всему |
| `HR` | Кадровые операции |
| `ACCOUNTANT` | Финансы, зарплаты, бюджеты |
| `PROJECT_MANAGER` | Управление проектами |
| `ASSET_CUSTODIAN` | Учёт имущества (МОЛ) |
| `DEPARTMENT_HEAD` | Руководитель подразделения |
| `AUDITOR` | Аудит и отчётность |
| `EMPLOYEE` | Базовый доступ сотрудника |

Каждая прикладная роль назначается пользователю с **режимом области видимости** (`ScopeMode`):

- `ALL` — доступ ко всем записям
- `ASSIGNED` — только назначенные подразделения/проекты
- `SELF` — только собственные записи
- `NONE` — без ограничения по scope

### Безопасность

- Middleware (`proxy.ts`) выполняет раннее перенаправление; Server Components и API повторно проверяют пользователя в PostgreSQL
- Мутации требуют допустимую роль и same-origin
- Пароли — **Argon2id**
- Блокировка после 5 неверных попыток на 15 минут
- JWT-сессии с максимальным временем жизни 8 часов
- Versioned sessions (`sessionVersion`) — мгновенная инвалидация при смене пароля или деактивации
- Audit log с `requestId` для сквозной трассировки
- Health endpoints: `GET /api/health/live`, `GET /api/health/ready`

---

## Ежедневная разработка

### Управление локальной БД

```bash
# Поднять PostgreSQL
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres

# Состояние и логи
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f postgres

# Запустить приложение
npm run dev

# Остановить/запустить без удаления данных
docker compose -f docker-compose.yml -f docker-compose.dev.yml stop postgres
docker compose -f docker-compose.yml -f docker-compose.dev.yml start postgres

# Удалить контейнеры, сохранив данные
docker compose -f docker-compose.yml -f docker-compose.dev.yml down

# Полный сброс (необратимо!)
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
npm run db:migrate:deploy
npm run db:seed
```

Dev-overlay публикует PostgreSQL на хосте. Не подключайте `docker-compose.dev.yml` в production.

### Seed и администратор

```bash
npm run db:seed              # демо-данные (upsert, безопасно перезапускать в dev)
npm run user:create-admin    # интерактивное создание (TTY, пароль скрыт)
npm run db:verify            # проверка целостности данных
```

`db:verify` проверяет:
- равенство суммы `AssetHolding.quantity` общему `Asset.quantity`
- отсутствие отрицательных количеств и стоимостей
- отсутствие orphan relations
- отсутствие секретов в audit JSON

---

## Prisma и миграции

Схема: `prisma/schema.prisma`. Миграции: `prisma/migrations/`.

### Применить существующие миграции

```bash
npm ci
npm run db:generate
npm run db:migrate:deploy    # безопасно для CI и production
```

### Создать новую миграцию

```bash
# 1. Измените prisma/schema.prisma
# 2. Создайте и примените миграцию
npm run db:migrate -- --name add_asset_location

# 3. Проверьте
npm run db:generate
npm run db:verify
npm run check

# 4. Закоммитьте изменения
```

Имя миграции — `snake_case`, описывает изменение: `add_employee_department`, `make_contract_code_optional`.

### Миграция с ручным SQL

```bash
npm run db:migrate -- --name backfill_asset_holdings --create-only
# Отредактируйте migration.sql
npm run db:migrate
npm run db:verify
```

Для опасных изменений используйте **expand/contract**: добавьте новые nullable-поля, совместимый код, backfill, а удаление старых полей вынесите в отдельный релиз.

### Полезные команды

```bash
npm run db:generate              # перегенерировать Prisma Client
npm run db:studio                # открыть Prisma Studio
npx prisma migrate status        # состояние миграций
npx prisma migrate reset         # полный сброс (только dev!)
```

> **Не используйте** `prisma db push` вместо миграций. Не изменяйте уже применённые `migration.sql` — оформляйте исправления новой миграцией.

---

## Тестирование

### Unit и integration тесты (Vitest)

```bash
npm test
```

Среда: jsdom. Конфигурация: `vitest.config.ts`.

### E2E тесты (Playwright)

```bash
# Установить браузер (первый раз)
npx playwright install chromium

# Рекомендуется отдельная тестовая БД
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec postgres \
  createdb -U project1 project1_test

DATABASE_URL="postgresql://project1:<пароль>@localhost:5434/project1_test" \
  npm run db:migrate:deploy

DATABASE_URL="postgresql://project1:<пароль>@localhost:5434/project1_test" \
PLAYWRIGHT_BASE_URL="http://127.0.0.1:3001" \
  npm run test:e2e
```

E2E создаёт пользователей `e2e-admin`, `e2e-viewer` и тестовые записи. Не запускайте с production `DATABASE_URL`.

### Полный CI-набор

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

Сокращённая команда (lint + typecheck + tests + build):

```bash
npm run check
```

---

## Команды npm

| Команда | Назначение |
| --- | --- |
| **Разработка** | |
| `npm run dev` | dev-сервер (порт 3001) |
| `npm run dev:turbo` | dev-сервер с Turbopack |
| `npm run dev:webpack` | dev-сервер с Webpack |
| `npm run dev:reset` | очистить кеш и запустить dev |
| **Сборка** | |
| `npm run build` | production build |
| `npm run build:clean` | очистить кеш + build |
| `npm run start` | запустить production build |
| `npm run start:prod` | очистить + собрать + запустить |
| `npm run clean:next` | удалить `.next`, `.next-dev`, `.next-dev-turbo` |
| **Проверки** | |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript `--noEmit` |
| `npm test` | Vitest |
| `npm run test:e2e` | Playwright |
| `npm run check` | lint + typecheck + tests + build |
| **База данных** | |
| `npm run db:generate` | Prisma Client |
| `npm run db:migrate` | создать/применить dev-миграцию |
| `npm run db:migrate:deploy` | применить готовые миграции |
| `npm run db:studio` | Prisma Studio |
| `npm run db:seed` | демо-данные |
| `npm run db:verify` | проверка целостности |
| **Администрирование** | |
| `npm run user:create-admin` | создать ADMIN-пользователя |

---

## Docker и production

### Локальная проверка production Docker

```bash
docker compose config          # проверить итоговую конфигурацию (не публикуйте!)
docker compose build
docker compose up -d
docker compose ps
```

Compose запускает сервисы по порядку:

1. **`postgres`** — PostgreSQL 15 с постоянным volume
2. **`migrate`** — одноразовый контейнер `prisma migrate deploy`
3. **`app`** — production Next.js (после успешных миграций)

`Exited (0)` у `migrate` — нормально.

```bash
docker compose logs --tail=100 migrate
docker compose logs -f app
curl --fail http://127.0.0.1:3001/api/health/live    # процесс отвечает
curl --fail http://127.0.0.1:3001/api/health/ready   # подключение к БД
```

### Production: подготовка

На сервере: Docker Engine + Docker Compose v2. Разворачивайте из проверенного commit/tag.

```bash
cp .env.example .env
chmod 600 .env
```

Обязательно:

- `POSTGRES_PASSWORD` — длинный уникальный пароль
- `NEXTAUTH_SECRET` — минимум 32 символа
- `NEXTAUTH_URL` и `NEXT_PUBLIC_APP_URL` — одинаковый HTTPS origin
- `APP_PORT=127.0.0.1:3001` — ограничить loopback (если reverse proxy на том же сервере)
- Не подключайте `docker-compose.dev.yml`
- TLS — на reverse proxy, проксируйте на `127.0.0.1:3001`

### Production: первый запуск

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 migrate
docker compose logs --tail=100 app
curl --fail http://127.0.0.1:3001/api/health/live
curl --fail http://127.0.0.1:3001/api/health/ready
```

Создание первого администратора:

```bash
docker compose run --rm -it \
  -v "$PWD/src:/app/src:ro" \
  -v "$PWD/scripts:/app/scripts:ro" \
  migrate npm run user:create-admin
```

**Не запускайте `db:seed` в production.**

### Production: backup

Перед каждой миграцией:

```bash
BACKUP_FILE="/srv/project1/dumps/project1-$(date +%F-%H%M%S).dump"
docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$BACKUP_FILE"
test -s "$BACKUP_FILE"
ls -lh "$BACKUP_FILE"
```

Храните копии вне сервера. Регулярно проверяйте восстановление.

### Production: обновление

1. Включить maintenance mode
2. Создать и проверить backup
3. Получить проверенный commit/tag
4. Собрать и запустить:

```bash
docker compose build
docker compose up -d
```

5. Проверить:

```bash
docker compose logs --tail=100 migrate
docker compose ps
curl --fail http://127.0.0.1:3001/api/health/live
curl --fail http://127.0.0.1:3001/api/health/ready
```

6. Проверка данных:

```bash
docker compose run --rm \
  -v "$PWD/src:/app/src:ro" \
  -v "$PWD/scripts:/app/scripts:ro" \
  migrate npm run db:verify
```

7. Smoke-тест → отключить maintenance mode

### Production: восстановление из backup

```bash
docker compose stop app migrate
docker compose exec -T postgres sh -c \
  'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  < /srv/project1/dumps/project1-YYYY-MM-DD-HHMMSS.dump
docker compose up -d migrate app
```

После восстановления: проверить логи migrate, `db:verify`, health → smoke-тест → открыть доступ.

---

## Rollout AssetHolding

**Release A:**
1. Maintenance mode + backup
2. Additive-миграция пользователей и `AssetHolding`
3. `npm run db:verify` + smoke/E2E
4. Открыть доступ (legacy `Asset.molId` остаётся для rollback)

**Release B** (после стабильного периода):
1. Backup + `db:verify`
2. Удалить legacy `Asset.molId` отдельной миграцией
3. Полный CI + smoke-тесты

При ошибке Release A: доступ не открывается, контейнеры останавливаются, база восстанавливается из backup.

---

## Структура репозитория

```
prisma/                     схема, миграции и dev seed
scripts/                    admin-скрипты и проверки БД
src/
├── app/
│   ├── (auth)/             логин
│   ├── (app)/(main)/       основные страницы
│   │   ├── assets/         имущество
│   │   ├── employees/      сотрудники
│   │   ├── projects/       проекты
│   │   ├── finance/        финансы
│   │   ├── procurement/    закупки
│   │   ├── documents/      документы
│   │   ├── approvals/      согласования
│   │   ├── timekeeping/    табель
│   │   ├── reports/        отчётность
│   │   ├── notifications/  уведомления
│   │   └── admin/          администрирование
│   └── api/                REST API endpoints
├── features/               бизнес-модули
│   ├── assets/             contracts, domain, application, infrastructure, ui
│   ├── employees/          contracts, domain, application, infrastructure, ui
│   ├── projects/           contracts, domain, application, ui
│   ├── finance/            contracts, domain, application, ui
│   ├── procurement/        contracts, application, ui
│   ├── documents/          contracts, domain, application, infrastructure, ui
│   ├── approvals/          contracts, application, ui
│   ├── notifications/      contracts, application, ui
│   ├── timekeeping/        contracts, domain, application, ui
│   ├── departments/        contracts, application, ui
│   ├── reporting/          contracts, domain, application, ui
│   ├── exports/            application
│   └── users/              application
├── components/             общий UI-kit, layout, навигация
├── lib/                    auth, DB, HTTP, logger, errors
└── types/                  TypeScript декларации
e2e/                        Playwright E2E тесты
.github/workflows/ci.yml   CI pipeline
Dockerfile                  multi-stage production image
docker-compose.yml          production topology
docker-compose.dev.yml      dev-overlay (порт PostgreSQL)
```
