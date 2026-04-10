# `mc-accounting`

Внутренняя система для учета материальных ценностей, кадровых данных, отпусков, проектных задач и планирования начислений по проектам.

## Стек

- Next.js 14 (`App Router`)
- React 18
- Prisma + PostgreSQL
- Zod
- Tailwind CSS
- NextAuth (credentials login)
- Vitest

## Что есть в системе

- Учет МОЛ, групп имущества и карточек активов
- Операции по активам: приход, передача, списание, архив
- Проекты с задачами и Gantt-представлением
- Кадровый раздел: сотрудники, штатное расписание, кадровые действия, архив, отпуска
- Финансовые разделы:
  - автоматический расчет заработной платы
  - планирование оклада по проектам
  - планирование надбавок по проектам
- Экспорт данных
- Базовая авторизация для внутреннего использования

## Требования

- Node.js 18+
- PostgreSQL 14+
- npm

## Установка

```bash
npm install
```

Создайте `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Минимальный локальный конфиг:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mc_accounting"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
PORT=3000
NEXTAUTH_SECRET="change-me"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin"
```

## База данных

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

## Запуск

### Dev

```bash
npm run dev
```

### Local production

Канонический локальный адрес для production-проверки: `http://localhost:3000`.

Нормальный сценарий:

```bash
npm run start:prod
```

То же самое вручную:

```bash
npm run build:clean
npm start
```

`npm start` сам по себе не пересобирает приложение. Он поднимает уже существующую `.next`-сборку, поэтому после изменений кода или `.env` сначала нужен новый `npm run build` или `npm run build:clean`.

Если нужна полностью чистая production-проверка без старых артефактов:

```bash
npm run prod:reset
npm run start:prod
```

## Полезные команды

```bash
npm run lint
npx tsc --noEmit
npx vitest run
```

## Если `npm start` запускает сайт, но он не работает

Проверьте по порядку:

1. Вы открыли сайт именно на `http://localhost:3000`, а не на другом порту или старой вкладке `127.0.0.1:3001`.
2. Перед `npm start` был выполнен свежий `npm run build` или `npm run build:clean`.
3. В `.env` согласованы `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL` и `PORT`.
4. В браузере нет старых cookies `next-auth.callback-url` и `next-auth.session-token` от другого origin. Если есть сомнения, очистите cookies для `localhost` и войдите заново.

Локальный логин и logout поддерживают `localhost` и `127.0.0.1`, но production-конфиг в проекте считается каноническим для `http://localhost:3000`.

## Структура

```text
src/
  app/
    api/                 HTTP routes
    employees/           кадровый интерфейс
    finance/             зарплата / оклад / надбавка
    projects/            проекты и задачи
    assets/              активы
  components/
    employees/           UI блоки кадрового раздела
    finance-plan/        table / dialog / hooks для планирования начислений
    ui/                  базовые UI-компоненты
  lib/
    schemas/             Zod-схемы
    services/            domain/service-логика
    normalize.ts         преобразование API payload -> client types
prisma/
  schema.prisma
  migrations/
```

## Аутентификация

Сейчас используется `NextAuth` с `CredentialsProvider` и учетными данными из переменных окружения. Это решение подходит для внутреннего контура и локальной разработки, но не является production-grade auth.

## Текущее состояние

Проект ориентирован на внутреннюю эксплуатацию. В кодовой базе уже есть существенная бизнес-логика по HR и finance workflows; при дальнейших изменениях рекомендуется держать transport-слой тонким, а правила валидации и расчета концентрировать в `src/lib/services`.
