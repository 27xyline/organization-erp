# Frontend

Next.js-интерфейс проекта: страницы, серверный рендеринг и маршруты `/api/*`, которые передают запросы браузера в FastAPI. Доступ к базе данных, сессии и бизнес-правила принадлежат backend.

## Требования

- Node.js 22 или новее.
- npm.
- Запущенный FastAPI на `http://localhost:8000`.

## Локальный запуск

Если backend и PostgreSQL ещё не запущены, из корня репозитория подготовьте `.env`, задайте `BACKEND_CSRF_SECRET` (значение можно получить командой `openssl rand -hex 32`) и поднимите backend с зависимостями:

```sh
cp .env.example .env
docker compose up --build -d backend
```

Затем из `frontend/` установите зависимости и запустите Next.js:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Откройте [http://localhost:3001](http://localhost:3001). Настройки в `frontend/.env.local` содержат только URL; секрет CSRF и подключение к базе настраиваются для Python backend.

Чтобы вместо локального Next.js запустить всё приложение в контейнерах, смотрите [корневой README](../README.md).

## Проверки

Команды выполняются из `frontend/`:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

CI проверяет зависимости приложения и инструменты разработки. В `package.json` закреплены
исправленные транзитивные версии `deepmerge-ts` для Prisma и `postcss-selector-parser`
для Tailwind/PostCSS через `overrides`. После обновления Prisma или Tailwind проверьте,
нужны ли ещё эти переопределения; совместимость проверяется сборкой и E2E-тестами.

## Браузерные тесты

Тесты Playwright находятся в `e2e/` и запускаются командой `npm run test:e2e`. Она генерирует Prisma Client только для тестовых фикстур; Prisma не используется приложением при запуске, сборке или миграциях.

Для E2E нужна отдельная база PostgreSQL `organization_erp_e2e`: переменные `DATABASE_URL` и `E2E_DATABASE_URL` должны указывать на неё, а `BACKEND_CSRF_SECRET` должен содержать не менее 32 байт. Не запускайте E2E против локальной или рабочей базы приложения. Playwright сам запускает Next.js и FastAPI для тестов.

Общие инструкции по проекту — в [корневом README](../README.md), по API и миграциям — в [README backend](../backend/README.md).

Для проверки production-сборки вместо dev-сервера:

```sh
npm run build
PLAYWRIGHT_PRODUCTION=1 npm run test:e2e
```

CI использует этот режим после сборки. В dev-режиме жёсткая навигация браузера
может отменять RSC-ответы; Next.js тогда пишет сообщение об оборванном потоке.
Проверка production-сборки позволяет отличить такой диагностический шум от
сбоев пользовательских сценариев.
