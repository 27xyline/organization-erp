# Project1

Основное приложение в этом репозитории находится в [`mc-accounting`](./mc-accounting).

Это внутренняя система учета для:

- имущества и материальных ценностей;
- МОЛ и групп имущества;
- сотрудников, кадровых действий, отпусков и штатного расписания;
- проектов, задач и Gantt-представления;
- финансового планирования по сотрудникам и проектам;
- экспорта данных в Excel.

## Технологии

- Next.js 14 (`App Router`)
- React 18
- TypeScript
- Prisma ORM
- PostgreSQL
- NextAuth (`CredentialsProvider`)
- Zod
- Tailwind CSS
- Vitest

## Структура репозитория

```text
.
├── mc-accounting/           # основное приложение
│   ├── package.json
│   ├── prisma/
│   ├── src/
│   └── start.js
└── README.md                # этот файл
```

`mc-accounting/package.json` является главным manifest-файлом приложения. Все команды ниже нужно выполнять из каталога [`mc-accounting`](./mc-accounting).

## Что умеет система

### Имущество

- карточки активов с инвентарными номерами, статусами и документами;
- МОЛ, группы имущества, история операций;
- архив активов;
- экспорт имущества и операций в `.xlsx`.

### Проекты

- карточки проектов;
- древовидные задачи с датами, прогрессом и статусами;
- участники проекта (`ProjectMember`);
- исполнители задач (`TaskAssignee`);
- Gantt-представление.

### Сотрудники и HR

- справочник сотрудников;
- штатное расписание;
- кадровые действия;
- отпуска и отсутствия;
- архив сотрудников.

### Финансы

- расчет зарплаты;
- планирование оклада;
- планирование надбавок;
- привязка финансовых планов к сотруднику и при необходимости к проекту.

## Архитектура

- UI построен на `App Router`-страницах в [`mc-accounting/src/app`](./mc-accounting/src/app).
- HTTP API находится в [`mc-accounting/src/app/api`](./mc-accounting/src/app/api).
- Доменные правила и сервисы вынесены в [`mc-accounting/src/lib/services`](./mc-accounting/src/lib/services).
- Валидация входных данных сосредоточена в [`mc-accounting/src/lib/schemas`](./mc-accounting/src/lib/schemas) и [`mc-accounting/src/lib/validations.ts`](./mc-accounting/src/lib/validations.ts).
- Prisma-схема и миграции лежат в [`mc-accounting/prisma`](./mc-accounting/prisma).

Текущая структура проекта уже ориентирована на подход "тонкие route handlers + логика в service-слое". При расширении системы лучше сохранять этот принцип.

## Требования

- Node.js 18+;
- npm;
- Docker Desktop для стандартного локального запуска;
- PostgreSQL 14+ при запуске без Docker.

## Быстрый старт

1. Перейдите в каталог приложения:

```bash
cd mc-accounting
```

2. Создайте локальный `.env` из шаблона:

```bash
cp .env.example .env
```

Шаблон [`mc-accounting/.env.example`](./mc-accounting/.env.example) настроен на отдельный локальный PostgreSQL-контейнер этого проекта:

```env
DATABASE_URL="postgresql://mc_accounting:mc_accounting_dev@localhost:5434/mc_accounting"
```

3. Запустите локальную базу:

```bash
docker compose up -d
```

Compose-файл [`mc-accounting/docker-compose.yml`](./mc-accounting/docker-compose.yml) создает отдельный контейнер `mc-accounting-postgres`, базу `mc_accounting` и пробрасывает PostgreSQL на `localhost:5434`. Это не использует общий локальный PostgreSQL на `5432` и не конфликтует с другими проектами на `5433`.

4. Установите зависимости:

```bash
npm install
```

Полный шаблон `.env` содержит переменные для PostgreSQL, NextAuth, локального URL приложения, credentials-login и Yandex.Disk OAuth:

```env
DATABASE_URL="postgresql://mc_accounting:mc_accounting_dev@localhost:5434/mc_accounting"
YANDEX_CLIENT_ID="your_yandex_client_id"
YANDEX_CLIENT_SECRET="your_yandex_client_secret"
YANDEX_REDIRECT_URI="http://localhost:3000/api/auth/yandex/callback"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
PORT=3000
NEXTAUTH_SECRET="change-me"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin"
```

Для обычной локальной разработки через Docker достаточно заменить `NEXTAUTH_SECRET`, `ADMIN_USERNAME` и `ADMIN_PASSWORD` под свое окружение. Yandex-переменные нужны только если используется интеграция с Yandex.Disk.

Если вы запускаете без Docker и используете свой локальный PostgreSQL, задайте собственную строку подключения и заранее создайте базу `mc_accounting`, например:

```env
DATABASE_URL="postgresql://<local-postgres-user>@localhost:5432/mc_accounting"
```

5. Подготовьте Prisma Client и базу:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

6. Запустите приложение:

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000) и войдите с логином/паролем из `ADMIN_USERNAME` и `ADMIN_PASSWORD`.

## Команды

### Разработка

```bash
npm run dev
npm run dev:turbo
npm run dev:webpack
npm run dev:reset
```

### Локальная проверка production-сборки

```bash
npm run build
npm run start
```

Полный безопасный сценарий локальной проверки:

```bash
npm run start:prod
```

Если артефакты `.next` отсутствуют или неполные, [`mc-accounting/start.js`](./mc-accounting/start.js) автоматически пересоберет приложение перед `next start`.

### База данных

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
npm run db:seed
```

### Проверки

```bash
npm run lint
npx tsc --noEmit
npx vitest run
```

Примечание: отдельного `npm test` скрипта сейчас нет.

## Данные, которые создает seed

[`mc-accounting/prisma/seed.ts`](./mc-accounting/prisma/seed.ts) создает стартовые справочники и примеры:

- 2 МОЛ;
- 4 группы имущества;
- несколько тестовых активов.

Seed не создает сотрудников, проекты, задачи или payroll-данные, поэтому эти разделы после первого запуска потребуется заполнять вручную.

## Аутентификация и доступ

- Используется `NextAuth` с `CredentialsProvider`.
- Учетные данные берутся из `ADMIN_USERNAME` и `ADMIN_PASSWORD`.
- Все страницы и почти все API защищены middleware из [`mc-accounting/src/middleware.ts`](./mc-accounting/src/middleware.ts).
- Страница входа: `/login`.

Важно: это упрощенная внутренняя auth-схема. Она подходит для локальной разработки и закрытого внутреннего контура, но не является production-grade решением для внешнего доступа.

## Основные разделы интерфейса

- `/` — реестр имущества;
- `/groups` — группы имущества;
- `/archive` — архив активов;
- `/projects` — проекты;
- `/employees` — сотрудники;
- `/employees/archive` — архив сотрудников;
- `/mols` — материально ответственные лица;
- `/finance/salary` — расчет зарплаты;
- `/finance/oklad` — планирование оклада;
- `/finance/nadbavka` — планирование надбавок.

Часть пунктов бокового меню помечена как `скоро` и пока не реализована как полноценный workflow.

## API и тесты

В проекте есть route-level и service-level тесты, в том числе для:

- сотрудников;
- финансовых планов;
- кадрового домена;
- задач проекта;
- участников проекта;
- payroll по проекту.

Ключевые тестовые файлы находятся в:

- [`mc-accounting/src/lib/services/__tests__`](./mc-accounting/src/lib/services/__tests__);
- [`mc-accounting/src/app/api`](./mc-accounting/src/app/api).

## Известные ограничения

- Проект сейчас описан и настроен в первую очередь под локальную разработку.
- Авторизация построена на одном наборе credentials из env.
- Часть меню еще не реализована.
- В репозитории нет корневого `package.json`; рабочий пакет находится в `mc-accounting`.

## Локальные operational notes

- Для локальной production-проверки используйте один origin: `http://localhost:3000`.
- Если после `npm start` приложение ведет себя некорректно, сначала пересоберите его через `npm run build:clean` или `npm run start:prod`.
- При проблемах со входом очистите cookies для `localhost`, особенно если до этого приложение запускалось на другом origin.
- Перед внесением изменений в Prisma-схему создавайте новую миграцию и проверяйте, что seed и route handlers остаются совместимыми.

## Разработка дальше

Если проект будет передаваться другому разработчику как рабочая система, первыми улучшениями стоит сделать:

1. заменить credentials-only auth на нормальную схему пользователей и ролей;
2. формализовать роли и права на уровне API;
3. добавить CI-команду с единым `test` script;
4. описать deployment-процесс, когда проект выйдет за рамки локальной разработки;
5. поддерживать корень репозитория как документационный уровень, а код приложения держать в `mc-accounting`.
