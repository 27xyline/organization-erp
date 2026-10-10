# Владельцы API и данных после этапа 03

Этап 03 переносит авторизацию и управление пользователями на FastAPI. Это переходный срез: Python является владельцем операций, явно перечисленных ниже, а остальные бизнес-модули пока продолжают работать через Next.js/Prisma.

| Область | Владелец | Граница |
| --- | --- | --- |
| Проверка пароля, нормализация логина, блокировка и сброс счетчиков входа | Python | Внутренний `POST /api/internal/auth/credentials`; секрет сервиса передает только Next.js сервер. |
| Создание/изменение пользователя, ролей и scopes, деактивация, смена пароля | Python | `POST /api/users`, `PATCH /api/users/{id}`, `POST /api/account/password`. Старые TS/Prisma user/password writers удалены. |
| Проверка RBAC/scopes и актуального `sessionVersion` на перенесенных user API | Python | Каждый bridged API-запрос повторно загружает actor и права из общей БД. |
| Аудит и notification intents этих мутаций | Python | Запись выполняется в той же UoW/транзакции; доставка остаётся за существующим TS worker. |
| Список пользователей и справочники на странице администратора | Python | SSR вызывает `GET /api/users` и `GET /api/users/references`. |
| Browser cookie/session lifecycle и sign-in/sign-out | NextAuth | Браузерная сессия продолжает использовать NextAuth JWE. Credentials provider делегирует проверку Python; локального password fallback нет. |
| Переходный session/permission guard для Next.js и неперенесенных модулей | Next.js/Prisma | `requireUser()` выполняет read-only actor/scope lookup и сверяет `isActive` и `sessionVersion` из JWE с БД. Эта проверка пока не вызывает Python actor endpoint. |
| Остальные бизнес API, SSR, worker delivery и DDL | Next.js/Prisma | Не переносились в Stage 03; Prisma остаётся владельцем DDL до этапа 14. |

## Bridge и публичный контракт

- Browser-вызовы к перенесённым маршрутам остаются на существующих Next.js URL. Next.js проверяет сессию, Origin, forced-password restriction и локальные permissions, затем передает фиксированный путь в Python.
- `GET/POST /api/users`, `PATCH /api/users/{id}` и `POST /api/account/password` сохраняют существующие формы ответа и статус коды. `GET /api/users/references` — новый внутренний маршрут данных для SSR формы; наружу он доступен через Next.js BFF.
- Actor bridge — HS256 JWT с `iss=erp-next`, `aud=erp-python`, `sub`, `sessionVersion`, `iat` и сроком ровно 60 секунд. Подпись использует отдельный `BACKEND_BRIDGE_SECRET` длиной не менее 32 байт. `BACKEND_INTERNAL_AUTH_SECRET` — отдельный bearer ключ credentials endpoint; `NEXTAUTH_SECRET` не используется для межсервисной подписи.
- Перед отправкой запроса BFF удаляет browser `cookie` и `authorization`, создаёт собственный bridge bearer и сохраняет query, method, body, request ID и `traceparent`. Backend URL задаётся серверным `BACKEND_BASE_URL`, не берётся из запроса клиента. Ответ передаётся потоково с сохранением статуса и безопасного набора заголовков; авторизованные ответы получают `Cache-Control: private, no-store`.
- Python повторно проверяет пользователя, активность, версию сессии, permission и scopes. TS precheck остаётся защитой переходного браузерного слоя, а не заменой backend authorization.

Все перечисленные backend secrets обязательны для соответствующего auth-пути и fail closed при отсутствии/некорректной длине. Ошибка или timeout backend не переключает авторизацию/запись обратно на Prisma. Точные local env values хранятся только в ignored `.runtime/stage03/` файлах; см. [проверки и runbook](stage03-validation.md).
