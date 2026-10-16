# Stage 07: проверка переноса имущества

Срез 16 октября 2026. Публичные asset APIs и SSR используют FastAPI через BFF без Prisma fallback. Локальные Stage 07 проверки завершены; удалённый CI не запускался.

## Изоляция и границы

- Зафиксирован исходный `HEAD` `6a7b63a` в архиве `/private/tmp/organization-erp-stage07-baseline.tar`, вне репозитория и вне путей поиска Vitest.
- Все runtime env-файлы и логи находятся в игнорируемом `.runtime/stage07/`; секреты и DSN в отчёт не копируются. Пользовательские `next-env.d.ts` и `tsconfig.json` сверены с защищёнными SHA-256 `d55d89a99f49bee7df149125eb311367460827b1d986ae98ca312c9e10caa478` и `3336d447bca5f48a2614cc5b4636c10178f0bfcce92c6fc277fe66f35087f885`.
- Базы `erp_stage07_test`, `erp_stage07_e2e` и `erp_stage07_legacy` выделены для этапа. Проверка копирования выявила, что первичные копии унаследовали seed rows; эта первая zero-row запись была false green. Seed rows удалены только в приватных Stage 07 копиях, после чего повторно подтверждены 52 публичные таблицы и 0 строк в каждой. `project1`, миграционный источник и Stage 06 БД не использовались как targets.
- Stage 07 не запускал миграции, worker, SMTP, реальные email или удалённый CI. Для app image использован Docker target `runner`. Финальные smoke контейнеры и сеть/volume удалены; PostgreSQL и его volume оставлены запущенными.

## Проверки

- TypeScript `tsc --noEmit --incremental false`: passed. Полный Vitest: 95 файлов passed, 2 skipped; 273 passed, 5 skipped. Изменённые TypeScript файлы проходят ESLint.
- Host Webpack production build прошёл до последнего date helper и собрал 48 static pages. После date helper production build внутри финального app Docker `runner` image прошёл. Финальный backend production image также собран.
- Legacy capture выполнен на изолированной `erp_stage07_legacy`: 46 вызовов и 14 audit payloads. Golden replay проверил 31 success DTO shape, 42 фактических HTTP status assertions из 43 записанных status contracts (login 200 исключён при dependency override), оба binary header contracts, persisted state, все поля 14 audit payloads и outbox delta 0; replay с import unit tests: 5 passed. Два некорректных nonempty date payloads дали legacy HTTP 500; BFF сохраняет это поведение. Legacy assets/operations export endpoints также дали 500 из-за getter-only `WorksheetWriter.views`; Python XLSX 200 — намеренное исправление этой ошибки.
- Полный PostgreSQL pytest suite: 215 passed. Ruff check для app/tests, format check для 196 файлов, mypy для 130 app файлов и `uv lock --check` для 65 packages прошли. После усиления тестовых сравнений boolean/integer и inventory summary affected strict replay повторно прошёл: 1 passed; production код не менялся.
- Полный Playwright: 10 passed. Новый сценарий transfer → inventory create/scan/complete → archive/restore → scoped denial прошёл.
- Оба smoke env privately проверены на одинаковую БД `erp_stage07_e2e`. Node и Python live/ready вернули HTTP 200; из app контейнера запрос к backend live endpoint вернул 200. Пользователь контейнера nextjs (uid 1001) записал и удалил probe в отдельном пустом documents volume. Контейнеры, private network и volume после этого удалены; PostgreSQL оставлен запущенным.
- После Next build защищённые SHA-256 восстановлены/подтверждены: `next-env.d.ts` — `d55d89a99f49bee7df149125eb311367460827b1d986ae98ca312c9e10caa478`; `tsconfig.json` — `3336d447bca5f48a2614cc5b4636c10178f0bfcce92c6fc277fe66f35087f885`.
- Remote CI не запускался.

## Область parity и известные ограничения

Live legacy capture и golden replay подтвердили route ответы, persisted state и audit payloads. Legacy date 500 поведение сохраняется для malformed nonempty strings; valid JS dates сериализуются в ISO, а planned empty/null передаются как null.

Legacy assets/operations XLSX не выдавал пригодный файл: исходный TypeScript writer падал при присваивании `worksheet.views`. Поэтому точное бинарное равенство с legacy невозможно; Python exporter корректно возвращает XLSX и сохраняет MIME/disposition и содержательную семантику.

## CI isolation

CI подготавливает отдельные `erp_stage07_test` и `erp_stage07_e2e` копии, очищает только эти копии и передаёт один URL Node и Python в browser suite. Remote GitHub Actions не запускался.
