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
- PostgreSQL 14+.

## Быстрый старт

1. Перейдите в каталог приложения:

```bash
cd mc-accounting
```

2. Установите зависимости:

```bash
npm install
```

3. Создайте файл `.env` в каталоге [`mc-accounting`](./mc-accounting).

В репозитории сейчас нет `.env.example`, поэтому используйте такой минимальный локальный конфиг:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mc_accounting"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
PORT=3000
NEXTAUTH_SECRET="change-me-to-a-long-random-string"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin"
```

4. Подготовьте Prisma Client и базу:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

5. Запустите приложение:

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

### Production-режим локально

```bash
npm run build
npm run start
```

Полный безопасный сценарий проверки production-сборки:

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

- Файл `.env.example` отсутствует, конфиг нужно создавать вручную.
- Авторизация построена на одном наборе credentials из env.
- Часть меню еще не реализована.
- В репозитории нет корневого `package.json`; рабочий пакет находится в `mc-accounting`.

## Operational notes

- Для локальной production-проверки используйте один origin: `http://localhost:3000`.
- Если после `npm start` приложение ведет себя некорректно, сначала пересоберите его через `npm run build:clean` или `npm run start:prod`.
- При проблемах со входом очистите cookies для `localhost`, особенно если до этого приложение запускалось на другом origin.
- Перед внесением изменений в Prisma-схему создавайте новую миграцию и проверяйте, что seed и route handlers остаются совместимыми.

## Разработка дальше

Если проект будет передаваться другому разработчику как рабочая система, первыми улучшениями стоит сделать:

1. добавить реальный `.env.example`;
2. заменить credentials-only auth на нормальную схему пользователей и ролей;
3. формализовать роли и права на уровне API;
4. добавить CI-команду с единым `test` script;
5. поддерживать корень репозитория как документационный уровень, а код приложения держать в `mc-accounting`.
