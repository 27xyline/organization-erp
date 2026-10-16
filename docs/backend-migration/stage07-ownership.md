# Владение Stage 07: имущество и учёт остатков

Рабочий срез 16 октября 2026. Браузер сохраняет прежние `/api/*` URL и форму ответов. Next.js остаётся аутентифицированной BFF-границей: session, Origin, Zod и существующие permission/resource prechecks выполняются до проксирования; Python независимо проверяет actor, права и scope. Все перечисленные публичные API и SSR reads принадлежат FastAPI. При timeout или недоступности backend BFF возвращает ошибку и не включает Prisma fallback.

| Путь | Методы и владелец | Контракт и границы |
| --- | --- | --- |
| `/api/assets` | GET, POST → FastAPI | Фильтры, aliases query и legacy envelopes сохранены; JSON валидируется из clone тела запроса до proxy. |
| `/api/assets/{id}` | GET, PUT → FastAPI | Старые resource/department prechecks сохранены, backend повторяет scope validation. |
| `/api/assets/{id}/archive`, `/restore` | POST → FastAPI | Lifecycle status и прежние JSON responses. |
| `/api/assets/{id}/transfers`, `/disposals` | POST → FastAPI | Передача и списание проверяются обеими границами; quantity semantics принадлежат Python. |
| `/api/assets/{id}/maintenance` | GET, POST → FastAPI | Read/create с legacy envelopes и status. |
| `/api/assets/{id}/maintenance/{maintenanceId}` | PUT → FastAPI | Resource authorization и update schema до proxy. |
| `/api/assets/{id}/qr` | GET → FastAPI | SVG stream сохраняет MIME/headers; BFF передаёт браузерный origin как `origin` query. |
| `/api/assets/saved-views`, `/api/assets/saved-views/{id}` | GET, POST, DELETE → FastAPI | Фильтры и persisted view принадлежит asset service; прежняя auth и validation границы остаются в Next.js. |
| `/api/assets/inventories`, `/options`, `/resolve` | GET, POST → FastAPI | Список, создание и scanner options/resolution сохраняют старый response shape. |
| `/api/assets/inventories/{id}`, `/act` | GET → FastAPI | Act DTO, включая decimal-string `differenceQuantity` или `null`, приходит из Python. |
| `/api/assets/inventories/{id}/scan`, `/complete` | POST → FastAPI | Scan/complete lifecycle исполняется в Python. |
| `/api/assets/import/preview` | POST → FastAPI | Multipart upload проксируется без перекодировки body и с исходной boundary; BFF проверяет наличие `.xlsx` и лимит 5 MiB. |
| `/api/assets/import/commit` | POST → FastAPI | JSON schema и индивидуальные MOL department scope prechecks остаются до proxy и совпадают с row-level проверкой Python. |
| `/api/assets/import/template` | GET → FastAPI | XLSX передаётся как бинарный stream с прежним filename. |
| `/api/operations` | GET → FastAPI | Сохранены query validation и permission gate. |
| `/api/export?type=assets\|operations` | GET → FastAPI | XLSX передаётся как stream с прежними `Content-Type` и `Content-Disposition`; прочие типы отклоняются. Legacy TypeScript WorkbookWriter для обоих видов реально отвечал 500: `worksheet.views` является getter-only. Python exporter исправляет этот источник ошибки и сохраняет XLSX семантику; Stage 12 reports сюда не входят. |
| `/assets`, `/assets/{id}`, `/assets/{id}/edit`, `/assets/new`, `/assets/{id}/qr`, `/archive`, `/assets/inventory/{id}/act` | SSR reads → FastAPI | Typed DTO helpers обслуживают list/detail/catalog/saved-view/act страницы. Edit также сохраняет TS read-only resource precheck. |
| `/api/procurement/delivery-items/{id}/capitalize` | Временно TypeScript до Stage 11 | Единственный оставленный внутренний вызов `createTransitionalCapitalizationAsset`. Текущая реализация сначала создаёт asset в отдельной TS транзакции, затем делает procurement update в своей транзакции. Эту существующую двухтранзакционную семантику сохраняем до Stage 11; callback не меняется на HTTP вызов Python и не является публичным asset route. Python `create_asset_in_uow` подготовлен для будущей атомарной передачи владельца в Stage 11. |

Капитализация закупок — единственное оставшееся использование TS asset writer; старые TS asset lifecycle, inventory, import, saved-view и export implementations удалены. Документы остаются отдельным владельцем до Stage 08. Публичные asset readers/writers, включая export и SSR, не должны добавлять новые TS DB paths. Stage 12 report exports и любые неперечисленные маршруты остаются за пределами Stage 07.

Новая браузерная проверка в `e2e/stage07-assets.spec.ts` покрывает transfer → inventory scan/complete → archive/restore, наличие по MOL и scoped denial. Она требует отдельной чистой общей БД `erp_stage07_e2e` для Node и Python.
