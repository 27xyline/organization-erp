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

Создайте `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mc_accounting"
NEXTAUTH_SECRET="change-me"
NEXTAUTH_URL="http://localhost:3000"
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

```bash
npm run dev
```

Production build:

```bash
npm run build
npm start
```

## Полезные команды

```bash
npm run lint
npx tsc --noEmit
npx vitest run
```

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
