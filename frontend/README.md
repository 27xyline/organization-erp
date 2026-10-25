# Клиентская часть — Next.js

Запускайте команды из `frontend/`. Python API должен работать отдельно.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Интерфейс: http://localhost:3001. В `.env.local` находятся только URL; доступ
к БД и секрет подписи CSRF остаются у Python. Next.js обслуживает UI/SSR и
пересылает `/api/*` запросы в FastAPI через BFF.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Браузерные тесты находятся в `e2e/`. `npm run test:e2e` генерирует Prisma client
из `e2e/prisma/schema.prisma` только для тестовых фикстур. Prisma не участвует
в runtime, сборке приложения и миграциях базы.

E2E требует отдельную БД `erp_e2e`, совпадающие `DATABASE_URL` и
`E2E_DATABASE_URL`, а также `BACKEND_CSRF_SECRET` длиной от 32 байт.
Playwright запускает Next.js из этой папки и FastAPI из `../backend/`.
Тестовые документы разрешены только внутри `frontend/.test-data/e2e/`.

Общие инструкции: [README](../README.md), [тестирование](../docs/testing.md).
