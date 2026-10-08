# HTTP-контракты текущего TypeScript backend

Дата фиксации: 2026-10-07. Этот реестр получен статическим анализом в этапе 00. Runtime baseline/DB/E2E описаны в [baseline-validation.md](baseline-validation.md); full HTTP replay всех 148 методов не выполнялся. **102 route.ts, 148 method/route pairs** (GET/POST alias NextAuth входят в число). Это описание текущего поведения, а не новый унифицированный API.

Машинная версия: [api-contracts.json](api-contracts.json). В ней каждый `routes[]` содержит исходный handler с линиями, полные вложенные `payloads[].shape`, входные `schemas`, все `responses`/условия, `behaviorKeys`, scopes/effects evidence. `behaviors` содержит service/serializer/error mapper bodies и зависимости; `schemas` — точные expressions, constraints/defaults/refinements и зависимости. `sourceHashes` позволяет проверить актуальность снимка. JSON не является OpenAPI и не обещает, что статический TS тип уже проверен HTTP-тестом.

По каждой паре ниже приведены отдельные branches. Полные вложенные выходные поля и их nullable/optional/type находятся в разделе «Выходные формы» и JSON. Имя входной схемы всегда ссылается на её развёрнутое определение, включая dependent schemas. `Date` при JSON становится ISO string, Prisma `Decimal` — string; явно вызванные Number/toFixed/toString сохраняют собственный формат. Path параметры обычно просто strings из params без Zod/regex/cuid validation. Неизвестные query/body keys обычно отбрасываются Zod object; `.strict()` — только там, где оно явно показано.

## Общие envelopes и безопасность

- `apiData`: `{data:T}`, default 200; `apiList`: `{data:T[],pagination:{page,pageSize,total,totalPages}}`, `totalPages=max(1,ceil(total/pageSize))`. Runtime spread сохраняет дополнительные поля переданного pagination: employees добавляет scope, projects может добавлять status. `apiError`: `{error:{code,message,fieldErrors?}}`; `apiValidationError`: 422, VALIDATION_ERROR, `error.flatten().fieldErrors` (nested issues теряют глубину). [Исходник](../../src/lib/http/api-response.ts#L4).
- `authorizeApiRequest` проверяет current DB user.isActive и sessionVersion из NextAuth JWT; roles/scopes загружает из roleAssignments, а не доверяет JWT role. Отсутствующая/устаревшая/отозванная сессия: 401 UNAUTHENTICATED. Отсутствующий permission: 403 FORBIDDEN. forced password: 403 PASSWORD_CHANGE_REQUIRED, разрешён только /api/account/password. [Исходник](../../src/lib/auth/authorization.ts#L124).
- Unsafe method с переданным чужим/невалидным Origin: 403 INVALID_ORIGIN; **отсутствующий Origin разрешён**. Общего CSRF-token требования бизнес-route сейчас нет; NextAuth имеет свой CSRF. requestId из входного x-request-id обрезан до 128 или UUID; proxy ставит header request/response. [Guard](../../src/lib/auth/authorization.ts#L264), [proxy](../../src/proxy.ts#L5).
- GET/HEAD/OPTIONS Origin bypass. Proxy исключает api/auth и api/health; остальные API при отсутствующем JWT получают 401 ещё до route. Не каждый success response сам выставляет x-request-id: часть зависит от proxy. [Matcher](../../src/proxy.ts#L50).
- `has(permission)` только проверяет grant role, `allows(permission,target)` дополнительно scope. ASSIGNED department roots расширяются на descendants; SELF employee означает own employee, SELF project — активные memberships. Для department/project все target IDs должны подходить одному grant; asset — любой department ИЛИ project; finance — employee/department И project; document — все присутствующие links, unlinked доступен ADMIN/AUDITOR с ALL/ALL. Полная актуальная матрица ролей/permissions/scopes в [permissions](../../src/lib/auth/permissions.ts#L1), точные predicates/SQL where в [AccessContext](../../src/lib/auth/access-context.ts#L103), helpers [resource scopes](../../src/lib/auth/resource-scopes.ts#L1).
- Каждый `auth.response` branch ниже означает перечисленные общие 401/403. Unmapped exception перекидывается Next.js: не обещаем JSON error envelope для такого 500. JSON.parse без catch в большинстве старых routes тоже не превращается автоматически в 422. В новых routes `.json().catch(()=>null)` обычно приводит к 422; DELETE time-entry catch→{} отличается. Finance/member/payroll raw routes ловят generic errors в своих 500; report custom/preset ловят любые ошибки как 400 Invalid JSON.

## Файлы и NextAuth

**Document upload/version:** raw stream + x-document-metadata=base64url UTF-8 JSON, encoded length <=12000; metadata schema ниже. Optional Content-Length — safe integer >=0; отсутствующий body/metadata или broken JSON — 422. Файл обязан быть непустым; limit default 25 MiB, configurable DOCUMENT_MAX_FILE_SIZE_BYTES 1..100 MiB. Filename normalize NFC/basename/control removal, <=255 после нормализации; extension MIME policy ниже. Size/hash проверяются во время storage streaming. [HTTP adapter](../../src/features/documents/application/http.ts#L25), [policy](../../src/features/documents/domain/file-policy.ts#L62).

Разрешённые extensions/MIME: PDF/application/pdf; DOC/application/msword; DOCX и XLSX — соответствующие OpenXML MIME; XLS/application/vnd.ms-excel; CSV/text/csv|application/csv|application/vnd.ms-excel; TXT/text/plain; PNG/image/png; JPG,JPEG/image/jpeg; ZIP/application/zip|application/x-zip-compressed. Объявленный MIME сравнивается с extension, content magic не даёт отдельной общей проверки. [Точный словарь](../../src/features/documents/domain/document-file-types.ts#L1).

**NextAuth 4.24.15:** два handler aliases обслуживают action/provider segments. GET providers→200 `{credentials:{id,name,type,signinUrl,callbackUrl}}`; GET csrf→200 `{csrfToken}` плюс CSRF cookie; GET session→200 `{user:{name,email?,image?,id,role,roles,username,sessionVersion},expires}` либо `{}`. GET signin→302 `/login?callbackUrl=...&error?`; signout/verify-request/error могут вернуть HTML либо redirects; GET callback/credentials unsupported→500 текст. POST принимает application/json либо application/x-www-form-urlencoded; callback/credentials принимает username/password/csrfToken/callbackUrl/json. Username trim/lowercase 1..100, password 1..512; session JWT maxAge 8h. [Local config](../../src/lib/auth.ts#L22), [body/response adapter](../../node_modules/next-auth/next/utils.js#L33), [dispatch](../../node_modules/next-auth/core/index.js#L144).

POST callback/credentials проверяет CSRF cookie hash и equality body token. Успех→302 callbackUrl и session cookie; неверные credentials/disabled/locked user→redirect CredentialsSignin с внутренним status 401. С `json="true"` adapter заменяет redirect на JSON `{url}` с внутренним status (обычно success 200, failed credentials 401). POST signout требует CSRF, чистит cookie; POST session требует CSRF, возвращает session либо 400 `{}`; `_log` возвращает пустой response (custom logger не настроен). Неизвестное action→400 текст. Config error→500 `{message}` либо HTML/error redirect. [Credentials branch](../../node_modules/next-auth/core/routes/callback.js#L323), [adapter](../../node_modules/next-auth/next/index.js#L50), [CSRF](../../node_modules/next-auth/core/lib/csrf-token.js#L9).

Credentials authorize: 5 failed attempts→lockedUntil +15min; valid login resets attempts/lock and sets lastLoginAt; неизвестный user проверяет dummy hash и возвращает тот же null. Counter read-then-update без row lock. JWT cookies HttpOnly/SameSite=Lax, Secure определяется HTTPS URL, допускаются chunks; session endpoint может refresh cookie без DB revalidation, поэтому бизнес guard отдельно проверяет актуальный DB user. [Config](../../src/lib/auth.ts#L45), [cookies](../../node_modules/next-auth/core/lib/cookie.js#L22).

## Полный реестр методов

| ID | Метод и URL | Handler |
|---|---|---|
| [API-001](#api-001) | `POST /api/account/password` | [src/app/api/account/password/route.ts:7](../../src/app/api/account/password/route.ts#L7) |
| [API-002](#api-002) | `POST /api/approvals/[id]/cancel` | [src/app/api/approvals/[id]/cancel/route.ts:7](../../src/app/api/approvals/%5Bid%5D/cancel/route.ts#L7) |
| [API-003](#api-003) | `POST /api/approvals/[id]/decision` | [src/app/api/approvals/[id]/decision/route.ts:9](../../src/app/api/approvals/%5Bid%5D/decision/route.ts#L9) |
| [API-004](#api-004) | `GET /api/approvals/[id]` | [src/app/api/approvals/[id]/route.ts:8](../../src/app/api/approvals/%5Bid%5D/route.ts#L8) |
| [API-005](#api-005) | `GET /api/approvals/options` | [src/app/api/approvals/options/route.ts:6](../../src/app/api/approvals/options/route.ts#L6) |
| [API-006](#api-006) | `GET /api/approvals` | [src/app/api/approvals/route.ts:14](../../src/app/api/approvals/route.ts#L14) |
| [API-007](#api-007) | `POST /api/approvals` | [src/app/api/approvals/route.ts:36](../../src/app/api/approvals/route.ts#L36) |
| [API-008](#api-008) | `PATCH /api/approvals/templates/[id]` | [src/app/api/approvals/templates/[id]/route.ts:12](../../src/app/api/approvals/templates/%5Bid%5D/route.ts#L12) |
| [API-009](#api-009) | `GET /api/approvals/templates` | [src/app/api/approvals/templates/route.ts:12](../../src/app/api/approvals/templates/route.ts#L12) |
| [API-010](#api-010) | `POST /api/approvals/templates` | [src/app/api/approvals/templates/route.ts:21](../../src/app/api/approvals/templates/route.ts#L21) |
| [API-011](#api-011) | `POST /api/assets/[id]/archive` | [src/app/api/assets/[id]/archive/route.ts:8](../../src/app/api/assets/%5Bid%5D/archive/route.ts#L8) |
| [API-012](#api-012) | `POST /api/assets/[id]/disposals` | [src/app/api/assets/[id]/disposals/route.ts:8](../../src/app/api/assets/%5Bid%5D/disposals/route.ts#L8) |
| [API-013](#api-013) | `PUT /api/assets/[id]/maintenance/[maintenanceId]` | [src/app/api/assets/[id]/maintenance/[maintenanceId]/route.ts:9](../../src/app/api/assets/%5Bid%5D/maintenance/%5BmaintenanceId%5D/route.ts#L9) |
| [API-014](#api-014) | `GET /api/assets/[id]/maintenance` | [src/app/api/assets/[id]/maintenance/route.ts:9](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L9) |
| [API-015](#api-015) | `POST /api/assets/[id]/maintenance` | [src/app/api/assets/[id]/maintenance/route.ts:22](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L22) |
| [API-016](#api-016) | `GET /api/assets/[id]/qr` | [src/app/api/assets/[id]/qr/route.ts:7](../../src/app/api/assets/%5Bid%5D/qr/route.ts#L7) |
| [API-017](#api-017) | `POST /api/assets/[id]/restore` | [src/app/api/assets/[id]/restore/route.ts:7](../../src/app/api/assets/%5Bid%5D/restore/route.ts#L7) |
| [API-018](#api-018) | `GET /api/assets/[id]` | [src/app/api/assets/[id]/route.ts:24](../../src/app/api/assets/%5Bid%5D/route.ts#L24) |
| [API-019](#api-019) | `PUT /api/assets/[id]` | [src/app/api/assets/[id]/route.ts:40](../../src/app/api/assets/%5Bid%5D/route.ts#L40) |
| [API-020](#api-020) | `POST /api/assets/[id]/transfers` | [src/app/api/assets/[id]/transfers/route.ts:17](../../src/app/api/assets/%5Bid%5D/transfers/route.ts#L17) |
| [API-021](#api-021) | `POST /api/assets/import/commit` | [src/app/api/assets/import/commit/route.ts:9](../../src/app/api/assets/import/commit/route.ts#L9) |
| [API-022](#api-022) | `POST /api/assets/import/preview` | [src/app/api/assets/import/preview/route.ts:10](../../src/app/api/assets/import/preview/route.ts#L10) |
| [API-023](#api-023) | `GET /api/assets/import/template` | [src/app/api/assets/import/template/route.ts:7](../../src/app/api/assets/import/template/route.ts#L7) |
| [API-024](#api-024) | `POST /api/assets/inventories/[id]/complete` | [src/app/api/assets/inventories/[id]/complete/route.ts:7](../../src/app/api/assets/inventories/%5Bid%5D/complete/route.ts#L7) |
| [API-025](#api-025) | `GET /api/assets/inventories/[id]` | [src/app/api/assets/inventories/[id]/route.ts:8](../../src/app/api/assets/inventories/%5Bid%5D/route.ts#L8) |
| [API-026](#api-026) | `POST /api/assets/inventories/[id]/scan` | [src/app/api/assets/inventories/[id]/scan/route.ts:8](../../src/app/api/assets/inventories/%5Bid%5D/scan/route.ts#L8) |
| [API-027](#api-027) | `GET /api/assets/inventories/options` | [src/app/api/assets/inventories/options/route.ts:6](../../src/app/api/assets/inventories/options/route.ts#L6) |
| [API-028](#api-028) | `GET /api/assets/inventories/resolve` | [src/app/api/assets/inventories/resolve/route.ts:6](../../src/app/api/assets/inventories/resolve/route.ts#L6) |
| [API-029](#api-029) | `GET /api/assets/inventories` | [src/app/api/assets/inventories/route.ts:11](../../src/app/api/assets/inventories/route.ts#L11) |
| [API-030](#api-030) | `POST /api/assets/inventories` | [src/app/api/assets/inventories/route.ts:25](../../src/app/api/assets/inventories/route.ts#L25) |
| [API-031](#api-031) | `GET /api/assets` | [src/app/api/assets/route.ts:10](../../src/app/api/assets/route.ts#L10) |
| [API-032](#api-032) | `POST /api/assets` | [src/app/api/assets/route.ts:28](../../src/app/api/assets/route.ts#L28) |
| [API-033](#api-033) | `DELETE /api/assets/saved-views/[id]` | [src/app/api/assets/saved-views/[id]/route.ts:6](../../src/app/api/assets/saved-views/%5Bid%5D/route.ts#L6) |
| [API-034](#api-034) | `GET /api/assets/saved-views` | [src/app/api/assets/saved-views/route.ts:11](../../src/app/api/assets/saved-views/route.ts#L11) |
| [API-035](#api-035) | `POST /api/assets/saved-views` | [src/app/api/assets/saved-views/route.ts:22](../../src/app/api/assets/saved-views/route.ts#L22) |
| [API-036](#api-036) | `GET /api/auth/[...nextauth]` | [src/app/api/auth/[...nextauth]/route.ts:4](../../src/app/api/auth/%5B...nextauth%5D/route.ts#L4) |
| [API-037](#api-037) | `POST /api/auth/[...nextauth]` | [src/app/api/auth/[...nextauth]/route.ts:4](../../src/app/api/auth/%5B...nextauth%5D/route.ts#L4) |
| [API-038](#api-038) | `PATCH /api/departments/[id]` | [src/app/api/departments/[id]/route.ts:15](../../src/app/api/departments/%5Bid%5D/route.ts#L15) |
| [API-039](#api-039) | `DELETE /api/departments/[id]` | [src/app/api/departments/[id]/route.ts:37](../../src/app/api/departments/%5Bid%5D/route.ts#L37) |
| [API-040](#api-040) | `GET /api/departments` | [src/app/api/departments/route.ts:18](../../src/app/api/departments/route.ts#L18) |
| [API-041](#api-041) | `POST /api/departments` | [src/app/api/departments/route.ts:26](../../src/app/api/departments/route.ts#L26) |
| [API-042](#api-042) | `POST /api/documents/[id]/archive` | [src/app/api/documents/[id]/archive/route.ts:15](../../src/app/api/documents/%5Bid%5D/archive/route.ts#L15) |
| [API-043](#api-043) | `GET /api/documents/[id]/download` | [src/app/api/documents/[id]/download/route.ts:23](../../src/app/api/documents/%5Bid%5D/download/route.ts#L23) |
| [API-044](#api-044) | `GET /api/documents/[id]` | [src/app/api/documents/[id]/route.ts:17](../../src/app/api/documents/%5Bid%5D/route.ts#L17) |
| [API-045](#api-045) | `PATCH /api/documents/[id]` | [src/app/api/documents/[id]/route.ts:30](../../src/app/api/documents/%5Bid%5D/route.ts#L30) |
| [API-046](#api-046) | `POST /api/documents/[id]/versions` | [src/app/api/documents/[id]/versions/route.ts:18](../../src/app/api/documents/%5Bid%5D/versions/route.ts#L18) |
| [API-047](#api-047) | `POST /api/documents/generate` | [src/app/api/documents/generate/route.ts:10](../../src/app/api/documents/generate/route.ts#L10) |
| [API-048](#api-048) | `GET /api/documents/options` | [src/app/api/documents/options/route.ts:9](../../src/app/api/documents/options/route.ts#L9) |
| [API-049](#api-049) | `GET /api/documents` | [src/app/api/documents/route.ts:18](../../src/app/api/documents/route.ts#L18) |
| [API-050](#api-050) | `POST /api/documents` | [src/app/api/documents/route.ts:42](../../src/app/api/documents/route.ts#L42) |
| [API-051](#api-051) | `PUT /api/employees/[id]/profile` | [src/app/api/employees/[id]/profile/route.ts:8](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L8) |
| [API-052](#api-052) | `PUT /api/employees/[id]` | [src/app/api/employees/[id]/route.ts:30](../../src/app/api/employees/%5Bid%5D/route.ts#L30) |
| [API-053](#api-053) | `DELETE /api/employees/[id]` | [src/app/api/employees/[id]/route.ts:58](../../src/app/api/employees/%5Bid%5D/route.ts#L58) |
| [API-054](#api-054) | `GET /api/employees` | [src/app/api/employees/route.ts:25](../../src/app/api/employees/route.ts#L25) |
| [API-055](#api-055) | `POST /api/employees` | [src/app/api/employees/route.ts:36](../../src/app/api/employees/route.ts#L36) |
| [API-056](#api-056) | `GET /api/export` | [src/app/api/export/route.ts:10](../../src/app/api/export/route.ts#L10) |
| [API-057](#api-057) | `GET /api/finance/plans` | [src/app/api/finance/plans/route.ts:13](../../src/app/api/finance/plans/route.ts#L13) |
| [API-058](#api-058) | `POST /api/finance/plans` | [src/app/api/finance/plans/route.ts:48](../../src/app/api/finance/plans/route.ts#L48) |
| [API-059](#api-059) | `DELETE /api/finance/plans` | [src/app/api/finance/plans/route.ts:94](../../src/app/api/finance/plans/route.ts#L94) |
| [API-060](#api-060) | `GET /api/finance/salary` | [src/app/api/finance/salary/route.ts:11](../../src/app/api/finance/salary/route.ts#L11) |
| [API-061](#api-061) | `GET /api/groups/[id]` | [src/app/api/groups/[id]/route.ts:13](../../src/app/api/groups/%5Bid%5D/route.ts#L13) |
| [API-062](#api-062) | `PUT /api/groups/[id]` | [src/app/api/groups/[id]/route.ts:20](../../src/app/api/groups/%5Bid%5D/route.ts#L20) |
| [API-063](#api-063) | `DELETE /api/groups/[id]` | [src/app/api/groups/[id]/route.ts:33](../../src/app/api/groups/%5Bid%5D/route.ts#L33) |
| [API-064](#api-064) | `GET /api/groups` | [src/app/api/groups/route.ts:7](../../src/app/api/groups/route.ts#L7) |
| [API-065](#api-065) | `POST /api/groups` | [src/app/api/groups/route.ts:13](../../src/app/api/groups/route.ts#L13) |
| [API-066](#api-066) | `GET /api/health/live` | [src/app/api/health/live/route.ts:5](../../src/app/api/health/live/route.ts#L5) |
| [API-067](#api-067) | `GET /api/health/ready` | [src/app/api/health/ready/route.ts:8](../../src/app/api/health/ready/route.ts#L8) |
| [API-068](#api-068) | `GET /api/mols/[id]` | [src/app/api/mols/[id]/route.ts:18](../../src/app/api/mols/%5Bid%5D/route.ts#L18) |
| [API-069](#api-069) | `PUT /api/mols/[id]` | [src/app/api/mols/[id]/route.ts:30](../../src/app/api/mols/%5Bid%5D/route.ts#L30) |
| [API-070](#api-070) | `DELETE /api/mols/[id]` | [src/app/api/mols/[id]/route.ts:58](../../src/app/api/mols/%5Bid%5D/route.ts#L58) |
| [API-071](#api-071) | `GET /api/mols` | [src/app/api/mols/route.ts:12](../../src/app/api/mols/route.ts#L12) |
| [API-072](#api-072) | `POST /api/mols` | [src/app/api/mols/route.ts:18](../../src/app/api/mols/route.ts#L18) |
| [API-073](#api-073) | `PATCH /api/notifications/[id]` | [src/app/api/notifications/[id]/route.ts:12](../../src/app/api/notifications/%5Bid%5D/route.ts#L12) |
| [API-074](#api-074) | `DELETE /api/notifications/[id]` | [src/app/api/notifications/[id]/route.ts:26](../../src/app/api/notifications/%5Bid%5D/route.ts#L26) |
| [API-075](#api-075) | `POST /api/notifications/generate-alerts` | [src/app/api/notifications/generate-alerts/route.ts:6](../../src/app/api/notifications/generate-alerts/route.ts#L6) |
| [API-076](#api-076) | `GET /api/notifications/preferences` | [src/app/api/notifications/preferences/route.ts:7](../../src/app/api/notifications/preferences/route.ts#L7) |
| [API-077](#api-077) | `PUT /api/notifications/preferences` | [src/app/api/notifications/preferences/route.ts:13](../../src/app/api/notifications/preferences/route.ts#L13) |
| [API-078](#api-078) | `POST /api/notifications/read-all` | [src/app/api/notifications/read-all/route.ts:6](../../src/app/api/notifications/read-all/route.ts#L6) |
| [API-079](#api-079) | `GET /api/notifications` | [src/app/api/notifications/route.ts:9](../../src/app/api/notifications/route.ts#L9) |
| [API-080](#api-080) | `POST /api/notifications/smtp/process` | [src/app/api/notifications/smtp/process/route.ts:6](../../src/app/api/notifications/smtp/process/route.ts#L6) |
| [API-081](#api-081) | `GET /api/notifications/smtp` | [src/app/api/notifications/smtp/route.ts:16](../../src/app/api/notifications/smtp/route.ts#L16) |
| [API-082](#api-082) | `POST /api/notifications/smtp` | [src/app/api/notifications/smtp/route.ts:35](../../src/app/api/notifications/smtp/route.ts#L35) |
| [API-083](#api-083) | `POST /api/notifications/smtp/test` | [src/app/api/notifications/smtp/test/route.ts:16](../../src/app/api/notifications/smtp/test/route.ts#L16) |
| [API-084](#api-084) | `GET /api/notifications/unread-count` | [src/app/api/notifications/unread-count/route.ts:8](../../src/app/api/notifications/unread-count/route.ts#L8) |
| [API-085](#api-085) | `GET /api/operations` | [src/app/api/operations/route.ts:7](../../src/app/api/operations/route.ts#L7) |
| [API-086](#api-086) | `DELETE /api/payroll/adjustments/[id]` | [src/app/api/payroll/adjustments/[id]/route.ts:7](../../src/app/api/payroll/adjustments/%5Bid%5D/route.ts#L7) |
| [API-087](#api-087) | `GET /api/payroll/export-payslip` | [src/app/api/payroll/export-payslip/route.ts:14](../../src/app/api/payroll/export-payslip/route.ts#L14) |
| [API-088](#api-088) | `GET /api/payroll/export` | [src/app/api/payroll/export/route.ts:8](../../src/app/api/payroll/export/route.ts#L8) |
| [API-089](#api-089) | `PUT /api/payroll/period` | [src/app/api/payroll/period/route.ts:8](../../src/app/api/payroll/period/route.ts#L8) |
| [API-090](#api-090) | `GET /api/payroll` | [src/app/api/payroll/route.ts:8](../../src/app/api/payroll/route.ts#L8) |
| [API-091](#api-091) | `POST /api/payroll` | [src/app/api/payroll/route.ts:16](../../src/app/api/payroll/route.ts#L16) |
| [API-092](#api-092) | `DELETE /api/personnel-actions/[id]` | [src/app/api/personnel-actions/[id]/route.ts:8](../../src/app/api/personnel-actions/%5Bid%5D/route.ts#L8) |
| [API-093](#api-093) | `GET /api/personnel-actions` | [src/app/api/personnel-actions/route.ts:18](../../src/app/api/personnel-actions/route.ts#L18) |
| [API-094](#api-094) | `POST /api/personnel-actions` | [src/app/api/personnel-actions/route.ts:29](../../src/app/api/personnel-actions/route.ts#L29) |
| [API-095](#api-095) | `POST /api/personnel-actions/sync` | [src/app/api/personnel-actions/sync/route.ts:6](../../src/app/api/personnel-actions/sync/route.ts#L6) |
| [API-096](#api-096) | `POST /api/procurement/[id]/contract` | [src/app/api/procurement/[id]/contract/route.ts:9](../../src/app/api/procurement/%5Bid%5D/contract/route.ts#L9) |
| [API-097](#api-097) | `POST /api/procurement/[id]/deliveries` | [src/app/api/procurement/[id]/deliveries/route.ts:9](../../src/app/api/procurement/%5Bid%5D/deliveries/route.ts#L9) |
| [API-098](#api-098) | `GET /api/procurement/[id]` | [src/app/api/procurement/[id]/route.ts:8](../../src/app/api/procurement/%5Bid%5D/route.ts#L8) |
| [API-099](#api-099) | `PUT /api/procurement/[id]` | [src/app/api/procurement/[id]/route.ts:18](../../src/app/api/procurement/%5Bid%5D/route.ts#L18) |
| [API-100](#api-100) | `POST /api/procurement/[id]/submit` | [src/app/api/procurement/[id]/submit/route.ts:9](../../src/app/api/procurement/%5Bid%5D/submit/route.ts#L9) |
| [API-101](#api-101) | `POST /api/procurement/delivery-items/[id]/capitalize` | [src/app/api/procurement/delivery-items/[id]/capitalize/route.ts:10](../../src/app/api/procurement/delivery-items/%5Bid%5D/capitalize/route.ts#L10) |
| [API-102](#api-102) | `GET /api/procurement/options` | [src/app/api/procurement/options/route.ts:6](../../src/app/api/procurement/options/route.ts#L6) |
| [API-103](#api-103) | `GET /api/procurement` | [src/app/api/procurement/route.ts:10](../../src/app/api/procurement/route.ts#L10) |
| [API-104](#api-104) | `POST /api/procurement` | [src/app/api/procurement/route.ts:28](../../src/app/api/procurement/route.ts#L28) |
| [API-105](#api-105) | `POST /api/procurement/suppliers` | [src/app/api/procurement/suppliers/route.ts:8](../../src/app/api/procurement/suppliers/route.ts#L8) |
| [API-106](#api-106) | `PATCH /api/projects/[id]/members/[memberId]` | [src/app/api/projects/[id]/members/[memberId]/route.ts:12](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L12) |
| [API-107](#api-107) | `GET /api/projects/[id]/members` | [src/app/api/projects/[id]/members/route.ts:12](../../src/app/api/projects/%5Bid%5D/members/route.ts#L12) |
| [API-108](#api-108) | `POST /api/projects/[id]/members` | [src/app/api/projects/[id]/members/route.ts:46](../../src/app/api/projects/%5Bid%5D/members/route.ts#L46) |
| [API-109](#api-109) | `GET /api/projects/[id]/payroll` | [src/app/api/projects/[id]/payroll/route.ts:17](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L17) |
| [API-110](#api-110) | `PUT /api/projects/[id]/payroll` | [src/app/api/projects/[id]/payroll/route.ts:57](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L57) |
| [API-111](#api-111) | `DELETE /api/projects/[id]/payroll` | [src/app/api/projects/[id]/payroll/route.ts:109](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L109) |
| [API-112](#api-112) | `GET /api/projects/[id]` | [src/app/api/projects/[id]/route.ts:7](../../src/app/api/projects/%5Bid%5D/route.ts#L7) |
| [API-113](#api-113) | `PUT /api/projects/[id]` | [src/app/api/projects/[id]/route.ts:18](../../src/app/api/projects/%5Bid%5D/route.ts#L18) |
| [API-114](#api-114) | `DELETE /api/projects/[id]` | [src/app/api/projects/[id]/route.ts:35](../../src/app/api/projects/%5Bid%5D/route.ts#L35) |
| [API-115](#api-115) | `GET /api/projects/[id]/tasks` | [src/app/api/projects/[id]/tasks/route.ts:7](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L7) |
| [API-116](#api-116) | `POST /api/projects/[id]/tasks` | [src/app/api/projects/[id]/tasks/route.ts:17](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L17) |
| [API-117](#api-117) | `GET /api/projects` | [src/app/api/projects/route.ts:14](../../src/app/api/projects/route.ts#L14) |
| [API-118](#api-118) | `POST /api/projects` | [src/app/api/projects/route.ts:25](../../src/app/api/projects/route.ts#L25) |
| [API-119](#api-119) | `POST /api/reports/custom` | [src/app/api/reports/custom/route.ts:16](../../src/app/api/reports/custom/route.ts#L16) |
| [API-120](#api-120) | `GET /api/reports/depreciation` | [src/app/api/reports/depreciation/route.ts:13](../../src/app/api/reports/depreciation/route.ts#L13) |
| [API-121](#api-121) | `GET /api/reports/export` | [src/app/api/reports/export/route.ts:24](../../src/app/api/reports/export/route.ts#L24) |
| [API-122](#api-122) | `GET /api/reports/presets` | [src/app/api/reports/presets/route.ts:7](../../src/app/api/reports/presets/route.ts#L7) |
| [API-123](#api-123) | `POST /api/reports/presets` | [src/app/api/reports/presets/route.ts:15](../../src/app/api/reports/presets/route.ts#L15) |
| [API-124](#api-124) | `DELETE /api/reports/presets` | [src/app/api/reports/presets/route.ts:31](../../src/app/api/reports/presets/route.ts#L31) |
| [API-125](#api-125) | `GET /api/reports/profitability` | [src/app/api/reports/profitability/route.ts:13](../../src/app/api/reports/profitability/route.ts#L13) |
| [API-126](#api-126) | `GET /api/reports/turnover` | [src/app/api/reports/turnover/route.ts:13](../../src/app/api/reports/turnover/route.ts#L13) |
| [API-127](#api-127) | `GET /api/reports/vacations` | [src/app/api/reports/vacations/route.ts:13](../../src/app/api/reports/vacations/route.ts#L13) |
| [API-128](#api-128) | `GET /api/search` | [src/app/api/search/route.ts:7](../../src/app/api/search/route.ts#L7) |
| [API-129](#api-129) | `PUT /api/staff-schedule/[id]` | [src/app/api/staff-schedule/[id]/route.ts:20](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L20) |
| [API-130](#api-130) | `DELETE /api/staff-schedule/[id]` | [src/app/api/staff-schedule/[id]/route.ts:48](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L48) |
| [API-131](#api-131) | `GET /api/staff-schedule` | [src/app/api/staff-schedule/route.ts:17](../../src/app/api/staff-schedule/route.ts#L17) |
| [API-132](#api-132) | `POST /api/staff-schedule` | [src/app/api/staff-schedule/route.ts:23](../../src/app/api/staff-schedule/route.ts#L23) |
| [API-133](#api-133) | `POST /api/tasks/[id]/comments` | [src/app/api/tasks/[id]/comments/route.ts:8](../../src/app/api/tasks/%5Bid%5D/comments/route.ts#L8) |
| [API-134](#api-134) | `PUT /api/tasks/[id]` | [src/app/api/tasks/[id]/route.ts:14](../../src/app/api/tasks/%5Bid%5D/route.ts#L14) |
| [API-135](#api-135) | `DELETE /api/tasks/[id]` | [src/app/api/tasks/[id]/route.ts:32](../../src/app/api/tasks/%5Bid%5D/route.ts#L32) |
| [API-136](#api-136) | `PUT /api/time-entries/[id]` | [src/app/api/time-entries/[id]/route.ts:8](../../src/app/api/time-entries/%5Bid%5D/route.ts#L8) |
| [API-137](#api-137) | `DELETE /api/time-entries/[id]` | [src/app/api/time-entries/[id]/route.ts:32](../../src/app/api/time-entries/%5Bid%5D/route.ts#L32) |
| [API-138](#api-138) | `GET /api/time-entries` | [src/app/api/time-entries/route.ts:13](../../src/app/api/time-entries/route.ts#L13) |
| [API-139](#api-139) | `POST /api/time-entries` | [src/app/api/time-entries/route.ts:25](../../src/app/api/time-entries/route.ts#L25) |
| [API-140](#api-140) | `POST /api/timekeeping/timesheets/[id]/decision` | [src/app/api/timekeeping/timesheets/[id]/decision/route.ts:8](../../src/app/api/timekeeping/timesheets/%5Bid%5D/decision/route.ts#L8) |
| [API-141](#api-141) | `POST /api/timekeeping/timesheets` | [src/app/api/timekeeping/timesheets/route.ts:8](../../src/app/api/timekeeping/timesheets/route.ts#L8) |
| [API-142](#api-142) | `PATCH /api/users/[id]` | [src/app/api/users/[id]/route.ts:17](../../src/app/api/users/%5Bid%5D/route.ts#L17) |
| [API-143](#api-143) | `GET /api/users` | [src/app/api/users/route.ts:7](../../src/app/api/users/route.ts#L7) |
| [API-144](#api-144) | `POST /api/users` | [src/app/api/users/route.ts:18](../../src/app/api/users/route.ts#L18) |
| [API-145](#api-145) | `PUT /api/vacations/[id]` | [src/app/api/vacations/[id]/route.ts:12](../../src/app/api/vacations/%5Bid%5D/route.ts#L12) |
| [API-146](#api-146) | `DELETE /api/vacations/[id]` | [src/app/api/vacations/[id]/route.ts:38](../../src/app/api/vacations/%5Bid%5D/route.ts#L38) |
| [API-147](#api-147) | `GET /api/vacations` | [src/app/api/vacations/route.ts:11](../../src/app/api/vacations/route.ts#L11) |
| [API-148](#api-148) | `POST /api/vacations` | [src/app/api/vacations/route.ts:19](../../src/app/api/vacations/route.ts#L19) |

## Контракты по каждой паре

<a id="api-001"></a>
### API-001: POST /api/account/password

Источник handler: [src/app/api/account/password/route.ts:7](../../src/app/api/account/password/route.ts#L7).

- **Auth:** `authorizeApiRequest(request)` [source](../../src/app/api/account/password/route.ts#L8); общие auth branches выше.
- **Схемы HTTP boundary:** [changePasswordSchema](#schema-a998fa6c6c) ([source](../../src/features/users/contracts/schemas.ts#L112)).
- **Parsing:** `changePasswordSchema.safeParse(await request.json())` [source](../../src/app/api/account/password/route.ts#L11); `request.json()` [source](../../src/app/api/account/password/route.ts#L11).
- **Выходные формы:** [R001](#r001) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Только auth.user.id; отдельный permission отсутствует; доступ разрешён при mustChangePassword.
- **Calls:** [UserService.changePassword](../../src/features/users/application/user.service.ts#L327). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Проверяет текущий password hash; hash нового Argon2id, sessionVersion++, mustChangePassword=false, сброс login counters и audit в транзакции; текущая JWT-сессия становится устаревшей.
- **Writes/IO evidence:** `tx.user.update` [source](../../src/features/users/application/user.service.ts#L336); `tx.auditLog.create` [source](../../src/features/users/application/user.service.ts#L347).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/account/password/route.ts#L9); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/account/password/route.ts#L12); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/account/password/route.ts#L16)

```ts
return apiData({ success: true })
```

[source](../../src/app/api/account/password/route.ts#L19); enclosing checks: `catch AND error instanceof UserServiceError && error.code === 'INVALID_CURRENT_PASSWORD'`

```ts
return apiError('INVALID_CURRENT_PASSWORD', 'Текущий пароль указан неверно', 422)
```

</details>

<a id="api-002"></a>
### API-002: POST /api/approvals/[id]/cancel

Источник handler: [src/app/api/approvals/[id]/cancel/route.ts:7](../../src/app/api/approvals/%5Bid%5D/cancel/route.ts#L7).

- **Auth:** `authorizeApiRequest(request, 'approvals.cancel')` [source](../../src/app/api/approvals/%5Bid%5D/cancel/route.ts#L11); общие auth branches выше.
- **Вход и transport:** Body/query не читаются.
- **Выходные формы:** [R002](#r002) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Только requestedById=actor; ADMIN не получает отдельного bypass.
- **Calls:** [ApprovalService.cancel](../../src/features/approvals/application/approval.service.ts#L500), [getApprovalService](../../src/features/approvals/application/approval.service.ts#L561). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Request/steps/document status+lockVersion+audit; возвращает снимок current ДО обновления, status в response может остаться PENDING/DRAFT.
- **Writes/IO evidence:** `tx.approvalStep.updateMany` [source](../../src/features/approvals/application/approval.service.ts#L523); `tx.approvalRequest.update` [source](../../src/features/approvals/application/approval.service.ts#L530); `tx.document.update` [source](../../src/features/approvals/application/approval.service.ts#L539); `tx.auditLog.create` [source](../../src/features/approvals/application/approval.service.ts#L544).
- **Error maps:** [approvalApiError](#mapper-27092afa0d) ([source](../../src/features/approvals/application/http.ts#L14)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/approvals/%5Bid%5D/cancel/route.ts#L12); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/approvals/%5Bid%5D/cancel/route.ts#L15)

```ts
return apiData(await getApprovalService().cancel(id, auth.user.id, auth.requestId))
```

[source](../../src/app/api/approvals/%5Bid%5D/cancel/route.ts#L17); enclosing checks: `catch`

```ts
return approvalApiError(error)
```

</details>

<a id="api-003"></a>
### API-003: POST /api/approvals/[id]/decision

Источник handler: [src/app/api/approvals/[id]/decision/route.ts:9](../../src/app/api/approvals/%5Bid%5D/decision/route.ts#L9).

- **Auth:** `authorizeApiRequest(request, 'approvals.decide')` [source](../../src/app/api/approvals/%5Bid%5D/decision/route.ts#L13); общие auth branches выше.
- **Схемы HTTP boundary:** [approvalDecisionSchema](#schema-77864056a6) ([source](../../src/features/approvals/contracts/approval.ts#L36)).
- **Parsing:** `approvalDecisionSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/approvals/%5Bid%5D/decision/route.ts#L15); `request.json()` [source](../../src/app/api/approvals/%5Bid%5D/decision/route.ts#L15).
- **Выходные формы:** [R003](#r003) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Только actor текущего PENDING шага; department/project scopes не участвуют.
- **Calls:** [ApprovalService.decide](../../src/features/approvals/application/approval.service.ts#L364), [getApprovalService](../../src/features/approvals/application/approval.service.ts#L561), [getNotificationService](../../src/features/notifications/application/notification.service.ts#L288). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Блокирует request row FOR UPDATE; step/request/document status+lockVersion+audit в transaction; notification после commit, ошибка подавляется.
- **Writes/IO evidence:** `tx.approvalStep.update` [source](../../src/features/approvals/application/approval.service.ts#L393); `tx.approvalStep.updateMany` [source](../../src/features/approvals/application/approval.service.ts#L405); `tx.approvalRequest.update` [source](../../src/features/approvals/application/approval.service.ts#L409); `tx.document.update` [source](../../src/features/approvals/application/approval.service.ts#L418); `tx.approvalStep.update` [source](../../src/features/approvals/application/approval.service.ts#L429); `tx.approvalRequest.update` [source](../../src/features/approvals/application/approval.service.ts#L433); `tx.approvalRequest.update` [source](../../src/features/approvals/application/approval.service.ts#L442); `tx.document.update` [source](../../src/features/approvals/application/approval.service.ts#L451); `tx.auditLog.create` [source](../../src/features/approvals/application/approval.service.ts#L458).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [approvalApiError](#mapper-27092afa0d) ([source](../../src/features/approvals/application/http.ts#L14)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/approvals/%5Bid%5D/decision/route.ts#L14); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/approvals/%5Bid%5D/decision/route.ts#L16); enclosing checks: `!parsed.success`

```ts
return apiValidationError(parsed.error)
```

[source](../../src/app/api/approvals/%5Bid%5D/decision/route.ts#L19)

```ts
return apiData(
      await getApprovalService(getNotificationService())
        .decide(id, auth.user.id, parsed.data, auth.requestId),
    )
```

[source](../../src/app/api/approvals/%5Bid%5D/decision/route.ts#L24); enclosing checks: `catch`

```ts
return approvalApiError(error)
```

</details>

<a id="api-004"></a>
### API-004: GET /api/approvals/[id]

Источник handler: [src/app/api/approvals/[id]/route.ts:8](../../src/app/api/approvals/%5Bid%5D/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'approvals.read')` [source](../../src/app/api/approvals/%5Bid%5D/route.ts#L9); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R004](#r004), [R005](#r005) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** ADMIN/AUDITOR видят все; остальные — инициатор или согласующий. Чужой/отсутствующий ID даёт тот же 404 без code.
- **Service scope evidence:** `visibleWhere(userId, canViewAll)` [source](../../src/features/approvals/application/approval.service.ts#L106).
- **Calls:** [ApprovalService.getVisibleById](../../src/features/approvals/application/approval.service.ts#L104), [getApprovalService](../../src/features/approvals/application/approval.service.ts#L561). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/approvals/%5Bid%5D/route.ts#L10); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/approvals/%5Bid%5D/route.ts#L14); enclosing checks: `!approval`

```ts
return Response.json({ error: { message: 'Согласование не найдено' } }, { status: 404 })
```

[source](../../src/app/api/approvals/%5Bid%5D/route.ts#L15)

```ts
return apiData(approval)
```

</details>

<a id="api-005"></a>
### API-005: GET /api/approvals/options

Источник handler: [src/app/api/approvals/options/route.ts:6](../../src/app/api/approvals/options/route.ts#L6).

- **Auth:** `authorizeApiRequest(request, 'approvals.create')` [source](../../src/app/api/approvals/options/route.ts#L7); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R006](#r006) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Все активные users, select id/name/username; department/project filter отсутствует.
- **Calls:** [ApprovalService.approverOptions](../../src/features/approvals/application/approval.service.ts#L165), [getApprovalService](../../src/features/approvals/application/approval.service.ts#L561). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/approvals/options/route.ts#L8); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/approvals/options/route.ts#L9)

```ts
return apiData(await getApprovalService().approverOptions())
```

</details>

<a id="api-006"></a>
### API-006: GET /api/approvals

Источник handler: [src/app/api/approvals/route.ts:14](../../src/app/api/approvals/route.ts#L14).

- **Auth:** `authorizeApiRequest(request, 'approvals.read')` [source](../../src/app/api/approvals/route.ts#L15); общие auth branches выше.
- **Схемы HTTP boundary:** [approvalQuerySchema](#schema-1665b20e13) ([source](../../src/features/approvals/contracts/approval.ts#L71)).
- **Parsing:** `approvalQuerySchema.safeParse( Object.fromEntries(request.nextUrl.searchParams), )` [source](../../src/app/api/approvals/route.ts#L17).
- **Выходные формы:** [R007](#r007) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** ADMIN/AUDITOR видят все; остальные — requestedById=actor или шаг approverId=actor. assignedToMe=true ограничивает даже ADMIN/AUDITOR до своих шагов.
- **Service scope evidence:** `visibleWhere(userId, canViewAll, query.assignedToMe)` [source](../../src/features/approvals/application/approval.service.ts#L80).
- **Calls:** [ApprovalService.list](../../src/features/approvals/application/approval.service.ts#L76), [getApprovalService](../../src/features/approvals/application/approval.service.ts#L561). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/approvals/route.ts#L16); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/approvals/route.ts#L20); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/approvals/route.ts#L29)

```ts
return apiList(result.requests, {
    page: query.data.page,
    pageSize: query.data.pageSize,
    total: result.total,
  })
```

</details>

<a id="api-007"></a>
### API-007: POST /api/approvals

Источник handler: [src/app/api/approvals/route.ts:36](../../src/app/api/approvals/route.ts#L36).

- **Auth:** `authorizeApiRequest(request, 'approvals.create')` [source](../../src/app/api/approvals/route.ts#L37); общие auth branches выше.
- **Схемы HTTP boundary:** [createApprovalSchema](#schema-c8054f23e4) ([source](../../src/features/approvals/contracts/approval.ts#L6)).
- **Parsing:** `createApprovalSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/approvals/route.ts#L39); `request.json()` [source](../../src/app/api/approvals/route.ts#L39).
- **Выходные формы:** [R005](#r005) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Проверяет активность/уникальность согласующих и существование document/project; resource scope связанных document/project не проверяется. Permission approvals.create имеет scope none.
- **Calls:** [ApprovalService.create](../../src/features/approvals/application/approval.service.ts#L275), [getApprovalService](../../src/features/approvals/application/approval.service.ts#L561), [getNotificationService](../../src/features/notifications/application/notification.service.ts#L288). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Request/steps + linked document IN_REVIEW/lockVersion + audit в DB transaction; notification publish вызывается ПОСЛЕ commit, ошибка подавляется.
- **Writes/IO evidence:** `tx.approvalRequest.create` [source](../../src/features/approvals/application/approval.service.ts#L304); `tx.document.update` [source](../../src/features/approvals/application/approval.service.ts#L331); `tx.auditLog.create` [source](../../src/features/approvals/application/approval.service.ts#L336).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [approvalApiError](#mapper-27092afa0d) ([source](../../src/features/approvals/application/http.ts#L14)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/approvals/route.ts#L38); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/approvals/route.ts#L40); enclosing checks: `!parsed.success`

```ts
return apiValidationError(parsed.error)
```

[source](../../src/app/api/approvals/route.ts#L42)

```ts
return apiData(
      await getApprovalService(getNotificationService())
        .create(parsed.data, auth.user.id, auth.requestId),
      { status: 201 },
    )
```

[source](../../src/app/api/approvals/route.ts#L48); enclosing checks: `catch`

```ts
return approvalApiError(error)
```

</details>

<a id="api-008"></a>
### API-008: PATCH /api/approvals/templates/[id]

Источник handler: [src/app/api/approvals/templates/[id]/route.ts:12](../../src/app/api/approvals/templates/%5Bid%5D/route.ts#L12).

- **Auth:** `authorizeApiRequest(request, 'approvals.templates.manage')` [source](../../src/app/api/approvals/templates/%5Bid%5D/route.ts#L13); общие auth branches выше.
- **Схемы HTTP boundary:** [updateApprovalTemplateSchema](#schema-9e751cd8f3) ([source](../../src/features/approvals/contracts/approval.ts#L63)).
- **Parsing:** `updateApprovalTemplateSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/approvals/templates/%5Bid%5D/route.ts#L15); `request.json()` [source](../../src/app/api/approvals/templates/%5Bid%5D/route.ts#L15).
- **Выходные формы:** [R008](#r008) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Service scope evidence:** `this.assertActiveApprovers( input.steps.map((step) => step.approverId), tx, )` [source](../../src/features/approvals/application/approval.service.ts#L226).
- **Calls:** [ApprovalService.updateTemplate](../../src/features/approvals/application/approval.service.ts#L217), [getApprovalService](../../src/features/approvals/application/approval.service.ts#L561). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Writes/IO evidence:** `tx.approvalTemplate.update` [source](../../src/features/approvals/application/approval.service.ts#L231); `tx.auditLog.create` [source](../../src/features/approvals/application/approval.service.ts#L240).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [approvalApiError](#mapper-27092afa0d) ([source](../../src/features/approvals/application/http.ts#L14)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/approvals/templates/%5Bid%5D/route.ts#L14); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/approvals/templates/%5Bid%5D/route.ts#L16); enclosing checks: `!parsed.success`

```ts
return apiValidationError(parsed.error)
```

[source](../../src/app/api/approvals/templates/%5Bid%5D/route.ts#L19)

```ts
return apiData(await getApprovalService().updateTemplate(
      id,
      parsed.data,
      auth.user.id,
      auth.requestId,
    ))
```

[source](../../src/app/api/approvals/templates/%5Bid%5D/route.ts#L26); enclosing checks: `catch`

```ts
return approvalApiError(error)
```

</details>

<a id="api-009"></a>
### API-009: GET /api/approvals/templates

Источник handler: [src/app/api/approvals/templates/route.ts:12](../../src/app/api/approvals/templates/route.ts#L12).

- **Auth:** `authorizeApiRequest(request, { anyOf: ['approvals.create', 'approvals.templates.manage'], })` [source](../../src/app/api/approvals/templates/route.ts#L13); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R009](#r009) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Неактивные доступны только при approvals.templates.manage; остальные получают activeOnly.
- **Calls:** [ApprovalService.listTemplates](../../src/features/approvals/application/approval.service.ts#L173), [getApprovalService](../../src/features/approvals/application/approval.service.ts#L561). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/approvals/templates/route.ts#L16); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/approvals/templates/route.ts#L18)

```ts
return apiData(await getApprovalService().listTemplates(canManage))
```

</details>

<a id="api-010"></a>
### API-010: POST /api/approvals/templates

Источник handler: [src/app/api/approvals/templates/route.ts:21](../../src/app/api/approvals/templates/route.ts#L21).

- **Auth:** `authorizeApiRequest(request, 'approvals.templates.manage')` [source](../../src/app/api/approvals/templates/route.ts#L22); общие auth branches выше.
- **Схемы HTTP boundary:** [createApprovalTemplateSchema](#schema-f00e0d03f4) ([source](../../src/features/approvals/contracts/approval.ts#L58)).
- **Parsing:** `createApprovalTemplateSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/approvals/templates/route.ts#L24); `request.json()` [source](../../src/app/api/approvals/templates/route.ts#L24).
- **Выходные формы:** [R008](#r008) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Service scope evidence:** `this.assertActiveApprovers( input.steps.map((step) => step.approverId), tx, )` [source](../../src/features/approvals/application/approval.service.ts#L184).
- **Calls:** [ApprovalService.createTemplate](../../src/features/approvals/application/approval.service.ts#L181), [getApprovalService](../../src/features/approvals/application/approval.service.ts#L561). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Writes/IO evidence:** `tx.approvalTemplate.create` [source](../../src/features/approvals/application/approval.service.ts#L188); `tx.auditLog.create` [source](../../src/features/approvals/application/approval.service.ts#L197).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [approvalApiError](#mapper-27092afa0d) ([source](../../src/features/approvals/application/http.ts#L14)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/approvals/templates/route.ts#L23); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/approvals/templates/route.ts#L25); enclosing checks: `!parsed.success`

```ts
return apiValidationError(parsed.error)
```

[source](../../src/app/api/approvals/templates/route.ts#L27)

```ts
return apiData(
      await getApprovalService().createTemplate(parsed.data, auth.user.id, auth.requestId),
      { status: 201 },
    )
```

[source](../../src/app/api/approvals/templates/route.ts#L32); enclosing checks: `catch`

```ts
return approvalApiError(error)
```

</details>

<a id="api-011"></a>
### API-011: POST /api/assets/[id]/archive

Источник handler: [src/app/api/assets/[id]/archive/route.ts:8](../../src/app/api/assets/%5Bid%5D/archive/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'assets.archive')` [source](../../src/app/api/assets/%5Bid%5D/archive/route.ts#L12); общие auth branches выше.
- **Схемы HTTP boundary:** [archiveAssetSchema](#schema-4b102f2d43) ([source](../../src/features/assets/contracts/schemas.ts#L70)).
- **Parsing:** `archiveAssetSchema.safeParse(await request.json())` [source](../../src/app/api/assets/%5Bid%5D/archive/route.ts#L14); `request.json()` [source](../../src/app/api/assets/%5Bid%5D/archive/route.ts#L14).
- **Выходные формы:** [R010](#r010) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет departments текущего asset; service сам AccessContext не принимает.
- **Route scope predicates:** `assetTarget(id)` [source](../../src/app/api/assets/%5Bid%5D/archive/route.ts#L17); `auth.access.allows('assets.archive', { departmentIds: target.departmentIds })` [source](../../src/app/api/assets/%5Bid%5D/archive/route.ts#L18).
- **Calls:** [AssetService.archive](../../src/features/assets/application/asset.service.ts#L448). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** isArchived=true + audit; не физическое удаление.
- **Writes/IO evidence:** `tx.asset.update` [source](../../src/features/assets/application/asset.service.ts#L453); `tx.operation.create` [source](../../src/features/assets/application/asset.service.ts#L455); `tx.auditLog.create` [source](../../src/features/assets/application/asset.service.ts#L470).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/%5Bid%5D/archive/route.ts#L13); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/%5Bid%5D/archive/route.ts#L15); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/assets/%5Bid%5D/archive/route.ts#L19); enclosing checks: `target && !auth.access.allows('assets.archive', { departmentIds: target.departmentIds })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/assets/%5Bid%5D/archive/route.ts#L23)

```ts
return apiData(await AssetService.archive(id, input.data.reason, auth.user.id, auth.requestId))
```

[source](../../src/app/api/assets/%5Bid%5D/archive/route.ts#L26); enclosing checks: `catch AND error instanceof AssetServiceError && error.code === 'ASSET_NOT_FOUND'`

```ts
return apiError(error.code, 'Объект имущества не найден', 404)
```

</details>

<a id="api-012"></a>
### API-012: POST /api/assets/[id]/disposals

Источник handler: [src/app/api/assets/[id]/disposals/route.ts:8](../../src/app/api/assets/%5Bid%5D/disposals/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'assets.dispose')` [source](../../src/app/api/assets/%5Bid%5D/disposals/route.ts#L12); общие auth branches выше.
- **Схемы HTTP boundary:** [disposeAssetSchema](#schema-e5e4a0e51e) ([source](../../src/features/assets/contracts/schemas.ts#L65)).
- **Parsing:** `disposeAssetSchema.safeParse(await request.json())` [source](../../src/app/api/assets/%5Bid%5D/disposals/route.ts#L14); `request.json()` [source](../../src/app/api/assets/%5Bid%5D/disposals/route.ts#L14).
- **Выходные формы:** [R011](#r011) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет department выбранного fromMolId; service проверяет принадлежность holding объекту и остаток.
- **Route scope predicates:** `departmentForMol(input.data.fromMolId)` [source](../../src/app/api/assets/%5Bid%5D/disposals/route.ts#L16); `auth.access.allows('assets.dispose', { departmentId })` [source](../../src/app/api/assets/%5Bid%5D/disposals/route.ts#L17).
- **Calls:** [AssetService.dispose](../../src/features/assets/application/asset.service.ts#L375). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Уменьшает holding и quantity/totalCost; DISPOSAL operation и audit; statuses PARTIALLY/FULLY_DISPOSED; Serializable retry.
- **Writes/IO evidence:** `tx.assetHolding.updateMany` [source](../../src/features/assets/application/asset.service.ts#L388); `tx.assetHolding.deleteMany` [source](../../src/features/assets/application/asset.service.ts#L393); `tx.asset.update` [source](../../src/features/assets/application/asset.service.ts#L397); `tx.asset.update` [source](../../src/features/assets/application/asset.service.ts#L409); `tx.operation.create` [source](../../src/features/assets/application/asset.service.ts#L412); `tx.auditLog.create` [source](../../src/features/assets/application/asset.service.ts#L429).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/%5Bid%5D/disposals/route.ts#L13); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/%5Bid%5D/disposals/route.ts#L15); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/assets/%5Bid%5D/disposals/route.ts#L18); enclosing checks: `departmentId && !auth.access.allows('assets.dispose', { departmentId })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/assets/%5Bid%5D/disposals/route.ts#L22)

```ts
return apiData(await AssetService.dispose((await params).id, input.data, auth.user.id, auth.requestId), { status: 201 })
```

[source](../../src/app/api/assets/%5Bid%5D/disposals/route.ts#L26); enclosing checks: `catch AND error instanceof AssetServiceError`

```ts
return apiError(error.code, error.code === 'INSUFFICIENT_QUANTITY' ? 'Недостаточный остаток для списания' : 'Операция списания невозможна', status)
```

</details>

<a id="api-013"></a>
### API-013: PUT /api/assets/[id]/maintenance/[maintenanceId]

Источник handler: [src/app/api/assets/[id]/maintenance/[maintenanceId]/route.ts:9](../../src/app/api/assets/%5Bid%5D/maintenance/%5BmaintenanceId%5D/route.ts#L9).

- **Auth:** `authorizeApiRequest(request, 'assets.update')` [source](../../src/app/api/assets/%5Bid%5D/maintenance/%5BmaintenanceId%5D/route.ts#L13); общие auth branches выше.
- **Схемы HTTP boundary:** [updateMaintenanceSchema](#schema-d7d4c1c92f) ([source](../../src/features/assets/contracts/maintenance.ts#L14)).
- **Parsing:** `updateMaintenanceSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/assets/%5Bid%5D/maintenance/%5BmaintenanceId%5D/route.ts#L19); `request.json()` [source](../../src/app/api/assets/%5Bid%5D/maintenance/%5BmaintenanceId%5D/route.ts#L19).
- **Выходные формы:** [R012](#r012) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Route scope predicates:** `assetTarget(id)` [source](../../src/app/api/assets/%5Bid%5D/maintenance/%5BmaintenanceId%5D/route.ts#L16); `auth.access.allows('assets.update', target)` [source](../../src/app/api/assets/%5Bid%5D/maintenance/%5BmaintenanceId%5D/route.ts#L18).
- **Calls:** [AssetLifecycleService.update](../../src/features/assets/application/asset-lifecycle.service.ts#L85). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Maintenance fields/status transition + asset status repair/restore + audit.
- **Writes/IO evidence:** `tx.assetMaintenance.update` [source](../../src/features/assets/application/asset-lifecycle.service.ts#L128); `tx.asset.update` [source](../../src/features/assets/application/asset-lifecycle.service.ts#L150); `tx.operation.create` [source](../../src/features/assets/application/asset-lifecycle.service.ts#L151); `tx.auditLog.create` [source](../../src/features/assets/application/asset-lifecycle.service.ts#L169).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [assetLifecycleApiError](#mapper-b01473cd35) ([source](../../src/features/assets/application/asset-lifecycle-http.ts#L4)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/%5Bid%5D/maintenance/%5BmaintenanceId%5D/route.ts#L14); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/%5Bid%5D/maintenance/%5BmaintenanceId%5D/route.ts#L17); enclosing checks: `!target`

```ts
return apiError('ASSET_NOT_FOUND', 'Имущество не найдено', 404)
```

[source](../../src/app/api/assets/%5Bid%5D/maintenance/%5BmaintenanceId%5D/route.ts#L18); enclosing checks: `!auth.access.allows('assets.update', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/assets/%5Bid%5D/maintenance/%5BmaintenanceId%5D/route.ts#L20); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/assets/%5Bid%5D/maintenance/%5BmaintenanceId%5D/route.ts#L22)

```ts
return apiData(
      await AssetLifecycleService.update(
        id,
        maintenanceId,
        input.data,
        auth.user.id,
        auth.requestId,
      ),
    )
```

[source](../../src/app/api/assets/%5Bid%5D/maintenance/%5BmaintenanceId%5D/route.ts#L32); enclosing checks: `catch`

```ts
return assetLifecycleApiError(error)
```

</details>

<a id="api-014"></a>
### API-014: GET /api/assets/[id]/maintenance

Источник handler: [src/app/api/assets/[id]/maintenance/route.ts:9](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L9).

- **Auth:** `authorizeApiRequest(request, 'assets.read')` [source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L13); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R013](#r013) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Route scope predicates:** `assetTarget(id)` [source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L16); `auth.access.allows('assets.read', target)` [source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L18).
- **Calls:** [AssetLifecycleService.list](../../src/features/assets/application/asset-lifecycle.service.ts#L36). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L14); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L17); enclosing checks: `!target`

```ts
return apiError('ASSET_NOT_FOUND', 'Имущество не найдено', 404)
```

[source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L18); enclosing checks: `!auth.access.allows('assets.read', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L19)

```ts
return apiData(await AssetLifecycleService.list(id))
```

</details>

<a id="api-015"></a>
### API-015: POST /api/assets/[id]/maintenance

Источник handler: [src/app/api/assets/[id]/maintenance/route.ts:22](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L22).

- **Auth:** `authorizeApiRequest(request, 'assets.update')` [source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L26); общие auth branches выше.
- **Схемы HTTP boundary:** [createMaintenanceSchema](#schema-541dd306b2) ([source](../../src/features/assets/contracts/maintenance.ts#L4)).
- **Parsing:** `createMaintenanceSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L32); `request.json()` [source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L32).
- **Выходные формы:** [R012](#r012) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Route scope predicates:** `assetTarget(id)` [source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L29); `auth.access.allows('assets.update', target)` [source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L31).
- **Calls:** [AssetLifecycleService.create](../../src/features/assets/application/asset-lifecycle.service.ts#L43). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Создаёт scheduled maintenance и audit; asset.status при create не меняет (REPAIR изменяет status при PUT IN_PROGRESS).
- **Writes/IO evidence:** `tx.assetMaintenance.create` [source](../../src/features/assets/application/asset-lifecycle.service.ts#L59); `tx.auditLog.create` [source](../../src/features/assets/application/asset-lifecycle.service.ts#L71).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [assetLifecycleApiError](#mapper-b01473cd35) ([source](../../src/features/assets/application/asset-lifecycle-http.ts#L4)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L27); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L30); enclosing checks: `!target`

```ts
return apiError('ASSET_NOT_FOUND', 'Имущество не найдено', 404)
```

[source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L31); enclosing checks: `!auth.access.allows('assets.update', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L33); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L35)

```ts
return apiData(
      await AssetLifecycleService.create(id, input.data, auth.user.id, auth.requestId),
      { status: 201 },
    )
```

[source](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L40); enclosing checks: `catch`

```ts
return assetLifecycleApiError(error)
```

</details>

<a id="api-016"></a>
### API-016: GET /api/assets/[id]/qr

Источник handler: [src/app/api/assets/[id]/qr/route.ts:7](../../src/app/api/assets/%5Bid%5D/qr/route.ts#L7).

- **Auth:** `authorizeApiRequest(request, 'assets.read')` [source](../../src/app/api/assets/%5Bid%5D/qr/route.ts#L11); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Binary/headers:** 200 SVG text, image/svg+xml; charset=utf-8, private,no-store, nosniff. QR URL /assets/inventory/scan?number=inventoryNumber; origin NEXT_PUBLIC_APP_URL либо request origin; errorCorrectionLevel Q, margin 2, width 256.
- **Resource scope:** access.assetWhere(assets.read); чужой объект может выглядеть отсутствующим. Деталь включает операции.
- **Service scope evidence:** `access.assetWhere('assets.read')` [source](../../src/features/assets/application/asset.service.ts#L215).
- **Calls:** [AssetService.get](../../src/features/assets/application/asset.service.ts#L212). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/%5Bid%5D/qr/route.ts#L12); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/%5Bid%5D/qr/route.ts#L15); enclosing checks: `!asset`

```ts
return apiError('ASSET_NOT_FOUND', 'Имущество не найдено', 404)
```

[source](../../src/app/api/assets/%5Bid%5D/qr/route.ts#L25)

```ts
return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
```

</details>

<a id="api-017"></a>
### API-017: POST /api/assets/[id]/restore

Источник handler: [src/app/api/assets/[id]/restore/route.ts:7](../../src/app/api/assets/%5Bid%5D/restore/route.ts#L7).

- **Auth:** `authorizeApiRequest(request, 'assets.restore')` [source](../../src/app/api/assets/%5Bid%5D/restore/route.ts#L11); общие auth branches выше.
- **Вход и transport:** Body/query не читаются.
- **Выходные формы:** [R010](#r010) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет departments текущего asset; service сам AccessContext не принимает.
- **Route scope predicates:** `assetTarget(id)` [source](../../src/app/api/assets/%5Bid%5D/restore/route.ts#L14); `auth.access.allows('assets.restore', { departmentIds: target.departmentIds })` [source](../../src/app/api/assets/%5Bid%5D/restore/route.ts#L15).
- **Calls:** [AssetService.restore](../../src/features/assets/application/asset.service.ts#L485). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** isArchived=false + audit; полностью списанный объект не восстанавливается.
- **Writes/IO evidence:** `tx.asset.update` [source](../../src/features/assets/application/asset.service.ts#L492); `tx.auditLog.create` [source](../../src/features/assets/application/asset.service.ts#L493).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/%5Bid%5D/restore/route.ts#L12); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/%5Bid%5D/restore/route.ts#L16); enclosing checks: `target && !auth.access.allows('assets.restore', { departmentIds: target.departmentIds })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/assets/%5Bid%5D/restore/route.ts#L20)

```ts
return apiData(await AssetService.restore(id, auth.user.id, auth.requestId))
```

[source](../../src/app/api/assets/%5Bid%5D/restore/route.ts#L23); enclosing checks: `catch AND error instanceof AssetServiceError`

```ts
return apiError(
        error.code,
        error.code === 'ASSET_NOT_FOUND'
          ? 'Объект имущества не найден'
          : 'Полностью списанный объект нельзя восстановить без нового поступления',
        error.code === 'ASSET_NOT_FOUND' ? 404 : 409,
      )
```

</details>

<a id="api-018"></a>
### API-018: GET /api/assets/[id]

Источник handler: [src/app/api/assets/[id]/route.ts:24](../../src/app/api/assets/%5Bid%5D/route.ts#L24).

- **Auth:** `authorizeApiRequest(request, 'assets.read')` [source](../../src/app/api/assets/%5Bid%5D/route.ts#L28); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R014](#r014) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** access.assetWhere(assets.read); чужой объект может выглядеть отсутствующим. Деталь включает операции.
- **Route scope predicates:** `assetTarget(id)` [source](../../src/app/api/assets/%5Bid%5D/route.ts#L32); `auth.access.allows('assets.read', target)` [source](../../src/app/api/assets/%5Bid%5D/route.ts#L33).
- **Service scope evidence:** `access.assetWhere('assets.read')` [source](../../src/features/assets/application/asset.service.ts#L215).
- **Calls:** [AssetService.get](../../src/features/assets/application/asset.service.ts#L212). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/%5Bid%5D/route.ts#L29); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/%5Bid%5D/route.ts#L34); enclosing checks: `target && !auth.access.allows('assets.read', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/assets/%5Bid%5D/route.ts#L37)

```ts
return asset ? apiData(asset) : apiError('ASSET_NOT_FOUND', 'Объект имущества не найден', 404)
```

[Local error mapping source](../../src/app/api/assets/%5Bid%5D/route.ts#L9)

```ts
const errorMap: Record<string, { message: string; status: number }> = {
  ASSET_NOT_FOUND: { message: 'Объект имущества не найден', status: 404 },
  QUANTITY_OPERATION_REQUIRED: { message: 'Количество изменяется только операцией поступления или списания', status: 409 },
  MOL_TRANSFER_REQUIRED: { message: 'МОЛ изменяется только через операцию передачи', status: 409 },
  CONCURRENT_UPDATE: { message: 'Данные изменились параллельно, повторите операцию', status: 409 },
}
```

</details>

<a id="api-019"></a>
### API-019: PUT /api/assets/[id]

Источник handler: [src/app/api/assets/[id]/route.ts:40](../../src/app/api/assets/%5Bid%5D/route.ts#L40).

- **Auth:** `authorizeApiRequest(request, 'assets.update')` [source](../../src/app/api/assets/%5Bid%5D/route.ts#L44); общие auth branches выше.
- **Схемы HTTP boundary:** [updateAssetSchema](#schema-23a9c957af) ([source](../../src/features/assets/contracts/schemas.ts#L74)).
- **Parsing:** `updateAssetSchema.safeParse(await request.json())` [source](../../src/app/api/assets/%5Bid%5D/route.ts#L47); `request.json()` [source](../../src/app/api/assets/%5Bid%5D/route.ts#L47).
- **Выходные формы:** [R015](#r015) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет текущие departments; новый projectId/groupId не получает отдельную resource-scope проверку.
- **Route scope predicates:** `assetTarget(id)` [source](../../src/app/api/assets/%5Bid%5D/route.ts#L50); `auth.access.allows('assets.update', { departmentIds: target.departmentIds })` [source](../../src/app/api/assets/%5Bid%5D/route.ts#L51).
- **Calls:** [AssetService.update](../../src/features/assets/application/asset.service.ts#L240). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Пересчитывает totalCost; quantity/mol изменяются только отдельными operations; audit snapshot, Serializable retry.
- **Writes/IO evidence:** `tx.asset.update` [source](../../src/features/assets/application/asset.service.ts#L250); `tx.operation.create` [source](../../src/features/assets/application/asset.service.ts#L277); `tx.auditLog.create` [source](../../src/features/assets/application/asset.service.ts#L292).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [mapAssetError](#mapper-736b16126e) ([source](../../src/app/api/assets/%5Bid%5D/route.ts#L16)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/%5Bid%5D/route.ts#L45); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/%5Bid%5D/route.ts#L48); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/assets/%5Bid%5D/route.ts#L52); enclosing checks: `target && !auth.access.allows('assets.update', { departmentIds: target.departmentIds })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/assets/%5Bid%5D/route.ts#L56)

```ts
return apiData(await AssetService.update(id, input.data, auth.user.id, auth.requestId))
```

[source](../../src/app/api/assets/%5Bid%5D/route.ts#L59); enclosing checks: `catch AND mapped`

```ts
return mapped
```

[source](../../src/app/api/assets/%5Bid%5D/route.ts#L61); enclosing checks: `catch AND error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'`

```ts
return apiError('INVENTORY_NUMBER_EXISTS', 'Инвентарный номер уже используется', 409)
```

[Local error mapping source](../../src/app/api/assets/%5Bid%5D/route.ts#L9)

```ts
const errorMap: Record<string, { message: string; status: number }> = {
  ASSET_NOT_FOUND: { message: 'Объект имущества не найден', status: 404 },
  QUANTITY_OPERATION_REQUIRED: { message: 'Количество изменяется только операцией поступления или списания', status: 409 },
  MOL_TRANSFER_REQUIRED: { message: 'МОЛ изменяется только через операцию передачи', status: 409 },
  CONCURRENT_UPDATE: { message: 'Данные изменились параллельно, повторите операцию', status: 409 },
}
```

</details>

<a id="api-020"></a>
### API-020: POST /api/assets/[id]/transfers

Источник handler: [src/app/api/assets/[id]/transfers/route.ts:17](../../src/app/api/assets/%5Bid%5D/transfers/route.ts#L17).

- **Auth:** `authorizeApiRequest(request, 'assets.transfer')` [source](../../src/app/api/assets/%5Bid%5D/transfers/route.ts#L21); общие auth branches выше.
- **Схемы HTTP boundary:** [transferAssetSchema](#schema-43de7964ad) ([source](../../src/features/assets/contracts/schemas.ts#L56)).
- **Parsing:** `transferAssetSchema.safeParse(await request.json())` [source](../../src/app/api/assets/%5Bid%5D/transfers/route.ts#L23); `request.json()` [source](../../src/app/api/assets/%5Bid%5D/transfers/route.ts#L23).
- **Выходные формы:** [R015](#r015) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет departments отправителя и получателя; service проверяет holding, остаток и получателя. Scope assets.transfer=department требует все переданные departments в одном grant.
- **Route scope predicates:** `departmentForMol(input.data.fromMolId)` [source](../../src/app/api/assets/%5Bid%5D/transfers/route.ts#L26); `departmentForMol(input.data.toMolId)` [source](../../src/app/api/assets/%5Bid%5D/transfers/route.ts#L27); `auth.access.allows('assets.transfer', { departmentIds })` [source](../../src/app/api/assets/%5Bid%5D/transfers/route.ts#L32).
- **Calls:** [AssetService.transfer](../../src/features/assets/application/asset.service.ts#L307). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Меняет holdings; создаёт TRANSFER operation, обновляет principal mol/status и audit; Serializable retry.
- **Writes/IO evidence:** `tx.assetHolding.updateMany` [source](../../src/features/assets/application/asset.service.ts#L323); `tx.assetHolding.upsert` [source](../../src/features/assets/application/asset.service.ts#L329); `tx.assetHolding.deleteMany` [source](../../src/features/assets/application/asset.service.ts#L334); `tx.asset.update` [source](../../src/features/assets/application/asset.service.ts#L337); `tx.operation.create` [source](../../src/features/assets/application/asset.service.ts#L340); `tx.auditLog.create` [source](../../src/features/assets/application/asset.service.ts#L356).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/%5Bid%5D/transfers/route.ts#L22); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/%5Bid%5D/transfers/route.ts#L24); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/assets/%5Bid%5D/transfers/route.ts#L33); enclosing checks: `departmentIds.length && !auth.access.allows('assets.transfer', { departmentIds })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/assets/%5Bid%5D/transfers/route.ts#L37)

```ts
return apiData(await AssetService.transfer((await params).id, input.data, auth.user.id, auth.requestId), { status: 201 })
```

[source](../../src/app/api/assets/%5Bid%5D/transfers/route.ts#L41); enclosing checks: `catch AND error instanceof AssetServiceError && messages[error.code]`

```ts
return apiError(error.code, message, status)
```

[Local error mapping source](../../src/app/api/assets/%5Bid%5D/transfers/route.ts#L8)

```ts
const messages: Record<string, [string, number]> = {
  ASSET_NOT_FOUND: ['Объект имущества не найден', 404],
  ASSET_ARCHIVED: ['Архивный объект нельзя передать', 409],
  HOLDING_NOT_FOUND: ['У выбранного МОЛ нет остатка этого объекта', 404],
  MOL_NOT_FOUND: ['МОЛ-получатель не найден', 404],
  INSUFFICIENT_QUANTITY: ['Недостаточный остаток для передачи', 422],
  CONCURRENT_UPDATE: ['Остаток изменился параллельно, повторите операцию', 409],
}
```

</details>

<a id="api-021"></a>
### API-021: POST /api/assets/import/commit

Источник handler: [src/app/api/assets/import/commit/route.ts:9](../../src/app/api/assets/import/commit/route.ts#L9).

- **Auth:** `authorizeApiRequest(request, 'assets.create')` [source](../../src/app/api/assets/import/commit/route.ts#L10); общие auth branches выше.
- **Схемы HTTP boundary:** [assetImportCommitSchema](#schema-1f323000b9) ([source](../../src/features/assets/contracts/asset-import.ts#L67)).
- **Вход и transport:** JSON assetImportCommitSchema strict; 1..100 assets, importAssetSchema заново нормализует и проверяет dates/decimal precision/limits; stale preview→409 fieldErrors по строкам.
- **Parsing:** `request.json()` [source](../../src/app/api/assets/import/commit/route.ts#L13); `assetImportCommitSchema.safeParse(payload)` [source](../../src/app/api/assets/import/commit/route.ts#L14).
- **Выходные формы:** [R016](#r016) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Повторная проверка уникальности, МОЛ/group и scopes перед общей записью; нельзя доверять preview/input от браузера.
- **Service scope evidence:** `access.allows('assets.create', { departmentId: mol.departmentId })` [source](../../src/features/assets/application/asset-import.service.ts#L209).
- **Calls:** [AssetImportService.validateCommit](../../src/features/assets/application/asset-import.service.ts#L361), [AssetService.createMany](../../src/features/assets/application/asset.service.ts#L231). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Вся пачка в одной serializable transaction (timeout 30s); каждый asset+holding+RECEIPT+audit; result importedCount.
- **Writes/IO evidence:** `tx.asset.create` [source](../../src/features/assets/application/asset.service.ts#L36); `tx.assetHolding.create` [source](../../src/features/assets/application/asset.service.ts#L64); `tx.operation.create` [source](../../src/features/assets/application/asset.service.ts#L65); `tx.auditLog.create` [source](../../src/features/assets/application/asset.service.ts#L80).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/import/commit/route.ts#L11); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/import/commit/route.ts#L15); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/assets/import/commit/route.ts#L19); enclosing checks: `validationErrors.size`

```ts
return apiError(
      'ASSET_IMPORT_REVIEW_REQUIRED',
      'Данные изменились или обнаружена ошибка. Загрузите файл заново и проверьте предварительный просмотр',
      409,
      Object.fromEntries(Array.from(validationErrors, ([row, errors]) => [`строка ${row}`, errors])),
    )
```

[source](../../src/app/api/assets/import/commit/route.ts#L29)

```ts
return apiData({
      importedCount,
      inventoryNumbers: input.data.assets.map((asset) => asset.inventoryNumber),
    }, { status: 201 })
```

[source](../../src/app/api/assets/import/commit/route.ts#L35); enclosing checks: `catch AND error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'`

```ts
return apiError(
        'INVENTORY_NUMBER_EXISTS',
        'Инвентарный номер успели зарегистрировать после проверки. Загрузите файл и повторите предварительный просмотр',
        409,
      )
```

</details>

<a id="api-022"></a>
### API-022: POST /api/assets/import/preview

Источник handler: [src/app/api/assets/import/preview/route.ts:10](../../src/app/api/assets/import/preview/route.ts#L10).

- **Auth:** `authorizeApiRequest(request, 'assets.create')` [source](../../src/app/api/assets/import/preview/route.ts#L11); общие auth branches выше.
- **Вход и transport:** multipart/form-data: поле file обязано иметь arrayBuffer/size и имя .xlsx без учёта регистра; <=5 MiB; parser <=100 nonblank rows и фиксированные headers.
- **Parsing:** `request.formData()` [source](../../src/app/api/assets/import/preview/route.ts#L14).
- **Выходные формы:** [R017](#r017) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Доступ к МОЛ проверяется по assets.create; справочники и существующие inventory numbers перепроверяются. Ошибки отдельных строк входят в rows[].errors, HTTP 200.
- **Service scope evidence:** `access.allows('assets.create', { departmentId: mol.departmentId })` [source](../../src/features/assets/application/asset-import.service.ts#L306); `candidate.error.issues.filter((issue) => !(issue.path[0] === 'unitPrice' && unitPrice === undefined) && !(issue.path[0] === 'quantity' && quantity === undefined), )` [source](../../src/features/assets/application/asset-import.service.ts#L173); `access.allows('assets.create', { departmentId: mol.departmentId })` [source](../../src/features/assets/application/asset-import.service.ts#L209).
- **Calls:** [AssetImportService.parseWorkbook](../../src/features/assets/application/asset-import.service.ts#L226), [AssetImportService.preview](../../src/features/assets/application/asset-import.service.ts#L286). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Читает workbook; limits sheet/rows/header/формулы и coercion в parser; до DB create не доходит. Парсинг Excel/DB validation; business write отсутствует.
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/import/preview/route.ts#L12); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/import/preview/route.ts#L17); enclosing checks: `!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function' || typeof file.size !== 'number'`

```ts
return apiError('ASSET_IMPORT_FILE_REQUIRED', 'Выберите файл Excel для проверки', 422)
```

[source](../../src/app/api/assets/import/preview/route.ts#L20); enclosing checks: `!file.name.toLocaleLowerCase('ru-RU').endsWith('.xlsx')`

```ts
return apiError('ASSET_IMPORT_FORMAT_UNSUPPORTED', 'Поддерживается шаблон Excel в формате .xlsx', 422)
```

[source](../../src/app/api/assets/import/preview/route.ts#L23); enclosing checks: `file.size > MAX_ASSET_IMPORT_FILE_BYTES`

```ts
return apiError('ASSET_IMPORT_FILE_TOO_LARGE', 'Файл слишком большой. Максимальный размер — 5 МБ', 422)
```

[source](../../src/app/api/assets/import/preview/route.ts#L29)

```ts
return apiData({
      rows: preview,
      validCount: preview.filter((row) => row.input && row.errors.length === 0).length,
      errorCount: preview.filter((row) => row.errors.length > 0).length,
    })
```

[source](../../src/app/api/assets/import/preview/route.ts#L36); enclosing checks: `catch AND error instanceof AssetImportError`

```ts
return apiError('ASSET_IMPORT_INVALID_FILE', error.message, 422)
```

</details>

<a id="api-023"></a>
### API-023: GET /api/assets/import/template

Источник handler: [src/app/api/assets/import/template/route.ts:7](../../src/app/api/assets/import/template/route.ts#L7).

- **Auth:** `authorizeApiRequest(request, 'assets.create')` [source](../../src/app/api/assets/import/template/route.ts#L8); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Binary/headers:** 200 XLSX buffered Uint8Array; filename asset-import-template.xlsx, cache-control no-store.
- **Resource scope:** Лист МОЛ ограничен assets.create; справочник групп не имеет resource scope.
- **Service scope evidence:** `access.allowedDepartmentIds('assets.create')` [source](../../src/features/assets/application/asset-import.service.ts#L367).
- **Calls:** [AssetImportService.createTemplate](../../src/features/assets/application/asset-import.service.ts#L365). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Генерирует workbook с шаблоном и доступными справочниками; business write отсутствует.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/import/template/route.ts#L9); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/import/template/route.ts#L12)

```ts
return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': XLSX_MIME,
      'content-disposition': 'attachment; filename="asset-import-template.xlsx"',
      'cache-control': 'no-store',
    },
  })
```

</details>

<a id="api-024"></a>
### API-024: POST /api/assets/inventories/[id]/complete

Источник handler: [src/app/api/assets/inventories/[id]/complete/route.ts:7](../../src/app/api/assets/inventories/%5Bid%5D/complete/route.ts#L7).

- **Auth:** `authorizeApiRequest(request, 'assets.inventory.manage')` [source](../../src/app/api/assets/inventories/%5Bid%5D/complete/route.ts#L11); общие auth branches выше.
- **Вход и transport:** Body/query не читаются.
- **Выходные формы:** [R018](#r018) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Inventory в разрешённом department; повторное завершение даёт INVENTORY_COMPLETED.
- **Service scope evidence:** `access.allows( 'assets.inventory.manage', { departmentId: inventory.mol.departmentId }, )` [source](../../src/features/assets/application/inventory.service.ts#L305).
- **Calls:** [AssetInventoryService.complete](../../src/features/assets/application/inventory.service.ts#L298), [getAssetInventoryService](../../src/features/assets/application/inventory.service.ts#L340). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** status COMPLETED+completedAt+audit; inventory расхождения сами не создают operation.
- **Writes/IO evidence:** `tx.assetInventory.update` [source](../../src/features/assets/application/inventory.service.ts#L318); `tx.auditLog.create` [source](../../src/features/assets/application/inventory.service.ts#L323).
- **Error maps:** [assetInventoryApiError](#mapper-9d396433e5) ([source](../../src/features/assets/application/inventory-http.ts#L14)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/inventories/%5Bid%5D/complete/route.ts#L12); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/inventories/%5Bid%5D/complete/route.ts#L15)

```ts
return apiData(await getAssetInventoryService().complete(
      id,
      auth.user.id,
      auth.access,
      auth.requestId,
    ))
```

[source](../../src/app/api/assets/inventories/%5Bid%5D/complete/route.ts#L23); enclosing checks: `catch AND response`

```ts
return response
```

</details>

<a id="api-025"></a>
### API-025: GET /api/assets/inventories/[id]

Источник handler: [src/app/api/assets/inventories/[id]/route.ts:8](../../src/app/api/assets/inventories/%5Bid%5D/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'assets.inventory.manage')` [source](../../src/app/api/assets/inventories/%5Bid%5D/route.ts#L12); общие auth branches выше.
- **Схемы HTTP boundary:** [assetInventoryEntriesQuerySchema](#schema-586a726670) ([source](../../src/features/assets/contracts/inventory.ts#L22)).
- **Parsing:** `assetInventoryEntriesQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))` [source](../../src/app/api/assets/inventories/%5Bid%5D/route.ts#L14).
- **Выходные формы:** [R019](#r019) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Проверяет department МОЛ конкретной inventory до выдачи entries/summary.
- **Service scope evidence:** `access.allows( 'assets.inventory.manage', { departmentId: inventory.mol.departmentId }, )` [source](../../src/features/assets/application/inventory.service.ts#L172).
- **Calls:** [AssetInventoryService.get](../../src/features/assets/application/inventory.service.ts#L159), [getAssetInventoryService](../../src/features/assets/application/inventory.service.ts#L340). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [assetInventoryApiError](#mapper-9d396433e5) ([source](../../src/features/assets/application/inventory-http.ts#L14)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/inventories/%5Bid%5D/route.ts#L13); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/inventories/%5Bid%5D/route.ts#L15); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/assets/inventories/%5Bid%5D/route.ts#L18)

```ts
return apiData(await getAssetInventoryService().get(id, query.data, auth.access))
```

[source](../../src/app/api/assets/inventories/%5Bid%5D/route.ts#L21); enclosing checks: `catch AND response`

```ts
return response
```

</details>

<a id="api-026"></a>
### API-026: POST /api/assets/inventories/[id]/scan

Источник handler: [src/app/api/assets/inventories/[id]/scan/route.ts:8](../../src/app/api/assets/inventories/%5Bid%5D/scan/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'assets.inventory.manage')` [source](../../src/app/api/assets/inventories/%5Bid%5D/scan/route.ts#L12); общие auth branches выше.
- **Схемы HTTP boundary:** [recordAssetInventoryCountSchema](#schema-1958d2cb6a) ([source](../../src/features/assets/contracts/inventory.ts#L8)).
- **Parsing:** `recordAssetInventoryCountSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/assets/inventories/%5Bid%5D/scan/route.ts#L14); `request.json()` [source](../../src/app/api/assets/inventories/%5Bid%5D/scan/route.ts#L14).
- **Выходные формы:** [R020](#r020) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Inventory в разрешённом department и IN_PROGRESS; номер должен входить в её snapshot.
- **Service scope evidence:** `access.allows( 'assets.inventory.manage', { departmentId: inventory.mol.departmentId }, )` [source](../../src/features/assets/application/inventory.service.ts#L254).
- **Calls:** [AssetInventoryService.recordCount](../../src/features/assets/application/inventory.service.ts#L241), [getAssetInventoryService](../../src/features/assets/application/inventory.service.ts#L340). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Обновляет snapshot foundQuantity/note/scannedBy/At, audit; не корректирует asset quantity.
- **Writes/IO evidence:** `tx.assetInventoryEntry.update` [source](../../src/features/assets/application/inventory.service.ts#L270); `tx.auditLog.create` [source](../../src/features/assets/application/inventory.service.ts#L279).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [assetInventoryApiError](#mapper-9d396433e5) ([source](../../src/features/assets/application/inventory-http.ts#L14)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/inventories/%5Bid%5D/scan/route.ts#L13); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/inventories/%5Bid%5D/scan/route.ts#L15); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/assets/inventories/%5Bid%5D/scan/route.ts#L18)

```ts
return apiData(await getAssetInventoryService().recordCount(
      id,
      input.data,
      auth.user.id,
      auth.access,
      auth.requestId,
    ))
```

[source](../../src/app/api/assets/inventories/%5Bid%5D/scan/route.ts#L27); enclosing checks: `catch AND response`

```ts
return response
```

</details>

<a id="api-027"></a>
### API-027: GET /api/assets/inventories/options

Источник handler: [src/app/api/assets/inventories/options/route.ts:6](../../src/app/api/assets/inventories/options/route.ts#L6).

- **Auth:** `authorizeApiRequest(request, 'assets.inventory.manage')` [source](../../src/app/api/assets/inventories/options/route.ts#L7); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R021](#r021) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Только МОЛ в разрешённых departments для assets.inventory.manage.
- **Service scope evidence:** `access.allows('assets.inventory.manage', { departmentId: mol.departmentId })` [source](../../src/features/assets/application/inventory.service.ts#L79); `access.allowedDepartmentIds('assets.inventory.manage')` [source](../../src/features/assets/application/inventory.service.ts#L16).
- **Calls:** [AssetInventoryService.mols](../../src/features/assets/application/inventory.service.ts#L61), [getAssetInventoryService](../../src/features/assets/application/inventory.service.ts#L340). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/inventories/options/route.ts#L8); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/inventories/options/route.ts#L9)

```ts
return apiData(await getAssetInventoryService().mols(auth.access))
```

</details>

<a id="api-028"></a>
### API-028: GET /api/assets/inventories/resolve

Источник handler: [src/app/api/assets/inventories/resolve/route.ts:6](../../src/app/api/assets/inventories/resolve/route.ts#L6).

- **Auth:** `authorizeApiRequest(request, 'assets.inventory.manage')` [source](../../src/app/api/assets/inventories/resolve/route.ts#L7); общие auth branches выше.
- **Вход и transport:** number обязательный query, trim, длина 1..100; без Zod.
- **Query/header reads:** `request.nextUrl.searchParams.get('number')?.trim()` [source](../../src/app/api/assets/inventories/resolve/route.ts#L9); `request.nextUrl.searchParams.get('number')` [source](../../src/app/api/assets/inventories/resolve/route.ts#L9).
- **Выходные формы:** [R022](#r022) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Ищет позиции незавершённых inventory, доступных по department МОЛ; номер trim, 1..100.
- **Service scope evidence:** `entries .filter((entry) => access.allows( 'assets.inventory.manage', { departmentId: entry.inventory.mol.departmentId }, )) .map(({ inventory, ...entry }) => ({ ...entry, inventory: { id: inventory.id, name: inventory.name, mol: inventory.mol, }, }))` [source](../../src/features/assets/application/inventory.service.ts#L226); `access.allows( 'assets.inventory.manage', { departmentId: entry.inventory.mol.departmentId }, )` [source](../../src/features/assets/application/inventory.service.ts#L227).
- **Calls:** [AssetInventoryService.resolve](../../src/features/assets/application/inventory.service.ts#L212), [getAssetInventoryService](../../src/features/assets/application/inventory.service.ts#L340). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/inventories/resolve/route.ts#L8); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/inventories/resolve/route.ts#L11); enclosing checks: `!inventoryNumber || inventoryNumber.length > 100`

```ts
return apiError('VALIDATION_ERROR', 'Укажите корректный инвентарный номер', 422)
```

[source](../../src/app/api/assets/inventories/resolve/route.ts#L14)

```ts
return apiData(entries)
```

</details>

<a id="api-029"></a>
### API-029: GET /api/assets/inventories

Источник handler: [src/app/api/assets/inventories/route.ts:11](../../src/app/api/assets/inventories/route.ts#L11).

- **Auth:** `authorizeApiRequest(request, 'assets.inventory.manage')` [source](../../src/app/api/assets/inventories/route.ts#L12); общие auth branches выше.
- **Схемы HTTP boundary:** [assetInventoryListQuerySchema](#schema-46736f1d7b) ([source](../../src/features/assets/contracts/inventory.ts#L17)).
- **Parsing:** `assetInventoryListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))` [source](../../src/app/api/assets/inventories/route.ts#L15).
- **Выходные формы:** [R023](#r023) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Ограничивает inventory по departments МОЛ через assets.inventory.manage.
- **Service scope evidence:** `access.allowedDepartmentIds('assets.inventory.manage')` [source](../../src/features/assets/application/inventory.service.ts#L16).
- **Calls:** [AssetInventoryService.list](../../src/features/assets/application/inventory.service.ts#L31), [getAssetInventoryService](../../src/features/assets/application/inventory.service.ts#L340). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/inventories/route.ts#L13); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/inventories/route.ts#L16); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/assets/inventories/route.ts#L18)

```ts
return apiList(result.inventories, {
    page: query.data.page,
    pageSize: query.data.pageSize,
    total: result.total,
  })
```

</details>

<a id="api-030"></a>
### API-030: POST /api/assets/inventories

Источник handler: [src/app/api/assets/inventories/route.ts:25](../../src/app/api/assets/inventories/route.ts#L25).

- **Auth:** `authorizeApiRequest(request, 'assets.inventory.manage')` [source](../../src/app/api/assets/inventories/route.ts#L26); общие auth branches выше.
- **Схемы HTTP boundary:** [createAssetInventorySchema](#schema-16da03d912) ([source](../../src/features/assets/contracts/inventory.ts#L3)).
- **Parsing:** `createAssetInventorySchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/assets/inventories/route.ts#L29); `request.json()` [source](../../src/app/api/assets/inventories/route.ts#L29).
- **Выходные формы:** [R024](#r024) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** МОЛ active department и assets.inventory.manage; snapshot только положительных holdings этого МОЛ, дополнительно assetWhere(assets.read), без archived assets.
- **Service scope evidence:** `access.allows('assets.inventory.manage', { departmentId: mol.departmentId })` [source](../../src/features/assets/application/inventory.service.ts#L93); `access.assetWhere('assets.read')` [source](../../src/features/assets/application/inventory.service.ts#L101).
- **Calls:** [AssetInventoryService.create](../../src/features/assets/application/inventory.service.ts#L82), [getAssetInventoryService](../../src/features/assets/application/inventory.service.ts#L340). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Создаёт inventory и snapshot entries, max 5000 позиций, audit; фактические asset holdings не меняются.
- **Writes/IO evidence:** `tx.assetInventory.create` [source](../../src/features/assets/application/inventory.service.ts#L122); `tx.auditLog.create` [source](../../src/features/assets/application/inventory.service.ts#L145).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [assetInventoryApiError](#mapper-9d396433e5) ([source](../../src/features/assets/application/inventory-http.ts#L14)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/inventories/route.ts#L27); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/inventories/route.ts#L30); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/assets/inventories/route.ts#L38)

```ts
return apiData(inventory, { status: 201 })
```

[source](../../src/app/api/assets/inventories/route.ts#L41); enclosing checks: `catch AND response`

```ts
return response
```

</details>

<a id="api-031"></a>
### API-031: GET /api/assets

Источник handler: [src/app/api/assets/route.ts:10](../../src/app/api/assets/route.ts#L10).

- **Auth:** `authorizeApiRequest(request, 'assets.read')` [source](../../src/app/api/assets/route.ts#L11); общие auth branches выше.
- **Схемы HTTP boundary:** [assetsQuerySchema](#schema-a9481ccf7f) ([source](../../src/features/assets/contracts/schemas.ts#L79)).
- **Вход и transport:** Query aliases: isArchived→archived только если archived не задан; limit→pageSize только если pageSize не задан.
- **Parsing:** `assetsQuerySchema.safeParse(rawQuery)` [source](../../src/app/api/assets/route.ts#L21).
- **Выходные формы:** [R025](#r025) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** access.assetWhere(assets.read) вместе с filters; связь с МОЛ определяется положительными holdings.
- **Service scope evidence:** `access.assetWhere('assets.read')` [source](../../src/features/assets/application/asset.service.ts#L173).
- **Calls:** [AssetService.list](../../src/features/assets/application/asset.service.ts#L146). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/route.ts#L12); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/route.ts#L22); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/assets/route.ts#L25)

```ts
return apiList(result.assets, { page: query.data.page, pageSize: query.data.pageSize, total: result.total })
```

</details>

<a id="api-032"></a>
### API-032: POST /api/assets

Источник handler: [src/app/api/assets/route.ts:28](../../src/app/api/assets/route.ts#L28).

- **Auth:** `authorizeApiRequest(request, 'assets.create')` [source](../../src/app/api/assets/route.ts#L29); общие auth branches выше.
- **Схемы HTTP boundary:** [createAssetSchema](#schema-eecb5d4b27) ([source](../../src/features/assets/contracts/schemas.ts#L3)).
- **Parsing:** `createAssetSchema.safeParse(await request.json())` [source](../../src/app/api/assets/route.ts#L32); `request.json()` [source](../../src/app/api/assets/route.ts#L32).
- **Выходные формы:** [R026](#r026) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет department МОЛ, когда он существует; отдельно projectId resource scope не проверяется.
- **Route scope predicates:** `departmentForMol(input.data.molId)` [source](../../src/app/api/assets/route.ts#L34); `auth.access.allows('assets.create', { departmentId })` [source](../../src/app/api/assets/route.ts#L35).
- **Calls:** [AssetService.create](../../src/features/assets/application/asset.service.ts#L227). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Serializable transaction: asset + initial holding + RECEIPT operation + audit; response с mol/group/positive holdings.
- **Writes/IO evidence:** `tx.asset.create` [source](../../src/features/assets/application/asset.service.ts#L36); `tx.assetHolding.create` [source](../../src/features/assets/application/asset.service.ts#L64); `tx.operation.create` [source](../../src/features/assets/application/asset.service.ts#L65); `tx.auditLog.create` [source](../../src/features/assets/application/asset.service.ts#L80).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/route.ts#L30); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/route.ts#L33); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/assets/route.ts#L36); enclosing checks: `departmentId && !auth.access.allows('assets.create', { departmentId })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/assets/route.ts#L40)

```ts
return apiData(await AssetService.create(input.data, auth.user.id, auth.requestId), { status: 201 })
```

[source](../../src/app/api/assets/route.ts#L43); enclosing checks: `catch AND error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'`

```ts
return apiError('INVENTORY_NUMBER_EXISTS', 'Инвентарный номер уже используется', 409)
```

</details>

<a id="api-033"></a>
### API-033: DELETE /api/assets/saved-views/[id]

Источник handler: [src/app/api/assets/saved-views/[id]/route.ts:6](../../src/app/api/assets/saved-views/%5Bid%5D/route.ts#L6).

- **Auth:** `authorizeApiRequest(request, 'assets.read')` [source](../../src/app/api/assets/saved-views/%5Bid%5D/route.ts#L10); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Resource scope:** deleteMany с id AND userId=actor; чужой ID даёт 404.
- **Calls:** [AssetSavedViewService.delete](../../src/features/assets/application/saved-view.service.ts#L33), [getAssetSavedViewService](../../src/features/assets/application/saved-view.service.ts#L43). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Удаляет собственный AssetSavedView; audit/outbox отсутствуют.
- **Writes/IO evidence:** `this.db.assetSavedView.deleteMany` [source](../../src/features/assets/application/saved-view.service.ts#L34).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/saved-views/%5Bid%5D/route.ts#L11); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/saved-views/%5Bid%5D/route.ts#L16); enclosing checks: `!deleted`

```ts
return apiError('SAVED_VIEW_NOT_FOUND', 'Представление не найдено', 404)
```

[source](../../src/app/api/assets/saved-views/%5Bid%5D/route.ts#L18)

```ts
return new Response(null, { status: 204 })
```

</details>

<a id="api-034"></a>
### API-034: GET /api/assets/saved-views

Источник handler: [src/app/api/assets/saved-views/route.ts:11](../../src/app/api/assets/saved-views/route.ts#L11).

- **Auth:** `authorizeApiRequest(request, 'assets.read')` [source](../../src/app/api/assets/saved-views/route.ts#L12); общие auth branches выше.
- **Схемы HTTP boundary:** [assetSavedViewFiltersSchema](#schema-8aec9ce6fa) ([source](../../src/features/assets/contracts/saved-view.ts#L3)).
- **Parsing:** `assetSavedViewFiltersSchema.parse(view.filters)` [source](../../src/app/api/assets/saved-views/route.ts#L18).
- **Выходные формы:** [R027](#r027) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Только userId=actor; имя и filters принадлежат пользователю.
- **Calls:** [AssetSavedViewService.list](../../src/features/assets/application/saved-view.service.ts#L10), [getAssetSavedViewService](../../src/features/assets/application/saved-view.service.ts#L43). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/saved-views/route.ts#L13); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/saved-views/route.ts#L16)

```ts
return apiData(views.map((view) => ({
    ...view,
    filters: assetSavedViewFiltersSchema.parse(view.filters),
  })))
```

</details>

<a id="api-035"></a>
### API-035: POST /api/assets/saved-views

Источник handler: [src/app/api/assets/saved-views/route.ts:22](../../src/app/api/assets/saved-views/route.ts#L22).

- **Auth:** `authorizeApiRequest(request, 'assets.read')` [source](../../src/app/api/assets/saved-views/route.ts#L23); общие auth branches выше.
- **Схемы HTTP boundary:** [createAssetSavedViewSchema](#schema-46e0b80a66) ([source](../../src/features/assets/contracts/saved-view.ts#L23)).
- **Parsing:** `createAssetSavedViewSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/assets/saved-views/route.ts#L26); `request.json()` [source](../../src/app/api/assets/saved-views/route.ts#L26).
- **Выходные формы:** [R028](#r028) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Создаёт userId=actor; unique(userId,name); значения filter IDs не разрешают чтение чужих assets.
- **Calls:** [AssetSavedViewService.create](../../src/features/assets/application/saved-view.service.ts#L18), [getAssetSavedViewService](../../src/features/assets/application/saved-view.service.ts#L43). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Создаёт собственный AssetSavedView; audit/outbox отсутствуют.
- **Writes/IO evidence:** `this.db.assetSavedView.create` [source](../../src/features/assets/application/saved-view.service.ts#L23).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/assets/saved-views/route.ts#L24); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/assets/saved-views/route.ts#L27); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/assets/saved-views/route.ts#L30)

```ts
return apiData(
      await getAssetSavedViewService().create(auth.user.id, input.data),
      { status: 201 },
    )
```

[source](../../src/app/api/assets/saved-views/route.ts#L36); enclosing checks: `catch AND error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'`

```ts
return apiError('SAVED_VIEW_EXISTS', 'Представление с таким названием уже существует', 409)
```

</details>

<a id="api-036"></a>
### API-036: GET /api/auth/[...nextauth]

Источник handler: [src/app/api/auth/[...nextauth]/route.ts:4](../../src/app/api/auth/%5B...nextauth%5D/route.ts#L4).

- **Auth/response:** protocol NextAuth в разделе выше; dispatch и cookie/CSRF стороннего handler, общий apiData не применяется.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Resource scope:** NextAuth JWT/cookie/CSRF protocol; authorizeApiRequest не вызывается. Business endpoints позже повторно загружают user и sessionVersion.
- **Side effects:** GET csrf/session может выдавать/обновлять cookie; POST callback/credentials пишет login counters,lastLoginAt и cookie, POST signout удаляет cookie. JWT/session callbacks сами role assignment DB не читают.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

`NextAuth(authOptions)`; см. action dispatch выше. Снимок dependency в JSON.authVendorSources.
</details>

<a id="api-037"></a>
### API-037: POST /api/auth/[...nextauth]

Источник handler: [src/app/api/auth/[...nextauth]/route.ts:4](../../src/app/api/auth/%5B...nextauth%5D/route.ts#L4).

- **Auth/response:** protocol NextAuth в разделе выше; dispatch и cookie/CSRF стороннего handler, общий apiData не применяется.
- **Схемы HTTP boundary:** [credentialsSchema](#schema-ac4976ca83) ([source](../../src/lib/auth.ts#L7)).
- **Resource scope:** NextAuth JWT/cookie/CSRF protocol; authorizeApiRequest не вызывается. Business endpoints позже повторно загружают user и sessionVersion.
- **Side effects:** GET csrf/session может выдавать/обновлять cookie; POST callback/credentials пишет login counters,lastLoginAt и cookie, POST signout удаляет cookie. JWT/session callbacks сами role assignment DB не читают.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

`NextAuth(authOptions)`; см. action dispatch выше. Снимок dependency в JSON.authVendorSources.
</details>

<a id="api-038"></a>
### API-038: PATCH /api/departments/[id]

Источник handler: [src/app/api/departments/[id]/route.ts:15](../../src/app/api/departments/%5Bid%5D/route.ts#L15).

- **Auth:** `authorizeApiRequest(request, 'departments.update')` [source](../../src/app/api/departments/%5Bid%5D/route.ts#L19); общие auth branches выше.
- **Схемы HTTP boundary:** [updateDepartmentSchema](#schema-c1166dfc00) ([source](../../src/features/departments/contracts/schemas.ts#L22)).
- **Parsing:** `updateDepartmentSchema.safeParse(await request.json())` [source](../../src/app/api/departments/%5Bid%5D/route.ts#L21); `request.json()` [source](../../src/app/api/departments/%5Bid%5D/route.ts#L21).
- **Выходные формы:** [R029](#r029) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет текущий department id; новый parent/head проверяются бизнес-инвариантами, отдельного resource scope нет.
- **Route scope predicates:** `auth.access.allows('departments.update', { departmentId: id })` [source](../../src/app/api/departments/%5Bid%5D/route.ts#L24).
- **Calls:** [DepartmentService.update](../../src/features/departments/application/department.service.ts#L216). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Organization mutation lock, tree/active/head rules; department и связанные display names + audit.
- **Writes/IO evidence:** `tx.department.update` [source](../../src/features/departments/application/department.service.ts#L235); `tx.employee.updateMany` [source](../../src/features/departments/application/department.service.ts#L249); `tx.staffSchedule.updateMany` [source](../../src/features/departments/application/department.service.ts#L253); `tx.mol.updateMany` [source](../../src/features/departments/application/department.service.ts#L257); `tx.auditLog.create` [source](../../src/features/departments/application/department.service.ts#L264).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [mapDepartmentError](#mapper-99b29f36a0) ([source](../../src/app/api/departments/%5Bid%5D/route.ts#L11)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/departments/%5Bid%5D/route.ts#L20); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/departments/%5Bid%5D/route.ts#L22); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/departments/%5Bid%5D/route.ts#L25); enclosing checks: `!auth.access.allows('departments.update', { departmentId: id })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/departments/%5Bid%5D/route.ts#L28)

```ts
return apiData(
      await DepartmentService.update(id, input.data, auth.user.id, auth.requestId),
    )
```

[source](../../src/app/api/departments/%5Bid%5D/route.ts#L32); enclosing checks: `catch AND error instanceof DepartmentServiceError`

```ts
return mapDepartmentError(error)
```

</details>

<a id="api-039"></a>
### API-039: DELETE /api/departments/[id]

Источник handler: [src/app/api/departments/[id]/route.ts:37](../../src/app/api/departments/%5Bid%5D/route.ts#L37).

- **Auth:** `authorizeApiRequest(request, 'departments.delete')` [source](../../src/app/api/departments/%5Bid%5D/route.ts#L41); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R030](#r030) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет department id; service проверяет usage/dependencies.
- **Route scope predicates:** `auth.access.allows('departments.delete', { departmentId: id })` [source](../../src/app/api/departments/%5Bid%5D/route.ts#L44).
- **Calls:** [DepartmentService.delete](../../src/features/departments/application/department.service.ts#L296). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Organization mutation lock, usage checks; physical department delete и audit в transaction.
- **Writes/IO evidence:** `tx.department.delete` [source](../../src/features/departments/application/department.service.ts#L307); `tx.auditLog.create` [source](../../src/features/departments/application/department.service.ts#L308).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [mapDepartmentError](#mapper-99b29f36a0) ([source](../../src/app/api/departments/%5Bid%5D/route.ts#L11)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/departments/%5Bid%5D/route.ts#L42); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/departments/%5Bid%5D/route.ts#L45); enclosing checks: `!auth.access.allows('departments.delete', { departmentId: id })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/departments/%5Bid%5D/route.ts#L48)

```ts
return apiData(
      await DepartmentService.delete(id, auth.user.id, auth.requestId),
    )
```

[source](../../src/app/api/departments/%5Bid%5D/route.ts#L52); enclosing checks: `catch AND error instanceof DepartmentServiceError`

```ts
return mapDepartmentError(error)
```

</details>

<a id="api-040"></a>
### API-040: GET /api/departments

Источник handler: [src/app/api/departments/route.ts:18](../../src/app/api/departments/route.ts#L18).

- **Auth:** `authorizeApiRequest(request, 'departments.read')` [source](../../src/app/api/departments/route.ts#L19); общие auth branches выше.
- **Схемы HTTP boundary:** [departmentsQuerySchema](#schema-325b28d603) ([source](../../src/features/departments/contracts/schemas.ts#L32)).
- **Parsing:** `departmentsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))` [source](../../src/app/api/departments/route.ts#L21).
- **Выходные формы:** [R031](#r031) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** departmentWhere(departments.read); возвращаемые usage counts берутся из relation counts.
- **Service scope evidence:** `access.departmentWhere('departments.read')` [source](../../src/features/departments/application/department.service.ts#L149).
- **Calls:** [DepartmentService.list](../../src/features/departments/application/department.service.ts#L141). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/departments/route.ts#L20); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/departments/route.ts#L22); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/departments/route.ts#L23)

```ts
return apiData(await DepartmentService.list(query.data, auth.access))
```

</details>

<a id="api-041"></a>
### API-041: POST /api/departments

Источник handler: [src/app/api/departments/route.ts:26](../../src/app/api/departments/route.ts#L26).

- **Auth:** `authorizeApiRequest(request, 'departments.create')` [source](../../src/app/api/departments/route.ts#L27); общие auth branches выше.
- **Схемы HTTP boundary:** [createDepartmentSchema](#schema-feffe27de4) ([source](../../src/features/departments/contracts/schemas.ts#L20)).
- **Parsing:** `createDepartmentSchema.safeParse(await request.json())` [source](../../src/app/api/departments/route.ts#L29); `request.json()` [source](../../src/app/api/departments/route.ts#L29).
- **Выходные формы:** [R029](#r029) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** departments.create — scope none; resource scope parent/head не проверяется отдельно, валидируются existence/status/tree.
- **Calls:** [DepartmentService.create](../../src/features/departments/application/department.service.ts#L171). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Organization mutation lock, normalization/parent/head/tree rules, department и audit в transaction.
- **Writes/IO evidence:** `tx.department.create` [source](../../src/features/departments/application/department.service.ts#L181); `tx.auditLog.create` [source](../../src/features/departments/application/department.service.ts#L191).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [mapDepartmentError](#mapper-578ed40228) ([source](../../src/app/api/departments/route.ts#L14)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/departments/route.ts#L28); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/departments/route.ts#L30); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/departments/route.ts#L32)

```ts
return apiData(
      await DepartmentService.create(input.data, auth.user.id, auth.requestId),
      { status: 201 },
    )
```

[source](../../src/app/api/departments/route.ts#L37); enclosing checks: `catch AND error instanceof DepartmentServiceError`

```ts
return mapDepartmentError(error)
```

</details>

<a id="api-042"></a>
### API-042: POST /api/documents/[id]/archive

Источник handler: [src/app/api/documents/[id]/archive/route.ts:15](../../src/app/api/documents/%5Bid%5D/archive/route.ts#L15).

- **Auth:** `authorizeApiRequest(request, 'documents.archive')` [source](../../src/app/api/documents/%5Bid%5D/archive/route.ts#L16); общие auth branches выше.
- **Схемы HTTP boundary:** [archiveDocumentSchema](#schema-85d1f910db) ([source](../../src/features/documents/contracts/document.ts#L40)).
- **Parsing:** `archiveDocumentSchema.safeParse(await parseJsonRequest(request))` [source](../../src/app/api/documents/%5Bid%5D/archive/route.ts#L21); `parseJsonRequest(request)` [source](../../src/app/api/documents/%5Bid%5D/archive/route.ts#L21).
- **Выходные формы:** [R032](#r032) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** documents.archive на текущие связи + lockVersion; отдельные правила состояния.
- **Service scope evidence:** `documentVisibilityWhere(actor, permission)` [source](../../src/features/documents/application/document.service.ts#L159); `actor.access.has(permission)` [source](../../src/features/documents/domain/document-access.ts#L21); `actor.access.documentWhere(permission)` [source](../../src/features/documents/domain/document-access.ts#L22).
- **Calls:** [DocumentService.archive](../../src/features/documents/application/document.service.ts#L575), [parseJsonRequest](../../src/features/documents/application/http.ts#L79), [getDocumentService](../../src/features/documents/application/document.service.ts#L724). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Document advisory lock + optimistic lockVersion; status ARCHIVED/archivedAt и audit. Файлы остаются в storage.
- **Writes/IO evidence:** `tx.document.update` [source](../../src/features/documents/application/document.service.ts#L595); `tx.auditLog.create` [source](../../src/features/documents/application/document.service.ts#L604).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [documentApiError](#mapper-c1b7a22109) ([source](../../src/features/documents/application/http.ts#L90)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/documents/%5Bid%5D/archive/route.ts#L17); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/documents/%5Bid%5D/archive/route.ts#L22); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/documents/%5Bid%5D/archive/route.ts#L23)

```ts
return apiData(
      await getDocumentService().archive(
        id,
        input.data.lockVersion,
        { id: auth.user.id, access: auth.access },
        auth.requestId,
      ),
    )
```

[source](../../src/app/api/documents/%5Bid%5D/archive/route.ts#L32); enclosing checks: `catch`

```ts
return documentApiError(error)
```

</details>

<a id="api-043"></a>
### API-043: GET /api/documents/[id]/download

Источник handler: [src/app/api/documents/[id]/download/route.ts:23](../../src/app/api/documents/%5Bid%5D/download/route.ts#L23).

- **Auth:** `authorizeApiRequest(request, 'documents.download')` [source](../../src/app/api/documents/%5Bid%5D/download/route.ts#L24); общие auth branches выше.
- **Схемы HTTP boundary:** [querySchema](#schema-f7779812ff) ([source](../../src/app/api/documents/%5Bid%5D/download/route.ts#L16)).
- **Parsing:** `querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))` [source](../../src/app/api/documents/%5Bid%5D/download/route.ts#L27).
- **Binary/headers:** 200 streaming file; MIME из version, Content-Length exact size, attachment RFC5987 filename*, ETag sha256, private,no-store, nosniff, X-Request-ID. Range/conditional 304 branch отсутствует.
- **Resource scope:** documents.download на текущие связи; версия либо явно выбранная, либо максимальная versionNumber (orderBy desc/take 1; currentVersion не используется как filter).
- **Service scope evidence:** `documentVisibilityWhere(actor, permission)` [source](../../src/features/documents/application/document.service.ts#L159); `actor.access.has(permission)` [source](../../src/features/documents/domain/document-access.ts#L21); `actor.access.documentWhere(permission)` [source](../../src/features/documents/domain/document-access.ts#L22).
- **Calls:** [DocumentService.download](../../src/features/documents/application/document.service.ts#L618), [getDocumentService](../../src/features/documents/application/document.service.ts#L724), [contentDisposition](../../src/features/documents/application/http.ts#L132). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Читает/проверяет integrity файла; audit DOCUMENT_DOWNLOADED. GET имеет запись audit.
- **Writes/IO evidence:** `this.db.auditLog.create` [source](../../src/features/documents/application/document.service.ts#L661).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [documentApiError](#mapper-c1b7a22109) ([source](../../src/features/documents/application/http.ts#L90)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/documents/%5Bid%5D/download/route.ts#L25); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/documents/%5Bid%5D/download/route.ts#L28); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/documents/%5Bid%5D/download/route.ts#L37)

```ts
return new Response(Readable.toWeb(download.stream) as ReadableStream, {
      headers: {
        'cache-control': 'private, no-store',
        'content-disposition': contentDisposition(download.filename),
        'content-length': download.sizeBytes.toString(),
        'content-type': download.mimeType,
        etag: `"sha256-${download.sha256}"`,
        'x-content-type-options': 'nosniff',
        'x-request-id': auth.requestId,
      },
    })
```

[source](../../src/app/api/documents/%5Bid%5D/download/route.ts#L49); enclosing checks: `catch`

```ts
return documentApiError(error)
```

</details>

<a id="api-044"></a>
### API-044: GET /api/documents/[id]

Источник handler: [src/app/api/documents/[id]/route.ts:17](../../src/app/api/documents/%5Bid%5D/route.ts#L17).

- **Auth:** `authorizeApiRequest(request, 'documents.read')` [source](../../src/app/api/documents/%5Bid%5D/route.ts#L18); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R032](#r032) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** documentVisibilityWhere(documents.read) по id; доступ повторно проверяется на target.
- **Service scope evidence:** `documentVisibilityWhere(actor, permission)` [source](../../src/features/documents/application/document.service.ts#L159); `actor.access.has(permission)` [source](../../src/features/documents/domain/document-access.ts#L21); `actor.access.documentWhere(permission)` [source](../../src/features/documents/domain/document-access.ts#L22).
- **Calls:** [DocumentService.get](../../src/features/documents/application/document.service.ts#L282), [getDocumentService](../../src/features/documents/application/document.service.ts#L724). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [documentApiError](#mapper-c1b7a22109) ([source](../../src/features/documents/application/http.ts#L90)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/documents/%5Bid%5D/route.ts#L19); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/documents/%5Bid%5D/route.ts#L22)

```ts
return apiData(
      await getDocumentService().get(id, { id: auth.user.id, access: auth.access }),
    )
```

[source](../../src/app/api/documents/%5Bid%5D/route.ts#L26); enclosing checks: `catch`

```ts
return documentApiError(error)
```

</details>

<a id="api-045"></a>
### API-045: PATCH /api/documents/[id]

Источник handler: [src/app/api/documents/[id]/route.ts:30](../../src/app/api/documents/%5Bid%5D/route.ts#L30).

- **Auth:** `authorizeApiRequest(request, 'documents.update')` [source](../../src/app/api/documents/%5Bid%5D/route.ts#L31); общие auth branches выше.
- **Схемы HTTP boundary:** [changeDocumentStatusSchema](#schema-abfd3c45bd) ([source](../../src/features/documents/contracts/document.ts#L30)).
- **Parsing:** `changeDocumentStatusSchema.safeParse(await parseJsonRequest(request))` [source](../../src/app/api/documents/%5Bid%5D/route.ts#L36); `parseJsonRequest(request)` [source](../../src/app/api/documents/%5Bid%5D/route.ts#L36).
- **Выходные формы:** [R032](#r032) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** documents.update на текущие связи, lockVersion и разрешённый transition; согласования проверяются service.
- **Service scope evidence:** `canTransitionDocumentStatus(current.status, input.status)` [source](../../src/features/documents/application/document.service.ts#L549); `documentVisibilityWhere(actor, permission)` [source](../../src/features/documents/application/document.service.ts#L159); `actor.access.has(permission)` [source](../../src/features/documents/domain/document-access.ts#L21); `actor.access.documentWhere(permission)` [source](../../src/features/documents/domain/document-access.ts#L22).
- **Calls:** [DocumentService.changeStatus](../../src/features/documents/application/document.service.ts#L533), [parseJsonRequest](../../src/features/documents/application/http.ts#L79), [getDocumentService](../../src/features/documents/application/document.service.ts#L724). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Document advisory lock + optimistic lockVersion; status и lockVersion + audit.
- **Writes/IO evidence:** `tx.document.update` [source](../../src/features/documents/application/document.service.ts#L553); `tx.auditLog.create` [source](../../src/features/documents/application/document.service.ts#L561).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [documentApiError](#mapper-c1b7a22109) ([source](../../src/features/documents/application/http.ts#L90)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/documents/%5Bid%5D/route.ts#L32); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/documents/%5Bid%5D/route.ts#L37); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/documents/%5Bid%5D/route.ts#L38)

```ts
return apiData(
      await getDocumentService().changeStatus(
        id,
        input.data,
        { id: auth.user.id, access: auth.access },
        auth.requestId,
      ),
    )
```

[source](../../src/app/api/documents/%5Bid%5D/route.ts#L47); enclosing checks: `catch`

```ts
return documentApiError(error)
```

</details>

<a id="api-046"></a>
### API-046: POST /api/documents/[id]/versions

Источник handler: [src/app/api/documents/[id]/versions/route.ts:18](../../src/app/api/documents/%5Bid%5D/versions/route.ts#L18).

- **Auth:** `authorizeApiRequest(request, 'documents.update')` [source](../../src/app/api/documents/%5Bid%5D/versions/route.ts#L19); общие auth branches выше.
- **Схемы HTTP boundary:** [addDocumentVersionMetadataSchema](#schema-1a18d19622) ([source](../../src/features/documents/contracts/document.ts#L24)).
- **Вход и transport:** Raw request.body stream; тот же header transport. metadata filename/comment/lockVersion.
- **Parsing:** `parseUploadMetadata(request, addDocumentVersionMetadataSchema)` [source](../../src/app/api/documents/%5Bid%5D/versions/route.ts#L24); `requestUploadStream(request)` [source](../../src/app/api/documents/%5Bid%5D/versions/route.ts#L25).
- **Выходные формы:** [R032](#r032) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** documents.update на текущие связи документа; optimistic lockVersion обязателен.
- **Service scope evidence:** `documentVisibilityWhere(actor, permission)` [source](../../src/features/documents/application/document.service.ts#L159); `actor.access.has(permission)` [source](../../src/features/documents/domain/document-access.ts#L21); `actor.access.documentWhere(permission)` [source](../../src/features/documents/domain/document-access.ts#L22).
- **Calls:** [DocumentService.addVersion](../../src/features/documents/application/document.service.ts#L437), [parseUploadMetadata](../../src/features/documents/application/http.ts#L25), [requestUploadStream](../../src/features/documents/application/http.ts#L55), [getDocumentService](../../src/features/documents/application/document.service.ts#L724). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Пишет новый immutable storage object; document advisory lock + optimistic version, version row+currentVersion+lockVersion+audit; cleanup при ошибке.
- **Writes/IO evidence:** `this.storage.write` [source](../../src/features/documents/application/document.service.ts#L463); `tx.documentVersion.create` [source](../../src/features/documents/application/document.service.ts#L486); `tx.document.update` [source](../../src/features/documents/application/document.service.ts#L501); `tx.auditLog.create` [source](../../src/features/documents/application/document.service.ts#L510); `this.storage.delete` [source](../../src/features/documents/application/document.service.ts#L528).
- **Error maps:** [documentApiError](#mapper-c1b7a22109) ([source](../../src/features/documents/application/http.ts#L90)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/documents/%5Bid%5D/versions/route.ts#L20); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/documents/%5Bid%5D/versions/route.ts#L26)

```ts
return apiData(
      await getDocumentService().addVersion(
        id,
        metadata,
        { ...upload, filename: metadata.filename },
        { id: auth.user.id, access: auth.access },
        auth.requestId,
      ),
      { status: 201 },
    )
```

[source](../../src/app/api/documents/%5Bid%5D/versions/route.ts#L37); enclosing checks: `catch`

```ts
return documentApiError(error)
```

</details>

<a id="api-047"></a>
### API-047: POST /api/documents/generate

Источник handler: [src/app/api/documents/generate/route.ts:10](../../src/app/api/documents/generate/route.ts#L10).

- **Auth:** `authorizeApiRequest(request, 'documents.create')` [source](../../src/app/api/documents/generate/route.ts#L11); общие auth branches выше.
- **Схемы HTTP boundary:** [generateDocumentSchema](#schema-bb598bdbac) ([source](../../src/features/documents/contracts/document.ts#L44)).
- **Parsing:** `generateDocumentSchema.safeParse(await request.json())` [source](../../src/app/api/documents/generate/route.ts#L14); `request.json()` [source](../../src/app/api/documents/generate/route.ts#L14).
- **Выходные формы:** [R032](#r032) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Те же link/permission checks, затем render и тот же сценарий create.
- **Service scope evidence:** `this.ensurePermission(actor, 'documents.create', target)` [source](../../src/features/documents/application/document.service.ts#L301); `assertDocumentPermission(actor, permission, target)` [source](../../src/features/documents/application/document.service.ts#L148); `actor.access.allows(permission, target)` [source](../../src/features/documents/domain/document-access.ts#L31); `actor.access.has(permission)` [source](../../src/features/documents/domain/document-access.ts#L32).
- **Calls:** [DocumentService.createGenerated](../../src/features/documents/application/document.service.ts#L367), [getDocumentService](../../src/features/documents/application/document.service.ts#L724). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Render DOCX/PDF вне DB transaction, затем тот же create/store/version/audit.
- **Writes/IO evidence:** `this.create` [source](../../src/features/documents/application/document.service.ts#L416); `this.storage.write` [source](../../src/features/documents/application/document.service.ts#L310); `tx.document.create` [source](../../src/features/documents/application/document.service.ts#L314); `tx.auditLog.create` [source](../../src/features/documents/application/document.service.ts#L339); `this.storage.delete` [source](../../src/features/documents/application/document.service.ts#L362).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [documentApiError](#mapper-c1b7a22109) ([source](../../src/features/documents/application/http.ts#L90)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/documents/generate/route.ts#L12); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/documents/generate/route.ts#L15); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/documents/generate/route.ts#L18)

```ts
return apiData(
      await getDocumentService().createGenerated(
        input.data,
        { id: auth.user.id, access: auth.access },
        auth.requestId,
      ),
      { status: 201 },
    )
```

[source](../../src/app/api/documents/generate/route.ts#L27); enclosing checks: `catch`

```ts
return documentApiError(error)
```

</details>

<a id="api-048"></a>
### API-048: GET /api/documents/options

Источник handler: [src/app/api/documents/options/route.ts:9](../../src/app/api/documents/options/route.ts#L9).

- **Auth:** `authorizeApiRequest(request, 'documents.create')` [source](../../src/app/api/documents/options/route.ts#L10); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R033](#r033) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Применяет документы/employee/project/asset scope filters к options; не просто глобальная выдача справочников.
- **Service scope evidence:** `this.ensurePermission(actor, 'documents.create')` [source](../../src/features/documents/application/document.service.ts#L682); `actor.access.projectWhere('documents.create')` [source](../../src/features/documents/application/document.service.ts#L687); `actor.access.employeeWhere('documents.create')` [source](../../src/features/documents/application/document.service.ts#L698); `actor.access.assetWhere('documents.create')` [source](../../src/features/documents/application/document.service.ts#L709); `assertDocumentPermission(actor, permission, target)` [source](../../src/features/documents/application/document.service.ts#L148); `actor.access.allows(permission, target)` [source](../../src/features/documents/domain/document-access.ts#L31); `actor.access.has(permission)` [source](../../src/features/documents/domain/document-access.ts#L32).
- **Calls:** [DocumentService.listLinkOptions](../../src/features/documents/application/document.service.ts#L681), [getDocumentService](../../src/features/documents/application/document.service.ts#L724). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [documentApiError](#mapper-c1b7a22109) ([source](../../src/features/documents/application/http.ts#L90)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/documents/options/route.ts#L11); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/documents/options/route.ts#L13)

```ts
return apiData(
      await getDocumentService().listLinkOptions({ id: auth.user.id, access: auth.access }),
    )
```

[source](../../src/app/api/documents/options/route.ts#L17); enclosing checks: `catch`

```ts
return documentApiError(error)
```

</details>

<a id="api-049"></a>
### API-049: GET /api/documents

Источник handler: [src/app/api/documents/route.ts:18](../../src/app/api/documents/route.ts#L18).

- **Auth:** `authorizeApiRequest(request, 'documents.read')` [source](../../src/app/api/documents/route.ts#L19); общие auth branches выше.
- **Схемы HTTP boundary:** [documentsQuerySchema](#schema-c18f905739) ([source](../../src/features/documents/contracts/document.ts#L58)).
- **Parsing:** `documentsQuerySchema.safeParse( Object.fromEntries(request.nextUrl.searchParams), )` [source](../../src/app/api/documents/route.ts#L22).
- **Выходные формы:** [R034](#r034) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** documentVisibilityWhere(documents.read): все непустые связи должны пройти свои employee/project/asset scopes.
- **Service scope evidence:** `documentVisibilityWhere(actor, permission)` [source](../../src/features/documents/application/document.service.ts#L159); `actor.access.has(permission)` [source](../../src/features/documents/domain/document-access.ts#L21); `actor.access.documentWhere(permission)` [source](../../src/features/documents/domain/document-access.ts#L22).
- **Calls:** [DocumentService.list](../../src/features/documents/application/document.service.ts#L217), [getDocumentService](../../src/features/documents/application/document.service.ts#L724). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [documentApiError](#mapper-c1b7a22109) ([source](../../src/features/documents/application/http.ts#L90)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/documents/route.ts#L20); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/documents/route.ts#L25); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/documents/route.ts#L32)

```ts
return apiList(result.documents, {
      page: query.data.page,
      pageSize: query.data.pageSize,
      total: result.total,
    })
```

[source](../../src/app/api/documents/route.ts#L38); enclosing checks: `catch`

```ts
return documentApiError(error)
```

</details>

<a id="api-050"></a>
### API-050: POST /api/documents

Источник handler: [src/app/api/documents/route.ts:42](../../src/app/api/documents/route.ts#L42).

- **Auth:** `authorizeApiRequest(request, 'documents.create')` [source](../../src/app/api/documents/route.ts#L43); общие auth branches выше.
- **Схемы HTTP boundary:** [createDocumentMetadataSchema](#schema-af84638cd0) ([source](../../src/features/documents/contracts/document.ts#L14)).
- **Вход и transport:** Raw request.body stream, metadata из base64url JSON x-document-metadata (encoded length <=12000), Content-Type и optional Content-Length. Не multipart.
- **Parsing:** `parseUploadMetadata(request, createDocumentMetadataSchema)` [source](../../src/app/api/documents/route.ts#L47); `requestUploadStream(request)` [source](../../src/app/api/documents/route.ts#L48).
- **Выходные формы:** [R032](#r032) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** documents.create + scopes всех связанных employee/project/asset; без связей допускается ADMIN/AUDITOR с ALL/ALL.
- **Service scope evidence:** `this.ensurePermission(actor, 'documents.create', target)` [source](../../src/features/documents/application/document.service.ts#L301); `assertDocumentPermission(actor, permission, target)` [source](../../src/features/documents/application/document.service.ts#L148); `actor.access.allows(permission, target)` [source](../../src/features/documents/domain/document-access.ts#L31); `actor.access.has(permission)` [source](../../src/features/documents/domain/document-access.ts#L32).
- **Calls:** [DocumentService.create](../../src/features/documents/application/document.service.ts#L294), [parseUploadMetadata](../../src/features/documents/application/http.ts#L25), [requestUploadStream](../../src/features/documents/application/http.ts#L55), [getDocumentService](../../src/features/documents/application/document.service.ts#L724). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Пишет файл через storage port со streaming/hash/size policy, затем document/version+audit; при DB fail удаляет созданный storage object.
- **Writes/IO evidence:** `this.storage.write` [source](../../src/features/documents/application/document.service.ts#L310); `tx.document.create` [source](../../src/features/documents/application/document.service.ts#L314); `tx.auditLog.create` [source](../../src/features/documents/application/document.service.ts#L339); `this.storage.delete` [source](../../src/features/documents/application/document.service.ts#L362).
- **Error maps:** [documentApiError](#mapper-c1b7a22109) ([source](../../src/features/documents/application/http.ts#L90)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/documents/route.ts#L44); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/documents/route.ts#L49)

```ts
return apiData(
      await getDocumentService().create(
        metadata,
        {
          ...upload,
          filename: metadata.filename,
        },
        { id: auth.user.id, access: auth.access },
        auth.requestId,
      ),
      { status: 201 },
    )
```

[source](../../src/app/api/documents/route.ts#L62); enclosing checks: `catch`

```ts
return documentApiError(error)
```

</details>

<a id="api-051"></a>
### API-051: PUT /api/employees/[id]/profile

Источник handler: [src/app/api/employees/[id]/profile/route.ts:8](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'employees.update')` [source](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L12); общие auth branches выше.
- **Схемы HTTP boundary:** [employeeProfileSchema](#schema-8a90f64a14) ([source](../../src/features/employees/contracts/profile.ts#L6)).
- **Parsing:** `employeeProfileSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L14); `request.json()` [source](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L14).
- **Выходные формы:** [R035](#r035) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет сотрудника по employees.update; manager дополнительно по employees.read, existence/самоназначение проверяет service.
- **Route scope predicates:** `employeeTarget(id)` [source](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L17); `auth.access.allows('employees.update', target)` [source](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L19); `employeeTarget(input.data.managerId)` [source](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L23); `auth.access.allows('employees.read', managerTarget)` [source](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L24).
- **Calls:** [EmployeeProfileService.update](../../src/features/employees/application/employee-profile.service.ts#L171). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Полностью заменяет skills и certificates из обязательных arrays; employee profile/manager + audit.
- **Writes/IO evidence:** `tx.employee.update` [source](../../src/features/employees/application/employee-profile.service.ts#L193); `tx.employeeSkill.deleteMany` [source](../../src/features/employees/application/employee-profile.service.ts#L203); `tx.employeeCertificate.deleteMany` [source](../../src/features/employees/application/employee-profile.service.ts#L204); `tx.employeeSkill.createMany` [source](../../src/features/employees/application/employee-profile.service.ts#L208); `tx.employeeCertificate.createMany` [source](../../src/features/employees/application/employee-profile.service.ts#L217); `tx.auditLog.create` [source](../../src/features/employees/application/employee-profile.service.ts#L228).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L13); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L15); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L18); enclosing checks: `!target`

```ts
return apiError('EMPLOYEE_NOT_FOUND', 'Сотрудник не найден', 404)
```

[source](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L20); enclosing checks: `!auth.access.allows('employees.update', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L25); enclosing checks: `input.data.managerId AND !managerTarget || !auth.access.allows('employees.read', managerTarget)`

```ts
return apiError('INVALID_MANAGER', 'Руководитель недоступен', 422)
```

[source](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L29)

```ts
return apiData(await EmployeeProfileService.update(
      id,
      input.data,
      auth.user.id,
      auth.requestId,
    ))
```

[source](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L37); enclosing checks: `catch AND error instanceof Error && error.message === 'INVALID_MANAGER'`

```ts
return apiError('INVALID_MANAGER', 'Нельзя назначить этого руководителя', 422)
```

[source](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L40); enclosing checks: `catch AND error instanceof Error && error.message === 'EMPLOYEE_NOT_FOUND'`

```ts
return apiError('EMPLOYEE_NOT_FOUND', 'Сотрудник не найден', 404)
```

</details>

<a id="api-052"></a>
### API-052: PUT /api/employees/[id]

Источник handler: [src/app/api/employees/[id]/route.ts:30](../../src/app/api/employees/%5Bid%5D/route.ts#L30).

- **Auth:** `authorizeApiRequest(request, 'employees.update')` [source](../../src/app/api/employees/%5Bid%5D/route.ts#L31); общие auth branches выше.
- **Схемы HTTP boundary:** [updateEmployeeSchema](#schema-86946c61bb) ([source](../../src/features/employees/contracts/employee.ts#L28)).
- **Parsing:** `updateEmployeeSchema.safeParse(await request.json())` [source](../../src/app/api/employees/%5Bid%5D/route.ts#L33); `request.json()` [source](../../src/app/api/employees/%5Bid%5D/route.ts#L33).
- **Выходные формы:** [R036](#r036) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет employeeId и все текущие/новые departments по staffScheduleId или department name.
- **Route scope predicates:** `employeeTarget(id)` [source](../../src/app/api/employees/%5Bid%5D/route.ts#L37); `departmentForPosition(input.data.staffScheduleId)` [source](../../src/app/api/employees/%5Bid%5D/route.ts#L38); `departmentByName(input.data.department)` [source](../../src/app/api/employees/%5Bid%5D/route.ts#L39); `auth.access.allows('employees.update', { employeeId: currentTarget.employeeId, departmentIds: [ ...(currentTarget.departmentId ? [currentTarget.departmentId] : []), ...(nextDepartmentId ? [nextDepartmentId] : []), ], })` [source](../../src/app/api/employees/%5Bid%5D/route.ts#L42).
- **Calls:** [EmployeeService.updateEmployee](../../src/features/employees/application/employee.service.ts#L107). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Employee + capacity rules и department snapshot; DISMISSED очищает department head. PersonnelAction EDIT и audit пишутся только когда changedFields непустой; phone/email/photo-only изменение не входит в этот список и не создаёт audit.
- **Writes/IO evidence:** `tx.employee.update` [source](../../src/features/employees/application/employee.service.ts#L151); `tx.personnelAction.create` [source](../../src/features/employees/application/employee.service.ts#L195); `tx.auditLog.create` [source](../../src/features/employees/application/employee.service.ts#L205); `db.department.updateMany` [source](../../src/features/employees/infrastructure/employee.repository.ts#L70).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [mapEmployeeError](#mapper-97765decfa) ([source](../../src/app/api/employees/%5Bid%5D/route.ts#L18)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/employees/%5Bid%5D/route.ts#L32); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/employees/%5Bid%5D/route.ts#L34); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/employees/%5Bid%5D/route.ts#L48); enclosing checks: `currentTarget && !auth.access.allows('employees.update', { employeeId: currentTarget.employeeId, departmentIds: [ ...(currentTarget.departmentId ? [currentTarget.departmentId] : []), ...(nextDepartmentId ? [nextDepartmentId] : []), ], })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/employees/%5Bid%5D/route.ts#L50)

```ts
return apiData(await EmployeeService.updateEmployee(id, input.data, auth.user.id, auth.requestId))
```

[source](../../src/app/api/employees/%5Bid%5D/route.ts#L53); enclosing checks: `catch AND mapped`

```ts
return mapped
```

</details>

<a id="api-053"></a>
### API-053: DELETE /api/employees/[id]

Источник handler: [src/app/api/employees/[id]/route.ts:58](../../src/app/api/employees/%5Bid%5D/route.ts#L58).

- **Auth:** `authorizeApiRequest(request, 'employees.delete')` [source](../../src/app/api/employees/%5Bid%5D/route.ts#L59); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R037](#r037) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет employeeTarget; service увольняет сотрудника и освобождает занятую ставку.
- **Route scope predicates:** `employeeTarget(id)` [source](../../src/app/api/employees/%5Bid%5D/route.ts#L62); `auth.access.allows('employees.delete', target)` [source](../../src/app/api/employees/%5Bid%5D/route.ts#L63).
- **Calls:** [EmployeeService.dismissEmployee](../../src/features/employees/application/employee.service.ts#L221). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** DISMISSED, освобождение занятой ставки, кадровое действие и audit; route DELETE возвращает archived=true.
- **Writes/IO evidence:** `tx.employee.update` [source](../../src/features/employees/application/employee.service.ts#L234); `tx.personnelAction.create` [source](../../src/features/employees/application/employee.service.ts#L243); `tx.auditLog.create` [source](../../src/features/employees/application/employee.service.ts#L251); `db.department.updateMany` [source](../../src/features/employees/infrastructure/employee.repository.ts#L70).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [mapEmployeeError](#mapper-97765decfa) ([source](../../src/app/api/employees/%5Bid%5D/route.ts#L18)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/employees/%5Bid%5D/route.ts#L60); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/employees/%5Bid%5D/route.ts#L64); enclosing checks: `target && !auth.access.allows('employees.delete', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/employees/%5Bid%5D/route.ts#L68)

```ts
return apiData({ success: true, archived: true, status: 'DISMISSED' })
```

[source](../../src/app/api/employees/%5Bid%5D/route.ts#L71); enclosing checks: `catch AND mapped`

```ts
return mapped
```

</details>

<a id="api-054"></a>
### API-054: GET /api/employees

Источник handler: [src/app/api/employees/route.ts:25](../../src/app/api/employees/route.ts#L25).

- **Auth:** `authorizeApiRequest(request, 'employees.read')` [source](../../src/app/api/employees/route.ts#L26); общие auth branches выше.
- **Схемы HTTP boundary:** [querySchema](#schema-deedfbdc22) ([source](../../src/app/api/employees/route.ts#L11)).
- **Вход и transport:** Query limit→pageSize при отсутствии pageSize; scope=active/archive/expired/all (default all). archive включает DISMISSED и активных с истёкшим contractEndDate, expired только вторых. archived/isArchived не являются поддержанными query fields.
- **Parsing:** `querySchema.safeParse(raw)` [source](../../src/app/api/employees/route.ts#L30).
- **Выходные формы:** [R038](#r038) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Pagination extras:** runtime apiList сохраняет `{"scope": {"type": "active|archive|expired|all", "alwaysPresent": true}}` из spread query.data; см. return ниже.
- **Resource scope:** employeeWhere(employees.read) вместе с scope=active/archive/expired/all; штатная relation входит в результат.
- **Service scope evidence:** `access.employeeWhere('employees.read')` [source](../../src/features/employees/application/employee.service.ts#L36).
- **Calls:** [EmployeeService.list](../../src/features/employees/application/employee.service.ts#L20). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/employees/route.ts#L27); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/employees/route.ts#L31); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/employees/route.ts#L33)

```ts
return apiList(result.employees, { ...query.data, total: result.total })
```

</details>

<a id="api-055"></a>
### API-055: POST /api/employees

Источник handler: [src/app/api/employees/route.ts:36](../../src/app/api/employees/route.ts#L36).

- **Auth:** `authorizeApiRequest(request, 'employees.create')` [source](../../src/app/api/employees/route.ts#L37); общие auth branches выше.
- **Схемы HTTP boundary:** [createEmployeeSchema](#schema-a6214717c1) ([source](../../src/features/employees/contracts/schemas.ts#L3)).
- **Parsing:** `createEmployeeSchema.safeParse(await request.json())` [source](../../src/app/api/employees/route.ts#L39); `request.json()` [source](../../src/app/api/employees/route.ts#L39).
- **Выходные формы:** [R036](#r036) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет department новой staff position; service проверяет доступность ставки и active department.
- **Route scope predicates:** `departmentForPosition(input.data.staffScheduleId)` [source](../../src/app/api/employees/route.ts#L41); `auth.access.allows('employees.create', { departmentId })` [source](../../src/app/api/employees/route.ts#L42).
- **Calls:** [EmployeeService.createEmployee](../../src/features/employees/application/employee.service.ts#L55). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Employee + занятость штатной позиции и кадровый HIRE/audit в transaction.
- **Writes/IO evidence:** `tx.employee.create` [source](../../src/features/employees/application/employee.service.ts#L68); `tx.personnelAction.create` [source](../../src/features/employees/application/employee.service.ts#L88); `tx.auditLog.create` [source](../../src/features/employees/application/employee.service.ts#L96).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [mapEmployeeError](#mapper-45975a9e99) ([source](../../src/app/api/employees/route.ts#L17)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/employees/route.ts#L38); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/employees/route.ts#L40); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/employees/route.ts#L43); enclosing checks: `departmentId && !auth.access.allows('employees.create', { departmentId })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/employees/route.ts#L46)

```ts
return apiData(await EmployeeService.createEmployee(input.data, auth.user.id, auth.requestId), { status: 201 })
```

[source](../../src/app/api/employees/route.ts#L49); enclosing checks: `catch AND mapped`

```ts
return mapped
```

</details>

<a id="api-056"></a>
### API-056: GET /api/export

Источник handler: [src/app/api/export/route.ts:10](../../src/app/api/export/route.ts#L10).

- **Auth:** `authorizeApiRequest(request, 'assets.export')` [source](../../src/app/api/export/route.ts#L11); общие auth branches выше.
- **Вход и transport:** type default assets; поддержаны assets/operations. archived отсутствует→undefined, ровно true→true, любая другая строка→false; applies только к assets.
- **Query/header reads:** `searchParams.get('type')` [source](../../src/app/api/export/route.ts#L16); `searchParams.get('archived')` [source](../../src/app/api/export/route.ts#L24).
- **Выходные формы:** [R039](#r039) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Binary/headers:** 200 XLSX streaming PassThrough/WorkbookWriter; assets_export_YYYY-MM-DD.xlsx либо operations_export_YYYY-MM-DD.xlsx. workbook.commit async: ошибка после headers ломает stream и уже не превращается в JSON 500.
- **Resource scope:** assetWhere(assets.export). assetWhere(assets.export), хотя это export операций; отдельное operations.read не требуется route.
- **Service scope evidence:** `access.assetWhere('assets.export')` [source](../../src/features/exports/application/export.service.ts#L10); `access.assetWhere('assets.export')` [source](../../src/features/exports/application/export.service.ts#L27).
- **Calls:** [ExportService.assets](../../src/features/exports/application/export.service.ts#L6), [ExportService.operations](../../src/features/exports/application/export.service.ts#L24), [getStatusLabel](../../src/app/api/export/route.ts#L170), [getOperationTypeLabel](../../src/app/api/export/route.ts#L182). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/export/route.ts#L12); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/export/route.ts#L133); enclosing checks: `type === 'assets' AND type === 'operations'`

```ts
return apiError('UNSUPPORTED_EXPORT_TYPE', 'Неизвестный тип экспорта', 422)
```

[source](../../src/app/api/export/route.ts#L155)

```ts
return new NextResponse(Readable.toWeb(output) as ReadableStream, {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    })
```

[source](../../src/app/api/export/route.ts#L163); enclosing checks: `catch`

```ts
return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    )
```

</details>

<a id="api-057"></a>
### API-057: GET /api/finance/plans

Источник handler: [src/app/api/finance/plans/route.ts:13](../../src/app/api/finance/plans/route.ts#L13).

- **Auth:** `authorizeApiRequest(request, 'financePlans.read')` [source](../../src/app/api/finance/plans/route.ts#L14); общие auth branches выше.
- **Вход и transport:** year: parseInt(base10), default текущий локальный год, int 2000..2100; type getPlanType допускает только oklad/nadbavka и не имеет default.
- **Query/header reads:** `request.nextUrl.searchParams.get('year')` [source](../../src/app/api/finance/plans/route.ts#L18); `request.nextUrl.searchParams.get('type')` [source](../../src/app/api/finance/plans/route.ts#L20).
- **Выходные формы:** [R039](#r039), [R040](#r040) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** employeeWhere/financeEntryWhere(financePlans.read), project options через allowedProjectIds(financePlans.read).
- **Service scope evidence:** `access?.employeeWhere('financePlans.read')` [source](../../src/features/finance/application/finance-plan.service.ts#L145); `access?.financeEntryWhere('financePlans.read')` [source](../../src/features/finance/application/finance-plan.service.ts#L176).
- **Calls:** [FinancePlanService.getTable](../../src/features/finance/application/finance-plan.service.ts#L140), [getCurrentYear](../../src/features/finance/domain/finance-plan.ts#L25), [getPlanType](../../src/features/finance/domain/finance-plan.ts#L27). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/finance/plans/route.ts#L15); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/finance/plans/route.ts#L23); enclosing checks: `!type`

```ts
return NextResponse.json(
        { error: 'Invalid finance plan type' },
        { status: 400 }
      )
```

[source](../../src/app/api/finance/plans/route.ts#L30); enclosing checks: `!Number.isInteger(year) || year < 2000 || year > 2100`

```ts
return NextResponse.json(
        { error: 'Invalid finance year' },
        { status: 400 }
      )
```

[source](../../src/app/api/finance/plans/route.ts#L38)

```ts
return NextResponse.json(result)
```

[source](../../src/app/api/finance/plans/route.ts#L41); enclosing checks: `catch`

```ts
return NextResponse.json(
      { error: 'Failed to fetch finance plan table' },
      { status: 500 }
    )
```

</details>

<a id="api-058"></a>
### API-058: POST /api/finance/plans

Источник handler: [src/app/api/finance/plans/route.ts:48](../../src/app/api/finance/plans/route.ts#L48).

- **Auth:** `authorizeApiRequest(request, { anyOf: ['financePlans.create', 'financePlans.update'], })` [source](../../src/app/api/finance/plans/route.ts#L49); общие auth branches выше.
- **Схемы HTTP boundary:** [financePlanSaveSchema](#schema-22081a1b79) ([source](../../src/features/finance/contracts/finance-plan.ts#L5)).
- **Вход и transport:** JSON financePlanSaveSchema; service: type=oklad требует projectId и вычисляет amount=staff salary*employee rate (input.amount не используется); type=nadbavka требует непустые allocations, projectId каждой записи и positive amount string с comma→dot, trim, максимум 2 decimal places; одинаковые projectIds объединяются.
- **Parsing:** `request.json()` [source](../../src/app/api/finance/plans/route.ts#L55); `validateRequest(financePlanSaveSchema, data)` [source](../../src/app/api/finance/plans/route.ts#L56).
- **Выходные формы:** [R039](#r039), [R041](#r041) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** В service выбирает create/update по наличию existingEntries; allows требует employee+department и все затронутые old/new projects.
- **Service scope evidence:** `access.allows(permission, { employeeId: employee.id, departmentId: employee.departmentId, projectIds: affectedProjectIds, })` [source](../../src/features/finance/application/finance-plan.service.ts#L312).
- **Calls:** [FinancePlanService.saveCell](../../src/features/finance/application/finance-plan.service.ts#L239), [validateRequest](../../src/lib/http/validate-request.ts#L3). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Заменяет financePlanEntries; откатывает old и добавляет new contribution в project.actualBudget. ensurePayrollPeriodOpen только читает CLOSED status, row/advisory lock не берёт. Audit не записывается.
- **Writes/IO evidence:** `tx.project.update` [source](../../src/features/finance/application/finance-plan.service.ts#L324); `tx.financePlanEntry.deleteMany` [source](../../src/features/finance/application/finance-plan.service.ts#L334); `tx.financePlanEntry.createMany` [source](../../src/features/finance/application/finance-plan.service.ts#L343); `tx.project.update` [source](../../src/features/finance/application/finance-plan.service.ts#L355).
- **Error maps:** [getFinancePlanErrorMeta](#mapper-f85cd1f049) ([source](../../src/features/finance/application/finance-plan.service.ts#L52)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/finance/plans/route.ts#L52); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/finance/plans/route.ts#L59); enclosing checks: `!validation.success`

```ts
return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
```

[source](../../src/app/api/finance/plans/route.ts#L67)

```ts
return NextResponse.json({
      success: true,
      cell: result.cell,
      projects: result.projects,
    })
```

[source](../../src/app/api/finance/plans/route.ts#L78); enclosing checks: `catch AND routeError`

```ts
return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
```

[source](../../src/app/api/finance/plans/route.ts#L84); enclosing checks: `catch AND error instanceof AuthorizationError`

```ts
return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
```

[source](../../src/app/api/finance/plans/route.ts#L87); enclosing checks: `catch`

```ts
return NextResponse.json(
      { error: 'Failed to save finance plan cell' },
      { status: 500 }
    )
```

</details>

<a id="api-059"></a>
### API-059: DELETE /api/finance/plans

Источник handler: [src/app/api/finance/plans/route.ts:94](../../src/app/api/finance/plans/route.ts#L94).

- **Auth:** `authorizeApiRequest(request, 'financePlans.delete')` [source](../../src/app/api/finance/plans/route.ts#L95); общие auth branches выше.
- **Схемы HTTP boundary:** [financePlanDeleteSchema](#schema-6da8828987) ([source](../../src/features/finance/contracts/finance-plan.ts#L20)).
- **Parsing:** `request.json()` [source](../../src/app/api/finance/plans/route.ts#L99); `validateRequest(financePlanDeleteSchema, data)` [source](../../src/app/api/finance/plans/route.ts#L100).
- **Выходные формы:** [R039](#r039), [R042](#r042) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Если entries нет, success без scope lookup; иначе allows(financePlans.delete) на employee/department и project IDs существующих entries.
- **Service scope evidence:** `access.allows('financePlans.delete', { employeeId: employee.id, departmentId: employee.departmentId, projectIds: existingEntries.flatMap((entry) => entry.projectId ? [entry.projectId] : []), })` [source](../../src/features/finance/application/finance-plan.service.ts#L432).
- **Calls:** [FinancePlanService.clearCell](../../src/features/finance/application/finance-plan.service.ts#L405), [validateRequest](../../src/lib/http/validate-request.ts#L3). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Удаляет entries и уменьшает project.actualBudget; ensurePayrollPeriodOpen — read-only проверка без row/advisory lock; audit не записывается.
- **Writes/IO evidence:** `tx.project.update` [source](../../src/features/finance/application/finance-plan.service.ts#L444); `tx.financePlanEntry.deleteMany` [source](../../src/features/finance/application/finance-plan.service.ts#L454).
- **Error maps:** [getFinancePlanErrorMeta](#mapper-f85cd1f049) ([source](../../src/features/finance/application/finance-plan.service.ts#L52)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/finance/plans/route.ts#L96); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/finance/plans/route.ts#L103); enclosing checks: `!validation.success`

```ts
return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
```

[source](../../src/app/api/finance/plans/route.ts#L111)

```ts
return NextResponse.json({ success: true })
```

[source](../../src/app/api/finance/plans/route.ts#L116); enclosing checks: `catch AND routeError`

```ts
return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
```

[source](../../src/app/api/finance/plans/route.ts#L122); enclosing checks: `catch AND error instanceof AuthorizationError`

```ts
return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
```

[source](../../src/app/api/finance/plans/route.ts#L124); enclosing checks: `catch`

```ts
return NextResponse.json(
      { error: 'Failed to delete finance plan cell' },
      { status: 500 }
    )
```

</details>

<a id="api-060"></a>
### API-060: GET /api/finance/salary

Источник handler: [src/app/api/finance/salary/route.ts:11](../../src/app/api/finance/salary/route.ts#L11).

- **Auth:** `authorizeApiRequest(request, 'finance.salary.read')` [source](../../src/app/api/finance/salary/route.ts#L12); общие auth branches выше.
- **Схемы HTTP boundary:** [yearSchema](#schema-57e59401cd) ([source](../../src/app/api/finance/salary/route.ts#L9)).
- **Вход и transport:** year из query или текущий локальный год; z.coerce.number().int().min(2000).max(2100).
- **Parsing:** `yearSchema.safeParse(request.nextUrl.searchParams.get('year') || new Date().getFullYear())` [source](../../src/app/api/finance/salary/route.ts#L14).
- **Query/header reads:** `request.nextUrl.searchParams.get('year')` [source](../../src/app/api/finance/salary/route.ts#L14).
- **Выходные формы:** [R043](#r043) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** employeeWhere + financeEntryWhere(finance.salary.read); entries требуют projectId != null; projects всегда пустой массив.
- **Service scope evidence:** `access?.employeeWhere('finance.salary.read')` [source](../../src/features/finance/application/finance-plan.service.ts#L83); `access?.financeEntryWhere('finance.salary.read')` [source](../../src/features/finance/application/finance-plan.service.ts#L101).
- **Calls:** [FinancePlanService.getSalaryTable](../../src/features/finance/application/finance-plan.service.ts#L78). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/finance/salary/route.ts#L13); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/finance/salary/route.ts#L15); enclosing checks: `!year.success`

```ts
return apiValidationError(year.error)
```

[source](../../src/app/api/finance/salary/route.ts#L16)

```ts
return apiData(await FinancePlanService.getSalaryTable(year.data, auth.access))
```

</details>

<a id="api-061"></a>
### API-061: GET /api/groups/[id]

Источник handler: [src/app/api/groups/[id]/route.ts:13](../../src/app/api/groups/%5Bid%5D/route.ts#L13).

- **Auth:** `authorizeApiRequest(request, 'assetGroups.read')` [source](../../src/app/api/groups/%5Bid%5D/route.ts#L14); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R044](#r044) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Permission assetGroups.read имеет scope none; ID без regex/cuid validator.
- **Calls:** [CatalogService.getGroup](../../src/features/assets/application/catalog.service.ts#L31). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/groups/%5Bid%5D/route.ts#L15); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/groups/%5Bid%5D/route.ts#L17)

```ts
return group ? apiData(group) : apiError('NOT_FOUND', 'Группа не найдена', 404)
```

[Local error mapping source](../../src/app/api/groups/%5Bid%5D/route.ts#L7)

```ts
const catalogError = (error: CatalogServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'Группа не найдена', 404)
  : error.code === 'CODE_EXISTS'
    ? apiError(error.code, 'Группа с таким кодом уже существует', 409)
    : apiError(error.code, 'Группа используется объектами имущества', 409)
```

</details>

<a id="api-062"></a>
### API-062: PUT /api/groups/[id]

Источник handler: [src/app/api/groups/[id]/route.ts:20](../../src/app/api/groups/%5Bid%5D/route.ts#L20).

- **Auth:** `authorizeApiRequest(request, 'assetGroups.update')` [source](../../src/app/api/groups/%5Bid%5D/route.ts#L21); общие auth branches выше.
- **Схемы HTTP boundary:** [createGroupSchema](#schema-bb3e7c7416) ([source](../../src/features/assets/contracts/schemas.ts#L42)).
- **Parsing:** `createGroupSchema.safeParse(await request.json())` [source](../../src/app/api/groups/%5Bid%5D/route.ts#L23); `request.json()` [source](../../src/app/api/groups/%5Bid%5D/route.ts#L23).
- **Выходные формы:** [R045](#r045) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** permission gate route; выбранные services не принимают AccessContext/resource target. Точная permission scope kind — в общей матрице permissions.
- **Calls:** [CatalogService.updateGroup](../../src/features/assets/application/catalog.service.ts#L69). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** AssetGroup update + audit в transaction.
- **Writes/IO evidence:** `tx.assetGroup.update` [source](../../src/features/assets/application/catalog.service.ts#L74); `tx.auditLog.create` [source](../../src/features/assets/application/catalog.service.ts#L75).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [catalogError](#mapper-8b30972318) ([source](../../src/app/api/groups/%5Bid%5D/route.ts#L7)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/groups/%5Bid%5D/route.ts#L22); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/groups/%5Bid%5D/route.ts#L24); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/groups/%5Bid%5D/route.ts#L26)

```ts
return apiData(await CatalogService.updateGroup((await params).id, input.data, auth.user.id, auth.requestId))
```

[source](../../src/app/api/groups/%5Bid%5D/route.ts#L28); enclosing checks: `catch AND error instanceof CatalogServiceError`

```ts
return catalogError(error)
```

[Local error mapping source](../../src/app/api/groups/%5Bid%5D/route.ts#L7)

```ts
const catalogError = (error: CatalogServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'Группа не найдена', 404)
  : error.code === 'CODE_EXISTS'
    ? apiError(error.code, 'Группа с таким кодом уже существует', 409)
    : apiError(error.code, 'Группа используется объектами имущества', 409)
```

</details>

<a id="api-063"></a>
### API-063: DELETE /api/groups/[id]

Источник handler: [src/app/api/groups/[id]/route.ts:33](../../src/app/api/groups/%5Bid%5D/route.ts#L33).

- **Auth:** `authorizeApiRequest(request, 'assetGroups.delete')` [source](../../src/app/api/groups/%5Bid%5D/route.ts#L34); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R030](#r030) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** permission gate route; выбранные services не принимают AccessContext/resource target. Точная permission scope kind — в общей матрице permissions.
- **Calls:** [CatalogService.deleteGroup](../../src/features/assets/application/catalog.service.ts#L92). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** AssetGroup physical delete + audit; usage guard.
- **Writes/IO evidence:** `tx.assetGroup.delete` [source](../../src/features/assets/application/catalog.service.ts#L97); `tx.auditLog.create` [source](../../src/features/assets/application/catalog.service.ts#L98).
- **Error maps:** [catalogError](#mapper-8b30972318) ([source](../../src/app/api/groups/%5Bid%5D/route.ts#L7)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/groups/%5Bid%5D/route.ts#L35); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/groups/%5Bid%5D/route.ts#L37)

```ts
return apiData(await CatalogService.deleteGroup((await params).id, auth.user.id, auth.requestId))
```

[source](../../src/app/api/groups/%5Bid%5D/route.ts#L39); enclosing checks: `catch AND error instanceof CatalogServiceError`

```ts
return catalogError(error)
```

[Local error mapping source](../../src/app/api/groups/%5Bid%5D/route.ts#L7)

```ts
const catalogError = (error: CatalogServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'Группа не найдена', 404)
  : error.code === 'CODE_EXISTS'
    ? apiError(error.code, 'Группа с таким кодом уже существует', 409)
    : apiError(error.code, 'Группа используется объектами имущества', 409)
```

</details>

<a id="api-064"></a>
### API-064: GET /api/groups

Источник handler: [src/app/api/groups/route.ts:7](../../src/app/api/groups/route.ts#L7).

- **Auth:** `authorizeApiRequest(request, 'assetGroups.read')` [source](../../src/app/api/groups/route.ts#L8); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R046](#r046) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Permission assetGroups.read имеет scope none; весь справочник.
- **Calls:** [CatalogService.listGroups](../../src/features/assets/application/catalog.service.ts#L17). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/groups/route.ts#L9); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/groups/route.ts#L10)

```ts
return apiData(await CatalogService.listGroups())
```

</details>

<a id="api-065"></a>
### API-065: POST /api/groups

Источник handler: [src/app/api/groups/route.ts:13](../../src/app/api/groups/route.ts#L13).

- **Auth:** `authorizeApiRequest(request, 'assetGroups.create')` [source](../../src/app/api/groups/route.ts#L14); общие auth branches выше.
- **Схемы HTTP boundary:** [createGroupSchema](#schema-bb3e7c7416) ([source](../../src/features/assets/contracts/schemas.ts#L42)).
- **Parsing:** `createGroupSchema.safeParse(await request.json())` [source](../../src/app/api/groups/route.ts#L16); `request.json()` [source](../../src/app/api/groups/route.ts#L16).
- **Выходные формы:** [R045](#r045) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** permission gate route; выбранные services не принимают AccessContext/resource target. Точная permission scope kind — в общей матрице permissions.
- **Calls:** [CatalogService.createGroup](../../src/features/assets/application/catalog.service.ts#L51). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** AssetGroup create + audit в transaction.
- **Writes/IO evidence:** `tx.assetGroup.create` [source](../../src/features/assets/application/catalog.service.ts#L54); `tx.auditLog.create` [source](../../src/features/assets/application/catalog.service.ts#L55).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/groups/route.ts#L15); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/groups/route.ts#L17); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/groups/route.ts#L19)

```ts
return apiData(await CatalogService.createGroup(input.data, auth.user.id, auth.requestId), { status: 201 })
```

[source](../../src/app/api/groups/route.ts#L22); enclosing checks: `catch AND error instanceof CatalogServiceError && error.code === 'CODE_EXISTS'`

```ts
return apiError(error.code, 'Группа с таким кодом уже существует', 409)
```

</details>

<a id="api-066"></a>
### API-066: GET /api/health/live

Источник handler: [src/app/api/health/live/route.ts:5](../../src/app/api/health/live/route.ts#L5).

- **Auth:** публичный health endpoint, исключён proxy matcher.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R047](#r047) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Side effects:** выбранный business read не содержит model writes.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/health/live/route.ts#L6)

```ts
return apiData({ status: 'ok', timestamp: new Date().toISOString() })
```

</details>

<a id="api-067"></a>
### API-067: GET /api/health/ready

Источник handler: [src/app/api/health/ready/route.ts:8](../../src/app/api/health/ready/route.ts#L8).

- **Auth:** публичный health endpoint, исключён proxy matcher.
- **Query/header reads:** `request.headers.get('x-request-id')?.slice(0, 128)` [source](../../src/app/api/health/ready/route.ts#L9); `request.headers.get('x-request-id')` [source](../../src/app/api/health/ready/route.ts#L9).
- **Выходные формы:** [R047](#r047) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Calls:** [getDb](../../src/lib/prisma.ts#L9), [LocalFilesystemStorage.healthCheck](../../src/features/documents/infrastructure/local-filesystem-storage.ts#L232), [getDocumentStorage](../../src/features/documents/infrastructure/document-storage.ts#L6). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Параллельно SQL SELECT 1 и getDocumentStorage().healthCheck(); storage проверяет/создаёт configured root и write access. Любой сбой (в том числе storage)→503 DATABASE_UNAVAILABLE; logger.error при failure.
- **Прямой DB в route:** `getDb().$queryRaw\`SELECT 1\`,` [source](../../src/app/api/health/ready/route.ts#L12).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/health/ready/route.ts#L15)

```ts
return apiData({ status: 'ready', timestamp: new Date().toISOString() }, {
      headers: { 'x-request-id': requestId },
    })
```

[source](../../src/app/api/health/ready/route.ts#L25); enclosing checks: `catch`

```ts
return response
```

</details>

<a id="api-068"></a>
### API-068: GET /api/mols/[id]

Источник handler: [src/app/api/mols/[id]/route.ts:18](../../src/app/api/mols/%5Bid%5D/route.ts#L18).

- **Auth:** `authorizeApiRequest(request, 'mols.read')` [source](../../src/app/api/mols/%5Bid%5D/route.ts#L19); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R048](#r048) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** department МОЛ проверяется в route и ограничивается в service.
- **Route scope predicates:** `molTarget(id)` [source](../../src/app/api/mols/%5Bid%5D/route.ts#L22); `auth.access.allows('mols.read', target)` [source](../../src/app/api/mols/%5Bid%5D/route.ts#L23).
- **Calls:** [CatalogService.getMol](../../src/features/assets/application/catalog.service.ts#L38). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/mols/%5Bid%5D/route.ts#L20); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/mols/%5Bid%5D/route.ts#L24); enclosing checks: `target && !auth.access.allows('mols.read', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/mols/%5Bid%5D/route.ts#L27)

```ts
return mol ? apiData(mol) : apiError('NOT_FOUND', 'МОЛ не найден', 404)
```

[Local error mapping source](../../src/app/api/mols/%5Bid%5D/route.ts#L12)

```ts
const catalogError = (error: CatalogServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'МОЛ не найден', 404)
  : error.code === 'CODE_EXISTS'
    ? apiError(error.code, 'МОЛ с таким кодом уже существует', 409)
    : apiError(error.code, 'МОЛ используется в остатках или истории имущества', 409)
```

</details>

<a id="api-069"></a>
### API-069: PUT /api/mols/[id]

Источник handler: [src/app/api/mols/[id]/route.ts:30](../../src/app/api/mols/%5Bid%5D/route.ts#L30).

- **Auth:** `authorizeApiRequest(request, 'mols.update')` [source](../../src/app/api/mols/%5Bid%5D/route.ts#L31); общие auth branches выше.
- **Схемы HTTP boundary:** [createMolSchema](#schema-8c5db32cb4) ([source](../../src/features/assets/contracts/schemas.ts#L30)).
- **Parsing:** `createMolSchema.safeParse(await request.json())` [source](../../src/app/api/mols/%5Bid%5D/route.ts#L33); `request.json()` [source](../../src/app/api/mols/%5Bid%5D/route.ts#L33).
- **Выходные формы:** [R049](#r049) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route требует current и destination departments по mols.update.
- **Route scope predicates:** `molTarget(id)` [source](../../src/app/api/mols/%5Bid%5D/route.ts#L37); `departmentForReference(input.data)` [source](../../src/app/api/mols/%5Bid%5D/route.ts#L38); `auth.access.allows('mols.update', { departmentIds: [ ...(currentTarget.departmentId ? [currentTarget.departmentId] : []), ...(nextDepartmentId ? [nextDepartmentId] : []), ], })` [source](../../src/app/api/mols/%5Bid%5D/route.ts#L40).
- **Calls:** [CatalogService.updateMol](../../src/features/assets/application/catalog.service.ts#L148). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Organization mutation lock; Mol update + audit. Существующие holdings не запрещают смену department в этом service; это меняет resource visibility имущества.
- **Writes/IO evidence:** `tx.mol.update` [source](../../src/features/assets/application/catalog.service.ts#L156); `tx.auditLog.create` [source](../../src/features/assets/application/catalog.service.ts#L167).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [catalogError](#mapper-78a450d1b9) ([source](../../src/app/api/mols/%5Bid%5D/route.ts#L12)), [getDepartmentReferenceErrorMeta](#mapper-6cf752dd03) ([source](../../src/lib/organization/department-reference.ts#L20)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/mols/%5Bid%5D/route.ts#L32); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/mols/%5Bid%5D/route.ts#L34); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/mols/%5Bid%5D/route.ts#L45); enclosing checks: `currentTarget && !auth.access.allows('mols.update', { departmentIds: [ ...(currentTarget.departmentId ? [currentTarget.departmentId] : []), ...(nextDepartmentId ? [nextDepartmentId] : []), ], })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/mols/%5Bid%5D/route.ts#L47)

```ts
return apiData(await CatalogService.updateMol(id, input.data, auth.user.id, auth.requestId))
```

[source](../../src/app/api/mols/%5Bid%5D/route.ts#L49); enclosing checks: `catch AND error instanceof CatalogServiceError`

```ts
return catalogError(error)
```

[source](../../src/app/api/mols/%5Bid%5D/route.ts#L52); enclosing checks: `catch AND error instanceof DepartmentReferenceError`

```ts
return apiError(error.code, meta.message, meta.status)
```

[Local error mapping source](../../src/app/api/mols/%5Bid%5D/route.ts#L12)

```ts
const catalogError = (error: CatalogServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'МОЛ не найден', 404)
  : error.code === 'CODE_EXISTS'
    ? apiError(error.code, 'МОЛ с таким кодом уже существует', 409)
    : apiError(error.code, 'МОЛ используется в остатках или истории имущества', 409)
```

</details>

<a id="api-070"></a>
### API-070: DELETE /api/mols/[id]

Источник handler: [src/app/api/mols/[id]/route.ts:58](../../src/app/api/mols/%5Bid%5D/route.ts#L58).

- **Auth:** `authorizeApiRequest(request, 'mols.delete')` [source](../../src/app/api/mols/%5Bid%5D/route.ts#L59); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R030](#r030) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет department текущего МОЛ; service проверяет references/остатки.
- **Route scope predicates:** `molTarget(id)` [source](../../src/app/api/mols/%5Bid%5D/route.ts#L62); `auth.access.allows('mols.delete', target)` [source](../../src/app/api/mols/%5Bid%5D/route.ts#L63).
- **Calls:** [CatalogService.deleteMol](../../src/features/assets/application/catalog.service.ts#L194). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Mol physical delete + audit; references guard.
- **Writes/IO evidence:** `tx.mol.delete` [source](../../src/features/assets/application/catalog.service.ts#L199); `tx.auditLog.create` [source](../../src/features/assets/application/catalog.service.ts#L200).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [catalogError](#mapper-78a450d1b9) ([source](../../src/app/api/mols/%5Bid%5D/route.ts#L12)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/mols/%5Bid%5D/route.ts#L60); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/mols/%5Bid%5D/route.ts#L64); enclosing checks: `target && !auth.access.allows('mols.delete', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/mols/%5Bid%5D/route.ts#L67)

```ts
return apiData(await CatalogService.deleteMol(id, auth.user.id, auth.requestId))
```

[source](../../src/app/api/mols/%5Bid%5D/route.ts#L69); enclosing checks: `catch AND error instanceof CatalogServiceError`

```ts
return catalogError(error)
```

[Local error mapping source](../../src/app/api/mols/%5Bid%5D/route.ts#L12)

```ts
const catalogError = (error: CatalogServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'МОЛ не найден', 404)
  : error.code === 'CODE_EXISTS'
    ? apiError(error.code, 'МОЛ с таким кодом уже существует', 409)
    : apiError(error.code, 'МОЛ используется в остатках или истории имущества', 409)
```

</details>

<a id="api-071"></a>
### API-071: GET /api/mols

Источник handler: [src/app/api/mols/route.ts:12](../../src/app/api/mols/route.ts#L12).

- **Auth:** `authorizeApiRequest(request, 'mols.read')` [source](../../src/app/api/mols/route.ts#L13); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R050](#r050) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** allowedDepartmentIds(mols.read), затем DB departmentId filter.
- **Calls:** [CatalogService.listMols](../../src/features/assets/application/catalog.service.ts#L21). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/mols/route.ts#L14); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/mols/route.ts#L15)

```ts
return apiData(await CatalogService.listMols(auth.access))
```

</details>

<a id="api-072"></a>
### API-072: POST /api/mols

Источник handler: [src/app/api/mols/route.ts:18](../../src/app/api/mols/route.ts#L18).

- **Auth:** `authorizeApiRequest(request, 'mols.create')` [source](../../src/app/api/mols/route.ts#L19); общие auth branches выше.
- **Схемы HTTP boundary:** [createMolSchema](#schema-8c5db32cb4) ([source](../../src/features/assets/contracts/schemas.ts#L30)).
- **Parsing:** `createMolSchema.safeParse(await request.json())` [source](../../src/app/api/mols/route.ts#L21); `request.json()` [source](../../src/app/api/mols/route.ts#L21).
- **Выходные формы:** [R049](#r049) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет departmentForReference; service разрешает id/name и active department.
- **Route scope predicates:** `departmentForReference(input.data)` [source](../../src/app/api/mols/route.ts#L23); `auth.access.allows('mols.create', { departmentId })` [source](../../src/app/api/mols/route.ts#L24).
- **Calls:** [CatalogService.createMol](../../src/features/assets/application/catalog.service.ts#L112). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Organization mutation lock; Mol create + audit, department reference normalization.
- **Writes/IO evidence:** `tx.mol.create` [source](../../src/features/assets/application/catalog.service.ts#L116); `tx.auditLog.create` [source](../../src/features/assets/application/catalog.service.ts#L126).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [getDepartmentReferenceErrorMeta](#mapper-6cf752dd03) ([source](../../src/lib/organization/department-reference.ts#L20)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/mols/route.ts#L20); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/mols/route.ts#L22); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/mols/route.ts#L25); enclosing checks: `departmentId && !auth.access.allows('mols.create', { departmentId })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/mols/route.ts#L28)

```ts
return apiData(await CatalogService.createMol(input.data, auth.user.id, auth.requestId), { status: 201 })
```

[source](../../src/app/api/mols/route.ts#L32); enclosing checks: `catch AND error instanceof CatalogServiceError AND error.code === 'CODE_EXISTS'`

```ts
return apiError(error.code, 'МОЛ с таким кодом уже существует', 409)
```

[source](../../src/app/api/mols/route.ts#L37); enclosing checks: `catch AND error instanceof DepartmentReferenceError`

```ts
return apiError(error.code, meta.message, meta.status)
```

</details>

<a id="api-073"></a>
### API-073: PATCH /api/notifications/[id]

Источник handler: [src/app/api/notifications/[id]/route.ts:12](../../src/app/api/notifications/%5Bid%5D/route.ts#L12).

- **Auth:** `authorizeApiRequest(request)` [source](../../src/app/api/notifications/%5Bid%5D/route.ts#L13); общие auth branches выше.
- **Схемы HTTP boundary:** [notificationStateSchema](#schema-97654639a9) ([source](../../src/features/notifications/contracts/notification.ts#L12)).
- **Parsing:** `notificationStateSchema.safeParse(await request.json())` [source](../../src/app/api/notifications/%5Bid%5D/route.ts#L15); `request.json()` [source](../../src/app/api/notifications/%5Bid%5D/route.ts#L15).
- **Выходные формы:** [R051](#r051) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Только actor recipient; чужой ID даёт NOT_FOUND.
- **Calls:** [NotificationService.setRead](../../src/features/notifications/application/notification.service.ts#L91), [getNotificationService](../../src/features/notifications/application/notification.service.ts#L288). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Меняет readAt; ответ read echo input.
- **Writes/IO evidence:** `this.db.notification.updateMany` [source](../../src/features/notifications/application/notification.service.ts#L92).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [notificationApiError](#mapper-c6411e183e) ([source](../../src/features/notifications/application/http.ts#L4)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/notifications/%5Bid%5D/route.ts#L14); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/notifications/%5Bid%5D/route.ts#L16); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/notifications/%5Bid%5D/route.ts#L20)

```ts
return apiData({ id, read: input.data.read })
```

[source](../../src/app/api/notifications/%5Bid%5D/route.ts#L22); enclosing checks: `catch`

```ts
return notificationApiError(error)
```

</details>

<a id="api-074"></a>
### API-074: DELETE /api/notifications/[id]

Источник handler: [src/app/api/notifications/[id]/route.ts:26](../../src/app/api/notifications/%5Bid%5D/route.ts#L26).

- **Auth:** `authorizeApiRequest(request)` [source](../../src/app/api/notifications/%5Bid%5D/route.ts#L27); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R052](#r052) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Только actor recipient; чужой ID даёт NOT_FOUND.
- **Calls:** [NotificationService.delete](../../src/features/notifications/application/notification.service.ts#L117), [getNotificationService](../../src/features/notifications/application/notification.service.ts#L288). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Удаляет notification row собственного recipient.
- **Writes/IO evidence:** `this.db.notification.updateMany` [source](../../src/features/notifications/application/notification.service.ts#L118).
- **Error maps:** [notificationApiError](#mapper-c6411e183e) ([source](../../src/features/notifications/application/http.ts#L4)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/notifications/%5Bid%5D/route.ts#L28); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/notifications/%5Bid%5D/route.ts#L32)

```ts
return apiData({ id, deleted: true })
```

[source](../../src/app/api/notifications/%5Bid%5D/route.ts#L34); enclosing checks: `catch`

```ts
return notificationApiError(error)
```

</details>

<a id="api-075"></a>
### API-075: POST /api/notifications/generate-alerts

Источник handler: [src/app/api/notifications/generate-alerts/route.ts:6](../../src/app/api/notifications/generate-alerts/route.ts#L6).

- **Auth:** `authorizeApiRequest(request, 'access.users.update')` [source](../../src/app/api/notifications/generate-alerts/route.ts#L7); общие auth branches выше.
- **Вход и transport:** Body/query не читаются; force:true задан route.
- **Выходные формы:** [R053](#r053) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Calls:** [runScheduledAlertGeneration](../../src/features/notifications/application/alert-runner.ts#L11). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** runScheduledAlertGeneration(force=true) обновляет ScheduledAlertRun и публикует deduped notifications/outbox; check-then-upsert не atomic lock.
- **Writes/IO evidence:** `db.scheduledAlertRun.upsert` [source](../../src/features/notifications/application/alert-runner.ts#L28); `db.scheduledAlertRun.upsert` [source](../../src/features/notifications/application/alert-runner.ts#L40); `db.scheduledAlertRun.upsert` [source](../../src/features/notifications/application/alert-runner.ts#L47); `db.approvalStep.updateMany` [source](../../src/features/notifications/application/scheduled-alerts.ts#L257).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/notifications/generate-alerts/route.ts#L8); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/notifications/generate-alerts/route.ts#L9)

```ts
return apiData(await runScheduledAlertGeneration({
    force: true,
    actorId: auth.user.id,
    requestId: auth.requestId,
  }))
```

</details>

<a id="api-076"></a>
### API-076: GET /api/notifications/preferences

Источник handler: [src/app/api/notifications/preferences/route.ts:7](../../src/app/api/notifications/preferences/route.ts#L7).

- **Auth:** `authorizeApiRequest(request)` [source](../../src/app/api/notifications/preferences/route.ts#L8); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R054](#r054) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Только userId=actor; отсутствующие значения заполняются defaults для event/channel.
- **Calls:** [NotificationService.getPreferences](../../src/features/notifications/application/notification.service.ts#L130), [getNotificationService](../../src/features/notifications/application/notification.service.ts#L288). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/notifications/preferences/route.ts#L9); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/notifications/preferences/route.ts#L10)

```ts
return apiData(await getNotificationService().getPreferences(auth.user.id))
```

</details>

<a id="api-077"></a>
### API-077: PUT /api/notifications/preferences

Источник handler: [src/app/api/notifications/preferences/route.ts:13](../../src/app/api/notifications/preferences/route.ts#L13).

- **Auth:** `authorizeApiRequest(request)` [source](../../src/app/api/notifications/preferences/route.ts#L14); общие auth branches выше.
- **Схемы HTTP boundary:** [notificationPreferencesSchema](#schema-2c652a86d4) ([source](../../src/features/notifications/contracts/notification.ts#L16)).
- **Parsing:** `notificationPreferencesSchema.safeParse(await request.json())` [source](../../src/app/api/notifications/preferences/route.ts#L16); `request.json()` [source](../../src/app/api/notifications/preferences/route.ts#L16).
- **Выходные формы:** [R054](#r054) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Только userId=actor; array upsert; audit с actor.
- **Calls:** [NotificationService.updatePreferences](../../src/features/notifications/application/notification.service.ts#L151), [getNotificationService](../../src/features/notifications/application/notification.service.ts#L288). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Upsert preferences и audit; downstream publish учитывает preferences.
- **Writes/IO evidence:** `tx.notificationPreference.upsert` [source](../../src/features/notifications/application/notification.service.ts#L158); `tx.auditLog.create` [source](../../src/features/notifications/application/notification.service.ts#L171).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/notifications/preferences/route.ts#L15); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/notifications/preferences/route.ts#L17); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/notifications/preferences/route.ts#L18)

```ts
return apiData(await getNotificationService().updatePreferences(
    auth.user.id,
    input.data.preferences,
    auth.requestId,
  ))
```

</details>

<a id="api-078"></a>
### API-078: POST /api/notifications/read-all

Источник handler: [src/app/api/notifications/read-all/route.ts:6](../../src/app/api/notifications/read-all/route.ts#L6).

- **Auth:** `authorizeApiRequest(request)` [source](../../src/app/api/notifications/read-all/route.ts#L7); общие auth branches выше.
- **Вход и transport:** Body/query не читаются.
- **Выходные формы:** [R055](#r055) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Только recipientUserId=actor.
- **Calls:** [NotificationService.markAllRead](../../src/features/notifications/application/notification.service.ts#L104), [getNotificationService](../../src/features/notifications/application/notification.service.ts#L288). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Обновляет readAt у непрочитанных собственного recipient; возвращает count.
- **Writes/IO evidence:** `this.db.notification.updateMany` [source](../../src/features/notifications/application/notification.service.ts#L105).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/notifications/read-all/route.ts#L8); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/notifications/read-all/route.ts#L9)

```ts
return apiData({
    updated: await getNotificationService().markAllRead(auth.user.id),
  })
```

</details>

<a id="api-079"></a>
### API-079: GET /api/notifications

Источник handler: [src/app/api/notifications/route.ts:9](../../src/app/api/notifications/route.ts#L9).

- **Auth:** `authorizeApiRequest(request)` [source](../../src/app/api/notifications/route.ts#L10); общие auth branches выше.
- **Схемы HTTP boundary:** [notificationsQuerySchema](#schema-1c56423d38) ([source](../../src/features/notifications/contracts/notification.ts#L6)).
- **Parsing:** `notificationsQuerySchema.safeParse( Object.fromEntries(request.nextUrl.searchParams), )` [source](../../src/app/api/notifications/route.ts#L13).
- **Выходные формы:** [R056](#r056) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Только recipientUserId=actor; HTTP permission не требуется сверх auth.
- **Calls:** [NotificationService.list](../../src/features/notifications/application/notification.service.ts#L60), [getNotificationService](../../src/features/notifications/application/notification.service.ts#L288). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/notifications/route.ts#L11); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/notifications/route.ts#L16); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/notifications/route.ts#L19)

```ts
return apiList(result.notifications, {
    page: query.data.page,
    pageSize: query.data.pageSize,
    total: result.total,
  })
```

</details>

<a id="api-080"></a>
### API-080: POST /api/notifications/smtp/process

Источник handler: [src/app/api/notifications/smtp/process/route.ts:6](../../src/app/api/notifications/smtp/process/route.ts#L6).

- **Auth:** `authorizeApiRequest(request, 'access.users.update')` [source](../../src/app/api/notifications/smtp/process/route.ts#L7); общие auth branches выше.
- **Вход и transport:** Body/query не читаются.
- **Выходные формы:** [R057](#r057) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Глобальный outbox; access.users.update (scope none), recipient scopes не ограничивают batch.
- **Calls:** [SmtpService.processOutbox](../../src/features/notifications/application/smtp.service.ts#L75). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Claim lease/attempts, SMTP send, SENT/FAILED/PENDING statuses; response sent/failed/skipped; at-least-once, mail принятый до status update может повториться.
- **Writes/IO evidence:** `this.sendEmail` [source](../../src/features/notifications/application/smtp.service.ts#L104); `transporter.sendMail` [source](../../src/features/notifications/application/smtp.service.ts#L67); `db.notificationOutbox.updateMany` [source](../../src/features/notifications/application/outbox.service.ts#L94); `db.notificationOutbox.updateMany` [source](../../src/features/notifications/application/outbox.service.ts#L111).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/notifications/smtp/process/route.ts#L8); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/notifications/smtp/process/route.ts#L11)

```ts
return apiData(result)
```

</details>

<a id="api-081"></a>
### API-081: GET /api/notifications/smtp

Источник handler: [src/app/api/notifications/smtp/route.ts:16](../../src/app/api/notifications/smtp/route.ts#L16).

- **Auth:** `authorizeApiRequest(request, 'access.users.update')` [source](../../src/app/api/notifications/smtp/route.ts#L17); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R058](#r058), [R059](#r059) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Глобальная конфигурация; access.users.update (scope none).
- **Calls:** [SmtpService.getSettings](../../src/features/notifications/application/smtp.service.ts#L15). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/notifications/smtp/route.ts#L18); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/notifications/smtp/route.ts#L22); enclosing checks: `!settings`

```ts
return apiData(null)
```

[source](../../src/app/api/notifications/smtp/route.ts#L25)

```ts
return apiData({
    host: settings.host,
    port: settings.port,
    username: settings.username,
    secure: settings.secure,
    fromEmail: settings.fromEmail,
    password: '', // Redact password
  })
```

</details>

<a id="api-082"></a>
### API-082: POST /api/notifications/smtp

Источник handler: [src/app/api/notifications/smtp/route.ts:35](../../src/app/api/notifications/smtp/route.ts#L35).

- **Auth:** `authorizeApiRequest(request, 'access.users.update')` [source](../../src/app/api/notifications/smtp/route.ts#L36); общие auth branches выше.
- **Схемы HTTP boundary:** [smtpSettingsSchema](#schema-f267578cd6) ([source](../../src/app/api/notifications/smtp/route.ts#L7)).
- **Parsing:** `smtpSettingsSchema.safeParse(await request.json())` [source](../../src/app/api/notifications/smtp/route.ts#L39); `request.json()` [source](../../src/app/api/notifications/smtp/route.ts#L39).
- **Выходные формы:** [R059](#r059) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Глобальная конфигурация; access.users.update (scope none).
- **Calls:** [SmtpService.saveSettings](../../src/features/notifications/application/smtp.service.ts#L22). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Upsert глобальных SMTP settings (singleton) всеми input fields; password redacted в response. Пустой password HTTP schema отклоняет min(1), сохранения старого пароля при update нет.
- **Writes/IO evidence:** `db.smtpSettings.upsert` [source](../../src/features/notifications/application/smtp.service.ts#L24).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/notifications/smtp/route.ts#L37); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/notifications/smtp/route.ts#L41); enclosing checks: `!input.success`

```ts
return apiError('BAD_REQUEST', 'Неверный формат настроек', 400)
```

[source](../../src/app/api/notifications/smtp/route.ts#L45)

```ts
return apiData({
    host: saved.host,
    port: saved.port,
    username: saved.username,
    secure: saved.secure,
    fromEmail: saved.fromEmail,
    password: '',
  })
```

</details>

<a id="api-083"></a>
### API-083: POST /api/notifications/smtp/test

Источник handler: [src/app/api/notifications/smtp/test/route.ts:16](../../src/app/api/notifications/smtp/test/route.ts#L16).

- **Auth:** `authorizeApiRequest(request, 'access.users.update')` [source](../../src/app/api/notifications/smtp/test/route.ts#L17); общие auth branches выше.
- **Схемы HTTP boundary:** [smtpTestSchema](#schema-6e9a1aaf1c) ([source](../../src/app/api/notifications/smtp/test/route.ts#L7)).
- **Parsing:** `smtpTestSchema.safeParse(await request.json())` [source](../../src/app/api/notifications/smtp/test/route.ts#L20); `request.json()` [source](../../src/app/api/notifications/smtp/test/route.ts#L20).
- **Выходные формы:** [R030](#r030) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Глобальная конфигурация; access.users.update (scope none). Глобальная SMTP проверка; access.users.update (scope none).
- **Calls:** [SmtpService.getSettings](../../src/features/notifications/application/smtp.service.ts#L15), [SmtpService.testConnection](../../src/features/notifications/application/smtp.service.ts#L34). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** SMTP verify/network IO; не пишет settings. false→HTTP 200 success=false. Branch загрузки старого password при пустой строке недостижим после z.string().min(1); blank/redacted password→400 BAD_REQUEST.
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/notifications/smtp/test/route.ts#L18); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/notifications/smtp/test/route.ts#L22); enclosing checks: `!input.success`

```ts
return apiError('BAD_REQUEST', 'Неверный формат настроек', 400)
```

[source](../../src/app/api/notifications/smtp/test/route.ts#L30); enclosing checks: `settingsToTest.password === '' AND !existing`

```ts
return apiError('BAD_REQUEST', 'Пароль не может быть пустым при первой настройке', 400)
```

[source](../../src/app/api/notifications/smtp/test/route.ts#L36)

```ts
return apiData({ success })
```

</details>

<a id="api-084"></a>
### API-084: GET /api/notifications/unread-count

Источник handler: [src/app/api/notifications/unread-count/route.ts:8](../../src/app/api/notifications/unread-count/route.ts#L8).

- **Auth:** `authorizeApiRequest(request)` [source](../../src/app/api/notifications/unread-count/route.ts#L9); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R060](#r060) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Только recipientUserId=actor и readAt=null.
- **Calls:** [NotificationService.unreadCount](../../src/features/notifications/application/notification.service.ts#L80), [getNotificationService](../../src/features/notifications/application/notification.service.ts#L288). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/notifications/unread-count/route.ts#L10); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/notifications/unread-count/route.ts#L11)

```ts
return apiData({ count: await getNotificationService().unreadCount(auth.user.id) })
```

</details>

<a id="api-085"></a>
### API-085: GET /api/operations

Источник handler: [src/app/api/operations/route.ts:7](../../src/app/api/operations/route.ts#L7).

- **Auth:** `authorizeApiRequest(request, 'operations.read')` [source](../../src/app/api/operations/route.ts#L8); общие auth branches выше.
- **Схемы HTTP boundary:** [operationsQuerySchema](#schema-b8c72ab68e) ([source](../../src/features/assets/contracts/schemas.ts#L98)).
- **Parsing:** `operationsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))` [source](../../src/app/api/operations/route.ts#L11).
- **Выходные формы:** [R061](#r061) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Service scope evidence:** `access.assetWhere('operations.read')` [source](../../src/features/assets/application/asset.service.ts#L127).
- **Calls:** [AssetService.listOperations](../../src/features/assets/application/asset.service.ts#L120). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/operations/route.ts#L9); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/operations/route.ts#L12); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/operations/route.ts#L14)

```ts
return apiList(result.operations, {
    page: query.data.page,
    pageSize: query.data.pageSize,
    total: result.total,
  })
```

</details>

<a id="api-086"></a>
### API-086: DELETE /api/payroll/adjustments/[id]

Источник handler: [src/app/api/payroll/adjustments/[id]/route.ts:7](../../src/app/api/payroll/adjustments/%5Bid%5D/route.ts#L7).

- **Auth:** `authorizeApiRequest(request, 'payroll.manage')` [source](../../src/app/api/payroll/adjustments/%5Bid%5D/route.ts#L11); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R001](#r001) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** payroll.manage имеет scope none; ищет adjustment globally по ID и проверяет CLOSED period.
- **Calls:** [PayrollService.removeAdjustment](../../src/features/finance/application/payroll.service.ts#L230). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Physical adjustment delete и audit; payroll period lock.
- **Writes/IO evidence:** `tx.payrollAdjustment.delete` [source](../../src/features/finance/application/payroll.service.ts#L243); `tx.auditLog.create` [source](../../src/features/finance/application/payroll.service.ts#L244); `tx.payrollPeriod.upsert` [source](../../src/lib/payroll-period-transaction.ts#L8).
- **Error maps:** [payrollApiError](#mapper-1eb9b0a5b6) ([source](../../src/features/finance/application/payroll-http.ts#L4)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/payroll/adjustments/%5Bid%5D/route.ts#L12); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/payroll/adjustments/%5Bid%5D/route.ts#L15)

```ts
return apiData({ success: true })
```

[source](../../src/app/api/payroll/adjustments/%5Bid%5D/route.ts#L17); enclosing checks: `catch`

```ts
return payrollApiError(error)
```

</details>

<a id="api-087"></a>
### API-087: GET /api/payroll/export-payslip

Источник handler: [src/app/api/payroll/export-payslip/route.ts:14](../../src/app/api/payroll/export-payslip/route.ts#L14).

- **Auth:** `authorizeApiRequest(request, 'payroll.export')` [source](../../src/app/api/payroll/export-payslip/route.ts#L15); общие auth branches выше.
- **Схемы HTTP boundary:** [payslipQuerySchema](#schema-9a62e4b4cb) ([source](../../src/app/api/payroll/export-payslip/route.ts#L8)).
- **Parsing:** `payslipQuerySchema.safeParse(params)` [source](../../src/app/api/payroll/export-payslip/route.ts#L19).
- **Binary/headers:** 200 buffered XLSX только выбранного employee; cache-control no-store; scoped месяц без employee даёт 404.
- **Resource scope:** employees фильтруются через finance.salary.read, хотя route требует payroll.read/export. Project forecasts/options query загружает все ACTIVE projects без projectWhere.
- **Service scope evidence:** `access.employeeWhere('finance.salary.read')` [source](../../src/features/finance/application/payroll.service.ts#L39).
- **Calls:** [PayrollService.getMonth](../../src/features/finance/application/payroll.service.ts#L33). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/payroll/export-payslip/route.ts#L16); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/payroll/export-payslip/route.ts#L20); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/payroll/export-payslip/route.ts#L27); enclosing checks: `!row`

```ts
return apiError('NOT_FOUND', 'Сотрудник не найден в расчетной ведомости за этот месяц', 404)
```

[source](../../src/app/api/payroll/export-payslip/route.ts#L77)

```ts
return new Response(buffer as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  })
```

</details>

<a id="api-088"></a>
### API-088: GET /api/payroll/export

Источник handler: [src/app/api/payroll/export/route.ts:8](../../src/app/api/payroll/export/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'payroll.export')` [source](../../src/app/api/payroll/export/route.ts#L9); общие auth branches выше.
- **Схемы HTTP boundary:** [payrollQuerySchema](#schema-41bbae37c4) ([source](../../src/features/finance/contracts/payroll.ts#L4)).
- **Parsing:** `payrollQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))` [source](../../src/app/api/payroll/export/route.ts#L11).
- **Binary/headers:** 200 buffered XLSX; filename из route (year/month); cache-control no-store.
- **Resource scope:** employees фильтруются через finance.salary.read, хотя route требует payroll.read/export. Project forecasts/options query загружает все ACTIVE projects без projectWhere.
- **Service scope evidence:** `access.employeeWhere('finance.salary.read')` [source](../../src/features/finance/application/payroll.service.ts#L39).
- **Calls:** [PayrollService.getMonth](../../src/features/finance/application/payroll.service.ts#L33). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/payroll/export/route.ts#L10); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/payroll/export/route.ts#L12); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/payroll/export/route.ts#L65)

```ts
return new Response(buffer as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  })
```

</details>

<a id="api-089"></a>
### API-089: PUT /api/payroll/period

Источник handler: [src/app/api/payroll/period/route.ts:8](../../src/app/api/payroll/period/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'payroll.close')` [source](../../src/app/api/payroll/period/route.ts#L9); общие auth branches выше.
- **Схемы HTTP boundary:** [payrollPeriodSchema](#schema-082e23116b) ([source](../../src/features/finance/contracts/payroll.ts#L19)).
- **Parsing:** `payrollPeriodSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/payroll/period/route.ts#L11); `request.json()` [source](../../src/app/api/payroll/period/route.ts#L11).
- **Выходные формы:** [R062](#r062) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** payroll.close имеет scope none; закрытие глобального месяца проверяет все обязательные timesheets.
- **Calls:** [PayrollService.setPeriodStatus](../../src/features/finance/application/payroll.service.ts#L257). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Payroll period lock/upsert; проверка approved/zeroHours timesheets; CLOSE или REOPEN с reason, audit.
- **Writes/IO evidence:** `tx.payrollPeriod.update` [source](../../src/features/finance/application/payroll.service.ts#L309); `tx.auditLog.create` [source](../../src/features/finance/application/payroll.service.ts#L317); `tx.payrollPeriod.upsert` [source](../../src/lib/payroll-period-transaction.ts#L8).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/payroll/period/route.ts#L10); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/payroll/period/route.ts#L12); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/payroll/period/route.ts#L15)

```ts
return apiData(
      await PayrollService.setPeriodStatus(query, status, auth.user.id, auth.requestId, reason),
    )
```

[source](../../src/app/api/payroll/period/route.ts#L21); enclosing checks: `catch AND error.code === 'PAYROLL_TIMESHEETS_PENDING'`

```ts
return apiError(error.code, 'Нельзя закрыть месяц: утвердите табели всех сотрудников и подтвердите нулевые часы', 409)
```

[source](../../src/app/api/payroll/period/route.ts#L24); enclosing checks: `catch AND error.code === 'REOPEN_REASON_REQUIRED'`

```ts
return apiError(error.code, 'Укажите причину повторного открытия расчётного месяца', 422)
```

</details>

<a id="api-090"></a>
### API-090: GET /api/payroll

Источник handler: [src/app/api/payroll/route.ts:8](../../src/app/api/payroll/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'payroll.read')` [source](../../src/app/api/payroll/route.ts#L9); общие auth branches выше.
- **Схемы HTTP boundary:** [payrollQuerySchema](#schema-41bbae37c4) ([source](../../src/features/finance/contracts/payroll.ts#L4)).
- **Parsing:** `payrollQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))` [source](../../src/app/api/payroll/route.ts#L11).
- **Выходные формы:** [R063](#r063) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** employees фильтруются через finance.salary.read, хотя route требует payroll.read/export. Project forecasts/options query загружает все ACTIVE projects без projectWhere.
- **Service scope evidence:** `access.employeeWhere('finance.salary.read')` [source](../../src/features/finance/application/payroll.service.ts#L39).
- **Calls:** [PayrollService.getMonth](../../src/features/finance/application/payroll.service.ts#L33). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/payroll/route.ts#L10); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/payroll/route.ts#L12); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/payroll/route.ts#L13)

```ts
return apiData(await PayrollService.getMonth(query.data, auth.access))
```

</details>

<a id="api-091"></a>
### API-091: POST /api/payroll

Источник handler: [src/app/api/payroll/route.ts:16](../../src/app/api/payroll/route.ts#L16).

- **Auth:** `authorizeApiRequest(request, 'payroll.manage')` [source](../../src/app/api/payroll/route.ts#L17); общие auth branches выше.
- **Схемы HTTP boundary:** [createPayrollAdjustmentSchema](#schema-464cc99baf) ([source](../../src/features/finance/contracts/payroll.ts#L9)).
- **Parsing:** `createPayrollAdjustmentSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/payroll/route.ts#L19); `request.json()` [source](../../src/app/api/payroll/route.ts#L19).
- **Выходные формы:** [R064](#r064) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** payroll.manage имеет scope none; service не принимает access и не проверяет employee/project scope.
- **Calls:** [PayrollService.createAdjustment](../../src/features/finance/application/payroll.service.ts#L203). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Adjustment и audit в transaction; payroll period lock.
- **Writes/IO evidence:** `tx.payrollAdjustment.create` [source](../../src/features/finance/application/payroll.service.ts#L213); `tx.auditLog.create` [source](../../src/features/finance/application/payroll.service.ts#L216); `tx.payrollPeriod.upsert` [source](../../src/lib/payroll-period-transaction.ts#L8).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [payrollApiError](#mapper-1eb9b0a5b6) ([source](../../src/features/finance/application/payroll-http.ts#L4)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/payroll/route.ts#L18); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/payroll/route.ts#L20); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/payroll/route.ts#L22)

```ts
return apiData(
      await PayrollService.createAdjustment(input.data, auth.user.id, auth.requestId),
      { status: 201 },
    )
```

[source](../../src/app/api/payroll/route.ts#L27); enclosing checks: `catch`

```ts
return payrollApiError(error)
```

</details>

<a id="api-092"></a>
### API-092: DELETE /api/personnel-actions/[id]

Источник handler: [src/app/api/personnel-actions/[id]/route.ts:8](../../src/app/api/personnel-actions/%5Bid%5D/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'personnelActions.delete')` [source](../../src/app/api/personnel-actions/%5Bid%5D/route.ts#L9); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R030](#r030) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет employee/department действия; отсутствие record вызывает ServiceError(INVALID_ACTION_DATE), который этот route не маппит.
- **Route scope predicates:** `personnelActionTarget(id)` [source](../../src/app/api/personnel-actions/%5Bid%5D/route.ts#L12); `auth.access.allows('personnelActions.delete', target)` [source](../../src/app/api/personnel-actions/%5Bid%5D/route.ts#L13).
- **Calls:** [PersonnelActionService.delete](../../src/features/employees/application/personnel-action.service.ts#L47). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** PersonnelAction physical delete + audit; историческое Employee mutation назад не откатывается.
- **Writes/IO evidence:** `tx.personnelAction.delete` [source](../../src/features/employees/application/personnel-action.service.ts#L51); `tx.auditLog.create` [source](../../src/features/employees/application/personnel-action.service.ts#L52).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/personnel-actions/%5Bid%5D/route.ts#L10); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/personnel-actions/%5Bid%5D/route.ts#L14); enclosing checks: `target && !auth.access.allows('personnelActions.delete', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/personnel-actions/%5Bid%5D/route.ts#L16)

```ts
return apiData(await PersonnelActionService.delete(id, auth.user.id, auth.requestId))
```

</details>

<a id="api-093"></a>
### API-093: GET /api/personnel-actions

Источник handler: [src/app/api/personnel-actions/route.ts:18](../../src/app/api/personnel-actions/route.ts#L18).

- **Auth:** `authorizeApiRequest(request, 'personnelActions.read')` [source](../../src/app/api/personnel-actions/route.ts#L19); общие auth branches выше.
- **Схемы HTTP boundary:** [querySchema](#schema-9cb53482ce) ([source](../../src/app/api/personnel-actions/route.ts#L13)).
- **Вход и transport:** Query limit→pageSize; итоговый query parsed локальной схемой.
- **Parsing:** `querySchema.safeParse(raw)` [source](../../src/app/api/personnel-actions/route.ts#L23).
- **Выходные формы:** [R065](#r065) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** employeeWhere(personnelActions.read) через employee relation; filters/status/date в service.
- **Service scope evidence:** `access.employeeWhere('personnelActions.read')` [source](../../src/features/employees/application/personnel-action.service.ts#L27).
- **Calls:** [PersonnelActionService.list](../../src/features/employees/application/personnel-action.service.ts#L26). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/personnel-actions/route.ts#L20); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/personnel-actions/route.ts#L24); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/personnel-actions/route.ts#L26)

```ts
return apiList(result.actions, { ...query.data, total: result.total })
```

</details>

<a id="api-094"></a>
### API-094: POST /api/personnel-actions

Источник handler: [src/app/api/personnel-actions/route.ts:29](../../src/app/api/personnel-actions/route.ts#L29).

- **Auth:** `authorizeApiRequest(request, 'personnelActions.create')` [source](../../src/app/api/personnel-actions/route.ts#L30); общие auth branches выше.
- **Схемы HTTP boundary:** [createPersonnelActionSchema](#schema-45d79d466a) ([source](../../src/features/employees/contracts/schemas.ts#L37)).
- **Parsing:** `createPersonnelActionSchema.safeParse(await request.json())` [source](../../src/app/api/personnel-actions/route.ts#L32); `request.json()` [source](../../src/app/api/personnel-actions/route.ts#L32).
- **Выходные формы:** [R066](#r066) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route берёт employee target или department staff position. Не каждый newDepartment payload получает отдельную scope-проверку.
- **Route scope predicates:** `employeeTarget(employeeId)` [source](../../src/app/api/personnel-actions/route.ts#L36); `departmentForPosition(input.data.staffScheduleId || input.data.employeeData?.staffScheduleId)` [source](../../src/app/api/personnel-actions/route.ts#L37); `auth.access.allows('personnelActions.create', target)` [source](../../src/app/api/personnel-actions/route.ts#L50).
- **Calls:** [PersonnelActionService.createAction](../../src/features/employees/application/personnel-action.service.ts#L69). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** withOrganizationMutation: HIRE создаёт Employee+PersonnelAction; остальные types создают action и обновляют employee прямо в этом service (не вызывают EmployeeService). DISMISS очищает department head; audit. ARCHIVE/EDIT без отдельного switch branch не означают автоматическое увольнение.
- **Writes/IO evidence:** `tx.employee.create` [source](../../src/features/employees/application/personnel-action.service.ts#L98); `tx.personnelAction.create` [source](../../src/features/employees/application/personnel-action.service.ts#L117); `tx.auditLog.create` [source](../../src/features/employees/application/personnel-action.service.ts#L136); `tx.personnelAction.create` [source](../../src/features/employees/application/personnel-action.service.ts#L236); `tx.employee.update` [source](../../src/features/employees/application/personnel-action.service.ts#L256); `tx.auditLog.create` [source](../../src/features/employees/application/personnel-action.service.ts#L271); `db.department.updateMany` [source](../../src/features/employees/infrastructure/employee.repository.ts#L70).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [getPersonnelActionRouteErrorMeta](#mapper-38f0e7ccac) ([source](../../src/features/employees/application/error-mapping.ts#L18)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/personnel-actions/route.ts#L31); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/personnel-actions/route.ts#L33); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/personnel-actions/route.ts#L51); enclosing checks: `target && !auth.access.allows('personnelActions.create', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/personnel-actions/route.ts#L54)

```ts
return apiData(await PersonnelActionService.createAction(input.data, auth.user.id, auth.requestId), { status: 201 })
```

[source](../../src/app/api/personnel-actions/route.ts#L57); enclosing checks: `catch AND mapped`

```ts
return apiError('PERSONNEL_ACTION_INVALID', mapped.error, mapped.status)
```

</details>

<a id="api-095"></a>
### API-095: POST /api/personnel-actions/sync

Источник handler: [src/app/api/personnel-actions/sync/route.ts:6](../../src/app/api/personnel-actions/sync/route.ts#L6).

- **Auth:** `authorizeApiRequest(request, 'personnelActions.sync')` [source](../../src/app/api/personnel-actions/sync/route.ts#L7); общие auth branches выше.
- **Вход и transport:** Body/query не читаются.
- **Выходные формы:** [R067](#r067) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** personnelActions.sync имеет department scope в matrix, но route вызывает syncExpiredContracts() без access, поэтому helper получает {} и обрабатывает contracts глобально.
- **Service scope evidence:** `access?.employeeWhere('personnelActions.sync')` [source](../../src/features/employees/application/personnel-action.service.ts#L65).
- **Calls:** [PersonnelActionService.syncExpiredContracts](../../src/features/employees/application/personnel-action.service.ts#L62). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Создаёт только отсутствующие PersonnelAction ARCHIVE для истёкших contracts через createMany; Employee.status не меняет, audit не записывает. Dedup по employeeId+contractEndDate проверяется до записи, без общей transaction/unique guarantee.
- **Writes/IO evidence:** `db.personnelAction.createMany` [source](../../src/features/employees/infrastructure/workforce.repository.ts#L119).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/personnel-actions/sync/route.ts#L8); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/personnel-actions/sync/route.ts#L10)

```ts
return apiData({ success: true, createdCount })
```

</details>

<a id="api-096"></a>
### API-096: POST /api/procurement/[id]/contract

Источник handler: [src/app/api/procurement/[id]/contract/route.ts:9](../../src/app/api/procurement/%5Bid%5D/contract/route.ts#L9).

- **Auth:** `authorizeApiRequest(request, 'procurement.contract')` [source](../../src/app/api/procurement/%5Bid%5D/contract/route.ts#L10); общие auth branches выше.
- **Схемы HTTP boundary:** [contractSchema](#schema-8d37f20298) ([source](../../src/features/procurement/contracts/procurement.ts#L85)).
- **Parsing:** `contractSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/procurement/%5Bid%5D/contract/route.ts#L12); `request.json()` [source](../../src/app/api/procurement/%5Bid%5D/contract/route.ts#L12).
- **Выходные формы:** [R068](#r068) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** procurement.contract scope none; status, supplier, budget и link existence.
- **Calls:** [ProcurementService.createContract](../../src/features/procurement/application/procurement.service.ts#L390), [getProcurementService](../../src/features/procurement/application/procurement.service.ts#L646). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** ProcurementContract, request status и audit в transaction; budget limits.
- **Writes/IO evidence:** `tx.procurementContract.create` [source](../../src/features/procurement/application/procurement.service.ts#L415); `tx.procurementRequest.update` [source](../../src/features/procurement/application/procurement.service.ts#L426); `tx.auditLog.create` [source](../../src/features/procurement/application/procurement.service.ts#L427).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [procurementApiError](#mapper-7044e41e93) ([source](../../src/features/procurement/application/http.ts#L13)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/procurement/%5Bid%5D/contract/route.ts#L11); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/procurement/%5Bid%5D/contract/route.ts#L13); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/procurement/%5Bid%5D/contract/route.ts#L15)

```ts
return apiData(
      await getProcurementService().createContract(
        (await context.params).id,
        input.data,
        auth.user.id,
        auth.requestId,
      ),
      { status: 201 },
    )
```

[source](../../src/app/api/procurement/%5Bid%5D/contract/route.ts#L26); enclosing checks: `catch AND error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'`

```ts
return apiError('CONTRACT_NUMBER_EXISTS', 'Номер договора уже используется', 409)
```

[source](../../src/app/api/procurement/%5Bid%5D/contract/route.ts#L28); enclosing checks: `catch`

```ts
return procurementApiError(error)
```

</details>

<a id="api-097"></a>
### API-097: POST /api/procurement/[id]/deliveries

Источник handler: [src/app/api/procurement/[id]/deliveries/route.ts:9](../../src/app/api/procurement/%5Bid%5D/deliveries/route.ts#L9).

- **Auth:** `authorizeApiRequest(request, 'procurement.deliver')` [source](../../src/app/api/procurement/%5Bid%5D/deliveries/route.ts#L10); общие auth branches выше.
- **Схемы HTTP boundary:** [deliverySchema](#schema-8d6495d6cb) ([source](../../src/features/procurement/contracts/procurement.ts#L97)).
- **Parsing:** `deliverySchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/procurement/%5Bid%5D/deliveries/route.ts#L12); `request.json()` [source](../../src/app/api/procurement/%5Bid%5D/deliveries/route.ts#L12).
- **Выходные формы:** [R068](#r068) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** procurement.deliver scope none; позиции принадлежат contract/request и не превышают remaining quantities.
- **Service scope evidence:** `input.items .filter((candidate) => candidate.procurementItemId === item.id) .reduce((sum, candidate) => sum.add(candidate.quantity), new Prisma.Decimal(0))` [source](../../src/features/procurement/application/procurement.service.ts#L502).
- **Calls:** [ProcurementService.createDelivery](../../src/features/procurement/application/procurement.service.ts#L441), [getProcurementService](../../src/features/procurement/application/procurement.service.ts#L646). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Delivery/items, request progress/status и audit в transaction; contract/request quantities.
- **Writes/IO evidence:** `tx.procurementDelivery.create` [source](../../src/features/procurement/application/procurement.service.ts#L481); `tx.procurementRequest.update` [source](../../src/features/procurement/application/procurement.service.ts#L507); `tx.auditLog.create` [source](../../src/features/procurement/application/procurement.service.ts#L515).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [procurementApiError](#mapper-7044e41e93) ([source](../../src/features/procurement/application/http.ts#L13)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/procurement/%5Bid%5D/deliveries/route.ts#L11); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/procurement/%5Bid%5D/deliveries/route.ts#L13); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/procurement/%5Bid%5D/deliveries/route.ts#L15)

```ts
return apiData(
      await getProcurementService().createDelivery(
        (await context.params).id,
        input.data,
        auth.user.id,
        auth.requestId,
      ),
      { status: 201 },
    )
```

[source](../../src/app/api/procurement/%5Bid%5D/deliveries/route.ts#L26); enclosing checks: `catch AND error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'`

```ts
return apiError('DELIVERY_NUMBER_EXISTS', 'Номер поставки уже используется для договора', 409)
```

[source](../../src/app/api/procurement/%5Bid%5D/deliveries/route.ts#L28); enclosing checks: `catch`

```ts
return procurementApiError(error)
```

</details>

<a id="api-098"></a>
### API-098: GET /api/procurement/[id]

Источник handler: [src/app/api/procurement/[id]/route.ts:8](../../src/app/api/procurement/%5Bid%5D/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'procurement.read')` [source](../../src/app/api/procurement/%5Bid%5D/route.ts#L9); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R068](#r068) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Глобальный procurement ID; resource scopes не применяются.
- **Calls:** [ProcurementService.get](../../src/features/procurement/application/procurement.service.ts#L220), [getProcurementService](../../src/features/procurement/application/procurement.service.ts#L646). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [procurementApiError](#mapper-7044e41e93) ([source](../../src/features/procurement/application/http.ts#L13)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/procurement/%5Bid%5D/route.ts#L10); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/procurement/%5Bid%5D/route.ts#L12)

```ts
return apiData(await getProcurementService().get((await context.params).id))
```

[source](../../src/app/api/procurement/%5Bid%5D/route.ts#L14); enclosing checks: `catch`

```ts
return procurementApiError(error)
```

</details>

<a id="api-099"></a>
### API-099: PUT /api/procurement/[id]

Источник handler: [src/app/api/procurement/[id]/route.ts:18](../../src/app/api/procurement/%5Bid%5D/route.ts#L18).

- **Auth:** `authorizeApiRequest(request, 'procurement.update')` [source](../../src/app/api/procurement/%5Bid%5D/route.ts#L19); общие auth branches выше.
- **Схемы HTTP boundary:** [updateProcurementSchema](#schema-3cc0e15e9b) ([source](../../src/features/procurement/contracts/procurement.ts#L41)).
- **Parsing:** `updateProcurementSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/procurement/%5Bid%5D/route.ts#L21); `request.json()` [source](../../src/app/api/procurement/%5Bid%5D/route.ts#L21).
- **Выходные формы:** [R068](#r068) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** procurement.update scope none; состояние request и ссылки проверяются без access.
- **Calls:** [ProcurementService.update](../../src/features/procurement/application/procurement.service.ts#L301), [getProcurementService](../../src/features/procurement/application/procurement.service.ts#L646). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** ProcurementRequest update; заменяет items, audit в transaction; effective approval/status rules.
- **Writes/IO evidence:** `tx.procurementItem.deleteMany` [source](../../src/features/procurement/application/procurement.service.ts#L307); `tx.procurementRequest.update` [source](../../src/features/procurement/application/procurement.service.ts#L308); `tx.auditLog.create` [source](../../src/features/procurement/application/procurement.service.ts#L328).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [procurementApiError](#mapper-7044e41e93) ([source](../../src/features/procurement/application/http.ts#L13)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/procurement/%5Bid%5D/route.ts#L20); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/procurement/%5Bid%5D/route.ts#L22); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/procurement/%5Bid%5D/route.ts#L24)

```ts
return apiData(
      await getProcurementService().update(
        (await context.params).id,
        input.data,
        auth.user.id,
        auth.requestId,
      ),
    )
```

[source](../../src/app/api/procurement/%5Bid%5D/route.ts#L33); enclosing checks: `catch`

```ts
return procurementApiError(error)
```

</details>

<a id="api-100"></a>
### API-100: POST /api/procurement/[id]/submit

Источник handler: [src/app/api/procurement/[id]/submit/route.ts:9](../../src/app/api/procurement/%5Bid%5D/submit/route.ts#L9).

- **Auth:** `authorizeApiRequest(request, 'procurement.submit')` [source](../../src/app/api/procurement/%5Bid%5D/submit/route.ts#L10); общие auth branches выше.
- **Схемы HTTP boundary:** [submitProcurementSchema](#schema-5e0524c8aa) ([source](../../src/features/procurement/contracts/procurement.ts#L43)).
- **Parsing:** `submitProcurementSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/procurement/%5Bid%5D/submit/route.ts#L12); `request.json()` [source](../../src/app/api/procurement/%5Bid%5D/submit/route.ts#L12).
- **Выходные формы:** [R068](#r068) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route требует только procurement.submit (scope none). Callback new ApprovalService().create не проверяет approvals.create или resource scopes; активность approvers и existence document/project проверяются как business references.
- **Calls:** [ProcurementService.submit](../../src/features/procurement/application/procurement.service.ts#L342), [ApprovalService.create](../../src/features/approvals/application/approval.service.ts#L275), [getProcurementService](../../src/features/procurement/application/procurement.service.ts#L646). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Approval transaction создаёт request/steps, linked document IN_REVIEW/lockVersion и audit; notifier в new ApprovalService() не передан, publish не выполняется. Далее standalone procurement update и отдельный audit, общего UoW нет; возможен частичный результат.
- **Writes/IO evidence:** `this.db.procurementRequest.update` [source](../../src/features/procurement/application/procurement.service.ts#L364); `this.db.auditLog.create` [source](../../src/features/procurement/application/procurement.service.ts#L631); `tx.approvalRequest.create` [source](../../src/features/approvals/application/approval.service.ts#L304); `tx.document.update` [source](../../src/features/approvals/application/approval.service.ts#L331); `tx.auditLog.create` [source](../../src/features/approvals/application/approval.service.ts#L336).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [procurementApiError](#mapper-7044e41e93) ([source](../../src/features/procurement/application/http.ts#L13)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/procurement/%5Bid%5D/submit/route.ts#L11); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/procurement/%5Bid%5D/submit/route.ts#L13); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/procurement/%5Bid%5D/submit/route.ts#L15)

```ts
return apiData(
      await getProcurementService().submit(
        (await context.params).id,
        input.data,
        auth.user.id,
        auth.requestId,
        (approvalInput) => new ApprovalService().create(
          approvalInput,
          auth.user.id,
          auth.requestId,
        ),
      ),
    )
```

[source](../../src/app/api/procurement/%5Bid%5D/submit/route.ts#L29); enclosing checks: `catch`

```ts
return procurementApiError(error)
```

</details>

<a id="api-101"></a>
### API-101: POST /api/procurement/delivery-items/[id]/capitalize

Источник handler: [src/app/api/procurement/delivery-items/[id]/capitalize/route.ts:10](../../src/app/api/procurement/delivery-items/%5Bid%5D/capitalize/route.ts#L10).

- **Auth:** `authorizeApiRequest(request, 'procurement.capitalize')` [source](../../src/app/api/procurement/delivery-items/%5Bid%5D/capitalize/route.ts#L11); общие auth branches выше.
- **Схемы HTTP boundary:** [capitalizeDeliveryItemSchema](#schema-81ae034f98) ([source](../../src/features/procurement/contracts/procurement.ts#L108)).
- **Parsing:** `capitalizeDeliveryItemSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/procurement/delivery-items/%5Bid%5D/capitalize/route.ts#L13); `request.json()` [source](../../src/app/api/procurement/delivery-items/%5Bid%5D/capitalize/route.ts#L13).
- **Выходные формы:** [R069](#r069) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** procurement.capitalize scope none; asset создаётся через прямой AssetService.create callback без дополнительного assets.create permission/department scope. molId/groupId передаются внутреннему asset writer; DB existence/FK validation не является actor authorization.
- **Calls:** [ProcurementService.capitalize](../../src/features/procurement/application/procurement.service.ts#L529), [AssetService.create](../../src/features/assets/application/asset.service.ts#L227), [getProcurementService](../../src/features/procurement/application/procurement.service.ts#L646). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Создаёт asset callback в собственной AssetService transaction, затем связывает delivery item и audit отдельной transaction; возможен частичный результат/дубликат после сбоя. Внутренний asset writer создаёт asset/holding/RECEIPT/audit в Serializable transaction; наружный HTTP response только {data:{assetId,requestId}}.
- **Writes/IO evidence:** `tx.procurementDeliveryItem.updateMany` [source](../../src/features/procurement/application/procurement.service.ts#L575); `tx.procurementRequest.update` [source](../../src/features/procurement/application/procurement.service.ts#L588); `tx.auditLog.create` [source](../../src/features/procurement/application/procurement.service.ts#L593); `tx.asset.create` [source](../../src/features/assets/application/asset.service.ts#L36); `tx.assetHolding.create` [source](../../src/features/assets/application/asset.service.ts#L64); `tx.operation.create` [source](../../src/features/assets/application/asset.service.ts#L65); `tx.auditLog.create` [source](../../src/features/assets/application/asset.service.ts#L80).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [procurementApiError](#mapper-7044e41e93) ([source](../../src/features/procurement/application/http.ts#L13)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/procurement/delivery-items/%5Bid%5D/capitalize/route.ts#L12); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/procurement/delivery-items/%5Bid%5D/capitalize/route.ts#L14); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/procurement/delivery-items/%5Bid%5D/capitalize/route.ts#L16)

```ts
return apiData(
      await getProcurementService().capitalize(
        (await context.params).id,
        input.data,
        auth.user.id,
        auth.requestId,
        (assetInput) => AssetService.create(
          assetInput,
          auth.user.id,
          auth.requestId,
        ),
      ),
    )
```

[source](../../src/app/api/procurement/delivery-items/%5Bid%5D/capitalize/route.ts#L31); enclosing checks: `catch AND error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'`

```ts
return apiError('INVENTORY_NUMBER_EXISTS', 'Инвентарный номер уже используется', 409)
```

[source](../../src/app/api/procurement/delivery-items/%5Bid%5D/capitalize/route.ts#L33); enclosing checks: `catch`

```ts
return procurementApiError(error)
```

</details>

<a id="api-102"></a>
### API-102: GET /api/procurement/options

Источник handler: [src/app/api/procurement/options/route.ts:6](../../src/app/api/procurement/options/route.ts#L6).

- **Auth:** `authorizeApiRequest(request, 'procurement.read')` [source](../../src/app/api/procurement/options/route.ts#L7); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R070](#r070) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Projects/suppliers/approvers/groups/mols глобальны; documents включаются только с documents.read, но documentWhere не применяется.
- **Route scope predicates:** `auth.access.has('documents.read')` [source](../../src/app/api/procurement/options/route.ts#L9).
- **Calls:** [ProcurementService.options](../../src/features/procurement/application/procurement.service.ts#L226), [getProcurementService](../../src/features/procurement/application/procurement.service.ts#L646). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/procurement/options/route.ts#L8); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/procurement/options/route.ts#L9)

```ts
return apiData(await getProcurementService().options(auth.access.has('documents.read')))
```

</details>

<a id="api-103"></a>
### API-103: GET /api/procurement

Источник handler: [src/app/api/procurement/route.ts:10](../../src/app/api/procurement/route.ts#L10).

- **Auth:** `authorizeApiRequest(request, 'procurement.read')` [source](../../src/app/api/procurement/route.ts#L11); общие auth branches выше.
- **Схемы HTTP boundary:** [procurementQuerySchema](#schema-8236f07e92) ([source](../../src/features/procurement/contracts/procurement.ts#L116)).
- **Parsing:** `procurementQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))` [source](../../src/app/api/procurement/route.ts#L13).
- **Выходные формы:** [R071](#r071) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** procurement.read имеет scope none; department/project filtering access отсутствует.
- **Service scope evidence:** `combineWhere( searchWhere, query.status ? effectiveStatusWhere(query.status) : {}, )` [source](../../src/features/procurement/application/procurement.service.ts#L172); `effectiveStatusWhere(query.status)` [source](../../src/features/procurement/application/procurement.service.ts#L174); `combineWhere(summaryWhere, { status: { notIn: [ProcurementStatus.CAPITALIZED, ProcurementStatus.REJECTED, ProcurementStatus.CANCELLED] }, NOT: { status: ProcurementStatus.SUBMITTED, approvalRequest: { is: { status: { in: [ApprovalRequestStatus.REJECTED, ApprovalRequestStatus.CANCELLED] } } } }, })` [source](../../src/features/procurement/application/procurement.service.ts#L190); `combineWhere(summaryWhere, effectiveStatusWhere(ProcurementStatus.SUBMITTED))` [source](../../src/features/procurement/application/procurement.service.ts#L196); `combineWhere(summaryWhere, { contract: { is: { deliveryDueAt: { lt: now } } }, status: { notIn: [ProcurementStatus.DELIVERED, ProcurementStatus.CAPITALIZED, ProcurementStatus.REJECTED, ProcurementStatus.CANCELLED] }, NOT: { status: ProcurementStatus.SUBMITTED, approvalRequest: { is: { status: { in: [ApprovalRequestStatus.REJECTED, ApprovalRequestStatus.CANCELLED] } } } }, })` [source](../../src/features/procurement/application/procurement.service.ts#L199).
- **Calls:** [ProcurementService.list](../../src/features/procurement/application/procurement.service.ts#L159), [getProcurementService](../../src/features/procurement/application/procurement.service.ts#L646). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/procurement/route.ts#L12); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/procurement/route.ts#L14); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/procurement/route.ts#L16)

```ts
return NextResponse.json({
    data: result.requests,
    pagination: {
      page: query.data.page,
      pageSize: query.data.pageSize,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / query.data.pageSize)),
    },
    summary: result.summary,
  })
```

</details>

<a id="api-104"></a>
### API-104: POST /api/procurement

Источник handler: [src/app/api/procurement/route.ts:28](../../src/app/api/procurement/route.ts#L28).

- **Auth:** `authorizeApiRequest(request, 'procurement.create')` [source](../../src/app/api/procurement/route.ts#L29); общие auth branches выше.
- **Схемы HTTP boundary:** [createProcurementSchema](#schema-0a3c8ee903) ([source](../../src/features/procurement/contracts/procurement.ts#L40)).
- **Parsing:** `createProcurementSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/procurement/route.ts#L31); `request.json()` [source](../../src/app/api/procurement/route.ts#L31).
- **Выходные формы:** [R068](#r068) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** procurement.create scope none; ссылки проверяются на существование, не на actor resource scope.
- **Calls:** [ProcurementService.create](../../src/features/procurement/application/procurement.service.ts#L263), [getProcurementService](../../src/features/procurement/application/procurement.service.ts#L646). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** ProcurementRequest/items + audit в transaction.
- **Writes/IO evidence:** `tx.procurementRequest.create` [source](../../src/features/procurement/application/procurement.service.ts#L266); `tx.auditLog.create` [source](../../src/features/procurement/application/procurement.service.ts#L287).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [procurementApiError](#mapper-7044e41e93) ([source](../../src/features/procurement/application/http.ts#L13)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/procurement/route.ts#L30); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/procurement/route.ts#L32); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/procurement/route.ts#L34)

```ts
return apiData(
      await getProcurementService().create(input.data, auth.user.id, auth.requestId),
      { status: 201 },
    )
```

[source](../../src/app/api/procurement/route.ts#L40); enclosing checks: `catch AND error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'`

```ts
return apiError('PROCUREMENT_NUMBER_EXISTS', 'Номер заявки уже используется', 409)
```

[source](../../src/app/api/procurement/route.ts#L42); enclosing checks: `catch`

```ts
return procurementApiError(error)
```

</details>

<a id="api-105"></a>
### API-105: POST /api/procurement/suppliers

Источник handler: [src/app/api/procurement/suppliers/route.ts:8](../../src/app/api/procurement/suppliers/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'procurement.suppliers.manage')` [source](../../src/app/api/procurement/suppliers/route.ts#L9); общие auth branches выше.
- **Схемы HTTP boundary:** [supplierSchema](#schema-ecc20b73be) ([source](../../src/features/procurement/contracts/procurement.ts#L74)).
- **Parsing:** `supplierSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/procurement/suppliers/route.ts#L11); `request.json()` [source](../../src/app/api/procurement/suppliers/route.ts#L11).
- **Выходные формы:** [R072](#r072) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** procurement.suppliers.manage scope none; глобальный справочник.
- **Calls:** [ProcurementService.createSupplier](../../src/features/procurement/application/procurement.service.ts#L376), [getProcurementService](../../src/features/procurement/application/procurement.service.ts#L646). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Supplier create + audit в transaction.
- **Writes/IO evidence:** `this.db.supplier.create` [source](../../src/features/procurement/application/procurement.service.ts#L377); `this.db.auditLog.create` [source](../../src/features/procurement/application/procurement.service.ts#L631).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/procurement/suppliers/route.ts#L10); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/procurement/suppliers/route.ts#L12); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/procurement/suppliers/route.ts#L14)

```ts
return apiData(
      await getProcurementService().createSupplier(input.data, auth.user.id, auth.requestId),
      { status: 201 },
    )
```

[source](../../src/app/api/procurement/suppliers/route.ts#L20); enclosing checks: `catch AND error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'`

```ts
return apiError('SUPPLIER_TAX_ID_EXISTS', 'Поставщик с таким ИНН уже существует', 409)
```

</details>

<a id="api-106"></a>
### API-106: PATCH /api/projects/[id]/members/[memberId]

Источник handler: [src/app/api/projects/[id]/members/[memberId]/route.ts:12](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L12).

- **Auth:** `authorizeApiRequest(request, 'projectMembers.update')` [source](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L16); общие auth branches выше.
- **Схемы HTTP boundary:** [projectMemberUpdateSchema](#schema-1485fd5b1f) ([source](../../src/features/projects/contracts/project-members.ts#L7)).
- **Parsing:** `request.json()` [source](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L24); `validateRequest(projectMemberUpdateSchema, data)` [source](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L25).
- **Выходные формы:** [R039](#r039), [R073](#r073) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет projectId; service findFirst по memberId AND projectId предотвращает изменение member другого проекта.
- **Route scope predicates:** `auth.access.allows('projectMembers.update', { projectId: params.id })` [source](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L20).
- **Calls:** [ProjectMemberService.updateMember](../../src/features/projects/application/project-member.service.ts#L329), [validateRequest](../../src/lib/http/validate-request.ts#L3). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** isArchived/archivedAt; не удаляет row и не пишет audit/outbox.
- **Writes/IO evidence:** `prisma.projectMember.update` [source](../../src/features/projects/application/project-member.service.ts#L361).
- **Error maps:** [getProjectMemberErrorMeta](#mapper-40ec4c20c6) ([source](../../src/features/projects/application/project-member.service.ts#L115)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L17); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L21); enclosing checks: `!auth.access.allows('projectMembers.update', { projectId: params.id })`

```ts
return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
```

[source](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L28); enclosing checks: `!validation.success`

```ts
return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
```

[source](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L40)

```ts
return NextResponse.json({
      success: true,
      member,
    })
```

[source](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L50); enclosing checks: `catch AND routeError`

```ts
return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
```

[source](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L56); enclosing checks: `catch`

```ts
return NextResponse.json(
      { error: 'Не удалось обновить участника проекта' },
      { status: 500 }
    )
```

</details>

<a id="api-107"></a>
### API-107: GET /api/projects/[id]/members

Источник handler: [src/app/api/projects/[id]/members/route.ts:12](../../src/app/api/projects/%5Bid%5D/members/route.ts#L12).

- **Auth:** `authorizeApiRequest(request, 'projectMembers.read')` [source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L13); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R039](#r039), [R074](#r074) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет projectId по projectMembers.read; salary выдаётся только с projectPayroll.read, availableEmployees только с projectMembers.create. AvailableEmployees query не фильтруется department scopes.
- **Route scope predicates:** `auth.access.allows('projectMembers.read', { projectId: params.id })` [source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L17); `auth.access.allows('projectPayroll.read', { projectId: params.id })` [source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L23); `auth.access.allows('projectMembers.create', { projectId: params.id })` [source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L24).
- **Calls:** [ProjectMemberService.getMembers](../../src/features/projects/application/project-member.service.ts#L135). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [getProjectMemberErrorMeta](#mapper-40ec4c20c6) ([source](../../src/features/projects/application/project-member.service.ts#L115)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L14); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L18); enclosing checks: `!auth.access.allows('projectMembers.read', { projectId: params.id })`

```ts
return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
```

[source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L26)

```ts
return NextResponse.json(result)
```

[source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L33); enclosing checks: `catch AND routeError`

```ts
return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
```

[source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L39); enclosing checks: `catch`

```ts
return NextResponse.json(
      { error: 'Не удалось загрузить состав проекта' },
      { status: 500 }
    )
```

</details>

<a id="api-108"></a>
### API-108: POST /api/projects/[id]/members

Источник handler: [src/app/api/projects/[id]/members/route.ts:46](../../src/app/api/projects/%5Bid%5D/members/route.ts#L46).

- **Auth:** `authorizeApiRequest(request, 'projectMembers.create')` [source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L47); общие auth branches выше.
- **Схемы HTTP boundary:** [projectMemberCreateSchema](#schema-cfa2561536) ([source](../../src/features/projects/contracts/project-members.ts#L3)).
- **Parsing:** `request.json()` [source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L55); `validateRequest(projectMemberCreateSchema, data)` [source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L56).
- **Выходные формы:** [R039](#r039), [R073](#r073) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет projectId; выбранный employee ищется по ID globally и должен быть не DISMISSED. Повторное добавление восстанавливает/обновляет snapshot существующего member.
- **Route scope predicates:** `auth.access.allows('projectMembers.create', { projectId: params.id })` [source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L51).
- **Calls:** [ProjectMemberService.addMember](../../src/features/projects/application/project-member.service.ts#L219), [validateRequest](../../src/lib/http/validate-request.ts#L3). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Create или reactivation существующего ProjectMember, snapshot department/position/rate/salary. Audit/outbox не записываются.
- **Writes/IO evidence:** `tx.projectMember.update` [source](../../src/features/projects/application/project-member.service.ts#L263); `tx.projectMember.create` [source](../../src/features/projects/application/project-member.service.ts#L294).
- **Error maps:** [getProjectMemberErrorMeta](#mapper-40ec4c20c6) ([source](../../src/features/projects/application/project-member.service.ts#L115)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L48); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L52); enclosing checks: `!auth.access.allows('projectMembers.create', { projectId: params.id })`

```ts
return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
```

[source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L59); enclosing checks: `!validation.success`

```ts
return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
```

[source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L66)

```ts
return NextResponse.json({ success: true, member })
```

[source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L73); enclosing checks: `catch AND routeError`

```ts
return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
```

[source](../../src/app/api/projects/%5Bid%5D/members/route.ts#L79); enclosing checks: `catch`

```ts
return NextResponse.json(
      { error: 'Не удалось добавить сотрудника в проект' },
      { status: 500 }
    )
```

</details>

<a id="api-109"></a>
### API-109: GET /api/projects/[id]/payroll

Источник handler: [src/app/api/projects/[id]/payroll/route.ts:17](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L17).

- **Auth:** `authorizeApiRequest(request, 'projectPayroll.read')` [source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L18); общие auth branches выше.
- **Вход и transport:** year: parseInt(base10), default текущий локальный год, int 2000..2100. parseInt принимает префикс вроде 2026abc.
- **Query/header reads:** `request.nextUrl.searchParams.get('year')` [source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L26).
- **Выходные формы:** [R039](#r039), [R075](#r075) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route и service проверяют projectId по projectPayroll.read. Получает всех active project members и entries выбранного project; employee/finance.salary.read department scope отдельно не применяется.
- **Route scope predicates:** `auth.access.allows('projectPayroll.read', { projectId: params.id })` [source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L22).
- **Service scope evidence:** `access.allows('projectPayroll.read', { projectId })` [source](../../src/features/finance/application/project-payroll.service.ts#L128).
- **Calls:** [ProjectPayrollService.getTable](../../src/features/finance/application/project-payroll.service.ts#L123), [getCurrentYear](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L15). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [getProjectPayrollErrorMeta](#mapper-495934dbef) ([source](../../src/features/finance/application/project-payroll.service.ts#L101)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L19); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L23); enclosing checks: `!auth.access.allows('projectPayroll.read', { projectId: params.id })`

```ts
return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L30); enclosing checks: `!Number.isInteger(year) || year < 2000 || year > 2100`

```ts
return NextResponse.json(
        { error: 'Invalid payroll year' },
        { status: 400 }
      )
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L37)

```ts
return NextResponse.json(result)
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L44); enclosing checks: `catch AND routeError`

```ts
return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L50); enclosing checks: `catch`

```ts
return NextResponse.json(
      { error: 'Не удалось загрузить таблицу выплат' },
      { status: 500 }
    )
```

</details>

<a id="api-110"></a>
### API-110: PUT /api/projects/[id]/payroll

Источник handler: [src/app/api/projects/[id]/payroll/route.ts:57](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L57).

- **Auth:** `authorizeApiRequest(request, { anyOf: ['projectPayroll.create', 'projectPayroll.update'], })` [source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L58); общие auth branches выше.
- **Схемы HTTP boundary:** [projectPayrollSaveSchema](#schema-65e830dc06) ([source](../../src/features/finance/contracts/project-payroll.ts#L3)).
- **Вход и transport:** JSON projectPayrollSaveSchema; требуется active ProjectMember. okladEnabled=true берёт положительный member.salary snapshot; nadbavkaAmount отсутствует/blank→надбавки нет, иначе positive amount string comma→dot, trim, <=2 decimal places. false+blank очищает обе entries. Чтение CLOSED period без блокировки.
- **Parsing:** `request.json()` [source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L71); `validateRequest(projectPayrollSaveSchema, data)` [source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L72).
- **Выходные формы:** [R039](#r039), [R076](#r076) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route anyOf create/update на projectId; service повторно выбирает permission по наличию existing entries и проверяет только projectId, не employee/department scope.
- **Route scope predicates:** `auth.access.allows('projectPayroll.create', { projectId: params.id })` [source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L65); `auth.access.allows('projectPayroll.update', { projectId: params.id })` [source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L66).
- **Service scope evidence:** `access.allows(permission, { projectId })` [source](../../src/features/finance/application/project-payroll.service.ts#L295).
- **Calls:** [ProjectPayrollService.saveCell](../../src/features/finance/application/project-payroll.service.ts#L219), [validateRequest](../../src/lib/http/validate-request.ts#L3). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Меняет financePlanEntries и project.actualBudget, сохраняет OKLAD/NADBAVKA; ensurePayrollPeriodOpen — read-only проверка без row/advisory lock; audit не записывается.
- **Writes/IO evidence:** `tx.project.update` [source](../../src/features/finance/application/project-payroll.service.ts#L309); `tx.financePlanEntry.deleteMany` [source](../../src/features/finance/application/project-payroll.service.ts#L319); `tx.financePlanEntry.createMany` [source](../../src/features/finance/application/project-payroll.service.ts#L332); `tx.project.update` [source](../../src/features/finance/application/project-payroll.service.ts#L345).
- **Error maps:** [getProjectPayrollErrorMeta](#mapper-495934dbef) ([source](../../src/features/finance/application/project-payroll.service.ts#L101)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L61); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L68); enclosing checks: `!auth.access.allows('projectPayroll.create', { projectId: params.id }) && !auth.access.allows('projectPayroll.update', { projectId: params.id })`

```ts
return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L75); enclosing checks: `!validation.success`

```ts
return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L83)

```ts
return NextResponse.json({
      success: true,
      cell: result.cell,
    })
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L91); enclosing checks: `catch AND error instanceof AuthorizationError`

```ts
return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L96); enclosing checks: `catch AND routeError`

```ts
return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L102); enclosing checks: `catch`

```ts
return NextResponse.json(
      { error: 'Не удалось сохранить начисление' },
      { status: 500 }
    )
```

</details>

<a id="api-111"></a>
### API-111: DELETE /api/projects/[id]/payroll

Источник handler: [src/app/api/projects/[id]/payroll/route.ts:109](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L109).

- **Auth:** `authorizeApiRequest(request, 'projectPayroll.delete')` [source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L110); общие auth branches выше.
- **Схемы HTTP boundary:** [projectPayrollDeleteSchema](#schema-277a06d382) ([source](../../src/features/finance/contracts/project-payroll.ts#L11)).
- **Parsing:** `request.json()` [source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L118); `validateRequest(projectPayrollDeleteSchema, data)` [source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L119).
- **Выходные формы:** [R039](#r039), [R042](#r042) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет projectId; service проверяет свои resource scopes. AuthorizationError внутри service не имеет отдельного catch и становится generic 500 этого route.
- **Route scope predicates:** `auth.access.allows('projectPayroll.delete', { projectId: params.id })` [source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L114).
- **Service scope evidence:** `access.allows('projectPayroll.delete', { projectId })` [source](../../src/features/finance/application/project-payroll.service.ts#L383).
- **Calls:** [ProjectPayrollService.clearCell](../../src/features/finance/application/project-payroll.service.ts#L361), [validateRequest](../../src/lib/http/validate-request.ts#L3). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Удаляет entries текущего project и уменьшает actualBudget; ensurePayrollPeriodOpen — read-only проверка без row/advisory lock; audit не записывается.
- **Writes/IO evidence:** `tx.project.update` [source](../../src/features/finance/application/project-payroll.service.ts#L390); `tx.financePlanEntry.deleteMany` [source](../../src/features/finance/application/project-payroll.service.ts#L400).
- **Error maps:** [getProjectPayrollErrorMeta](#mapper-495934dbef) ([source](../../src/features/finance/application/project-payroll.service.ts#L101)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L111); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L115); enclosing checks: `!auth.access.allows('projectPayroll.delete', { projectId: params.id })`

```ts
return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L122); enclosing checks: `!validation.success`

```ts
return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L130)

```ts
return NextResponse.json({ success: true })
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L137); enclosing checks: `catch AND routeError`

```ts
return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
```

[source](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L143); enclosing checks: `catch`

```ts
return NextResponse.json(
      { error: 'Не удалось очистить начисление' },
      { status: 500 }
    )
```

</details>

<a id="api-112"></a>
### API-112: GET /api/projects/[id]

Источник handler: [src/app/api/projects/[id]/route.ts:7](../../src/app/api/projects/%5Bid%5D/route.ts#L7).

- **Auth:** `authorizeApiRequest(request, 'projects.read')` [source](../../src/app/api/projects/%5Bid%5D/route.ts#L8); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R077](#r077) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** projectWhere(projects.read); tasksList/assets очищаются и counts обнуляются без соответствующих scoped permissions.
- **Route scope predicates:** `auth.access.allows('projects.read', { projectId: id })` [source](../../src/app/api/projects/%5Bid%5D/route.ts#L11).
- **Service scope evidence:** `access.projectWhere('projects.read')` [source](../../src/features/projects/application/project.service.ts#L86); `access.allows('tasks.read', { projectId: id })` [source](../../src/features/projects/application/project.service.ts#L95); `access.allows('assets.read', { projectId: id })` [source](../../src/features/projects/application/project.service.ts#L99).
- **Calls:** [ProjectService.getForApi](../../src/features/projects/application/project.service.ts#L83). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/projects/%5Bid%5D/route.ts#L9); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/projects/%5Bid%5D/route.ts#L12); enclosing checks: `!auth.access.allows('projects.read', { projectId: id })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/projects/%5Bid%5D/route.ts#L15)

```ts
return project ? apiData(project) : apiError('PROJECT_NOT_FOUND', 'Проект не найден', 404)
```

</details>

<a id="api-113"></a>
### API-113: PUT /api/projects/[id]

Источник handler: [src/app/api/projects/[id]/route.ts:18](../../src/app/api/projects/%5Bid%5D/route.ts#L18).

- **Auth:** `authorizeApiRequest(request, 'projects.update')` [source](../../src/app/api/projects/%5Bid%5D/route.ts#L19); общие auth branches выше.
- **Схемы HTTP boundary:** [createProjectSchema](#schema-c3af2619f1) ([source](../../src/features/projects/contracts/project.ts#L3)).
- **Parsing:** `createProjectSchema.safeParse(await request.json())` [source](../../src/app/api/projects/%5Bid%5D/route.ts#L25); `request.json()` [source](../../src/app/api/projects/%5Bid%5D/route.ts#L25).
- **Выходные формы:** [R078](#r078) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет projectId по projects.update; service не принимает AccessContext.
- **Route scope predicates:** `auth.access.allows('projects.update', { projectId: id })` [source](../../src/app/api/projects/%5Bid%5D/route.ts#L22).
- **Calls:** [ProjectService.update](../../src/features/projects/application/project.service.ts#L232). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Project update + audit; templateId при update не создаёт новый template task set.
- **Writes/IO evidence:** `tx.project.update` [source](../../src/features/projects/application/project.service.ts#L236); `tx.auditLog.create` [source](../../src/features/projects/application/project.service.ts#L237).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/projects/%5Bid%5D/route.ts#L20); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/projects/%5Bid%5D/route.ts#L23); enclosing checks: `!auth.access.allows('projects.update', { projectId: id })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/projects/%5Bid%5D/route.ts#L26); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/projects/%5Bid%5D/route.ts#L28)

```ts
return apiData(await ProjectService.update(id, input.data, auth.user.id, auth.requestId))
```

[source](../../src/app/api/projects/%5Bid%5D/route.ts#L30); enclosing checks: `catch AND error instanceof ProjectServiceError`

```ts
return apiError(error.code, 'Проект не найден', 404)
```

</details>

<a id="api-114"></a>
### API-114: DELETE /api/projects/[id]

Источник handler: [src/app/api/projects/[id]/route.ts:35](../../src/app/api/projects/%5Bid%5D/route.ts#L35).

- **Auth:** `authorizeApiRequest(request, 'projects.delete')` [source](../../src/app/api/projects/%5Bid%5D/route.ts#L36); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R030](#r030) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет projectId по projects.delete; service не принимает AccessContext.
- **Route scope predicates:** `auth.access.allows('projects.delete', { projectId: id })` [source](../../src/app/api/projects/%5Bid%5D/route.ts#L39).
- **Calls:** [ProjectService.delete](../../src/features/projects/application/project.service.ts#L250). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Физическое удаление project и audit; связанные rows зависят от FK/onDelete.
- **Writes/IO evidence:** `tx.project.delete` [source](../../src/features/projects/application/project.service.ts#L254); `tx.auditLog.create` [source](../../src/features/projects/application/project.service.ts#L255).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/projects/%5Bid%5D/route.ts#L37); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/projects/%5Bid%5D/route.ts#L40); enclosing checks: `!auth.access.allows('projects.delete', { projectId: id })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/projects/%5Bid%5D/route.ts#L43)

```ts
return apiData(await ProjectService.delete(id, auth.user.id, auth.requestId))
```

[source](../../src/app/api/projects/%5Bid%5D/route.ts#L45); enclosing checks: `catch AND error instanceof ProjectServiceError`

```ts
return apiError(error.code, 'Проект не найден', 404)
```

</details>

<a id="api-115"></a>
### API-115: GET /api/projects/[id]/tasks

Источник handler: [src/app/api/projects/[id]/tasks/route.ts:7](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L7).

- **Auth:** `authorizeApiRequest(request, 'tasks.read')` [source](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L8); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R079](#r079) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет projectId по tasks.read; service фильтрует по projectId.
- **Route scope predicates:** `auth.access.allows('tasks.read', { projectId })` [source](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L11).
- **Calls:** [TaskService.list](../../src/features/projects/application/task.service.ts#L92). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L9); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L12); enclosing checks: `!auth.access.allows('tasks.read', { projectId })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L14)

```ts
return apiData(await TaskService.list(projectId))
```

</details>

<a id="api-116"></a>
### API-116: POST /api/projects/[id]/tasks

Источник handler: [src/app/api/projects/[id]/tasks/route.ts:17](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L17).

- **Auth:** `authorizeApiRequest(request, 'tasks.create')` [source](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L18); общие auth branches выше.
- **Схемы HTTP boundary:** [createTaskSchema](#schema-477ad46873) ([source](../../src/features/projects/contracts/task.ts#L22)).
- **Parsing:** `createTaskSchema.safeParse(await request.json())` [source](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L24); `request.json()` [source](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L24).
- **Выходные формы:** [R080](#r080) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет projectId по tasks.create; связи assignees/predecessors/parent валидируются внутри service.
- **Route scope predicates:** `auth.access.allows('tasks.create', { projectId })` [source](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L21).
- **Calls:** [TaskService.create](../../src/features/projects/application/task.service.ts#L99). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Task + assignees/dependencies/checklist и audit в transaction.
- **Writes/IO evidence:** `tx.task.create` [source](../../src/features/projects/application/task.service.ts#L115); `tx.auditLog.create` [source](../../src/features/projects/application/task.service.ts#L144); `visiting.delete` [source](../../src/features/projects/domain/task-rules.ts#L31).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L19); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L22); enclosing checks: `!auth.access.allows('tasks.create', { projectId })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L25); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L27)

```ts
return apiData(
      await TaskService.create(projectId, input.data, auth.user.id, auth.requestId),
      { status: 201 },
    )
```

[source](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L32); enclosing checks: `catch AND error instanceof TaskServiceError`

```ts
return apiError(error.code, error.message, 422)
```

</details>

<a id="api-117"></a>
### API-117: GET /api/projects

Источник handler: [src/app/api/projects/route.ts:14](../../src/app/api/projects/route.ts#L14).

- **Auth:** `authorizeApiRequest(request, 'projects.read')` [source](../../src/app/api/projects/route.ts#L15); общие auth branches выше.
- **Схемы HTTP boundary:** [querySchema](#schema-01ff8ae0de) ([source](../../src/app/api/projects/route.ts#L8)).
- **Вход и transport:** Query limit→pageSize; итоговый query parsed локальной схемой.
- **Parsing:** `querySchema.safeParse(raw)` [source](../../src/app/api/projects/route.ts#L19).
- **Выходные формы:** [R081](#r081) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Pagination extras:** runtime apiList сохраняет `{"status": {"type": "ACTIVE|COMPLETED|ARCHIVED", "optional": true}}` из spread query.data; см. return ниже.
- **Resource scope:** projectWhere(projects.read); связанные counts tasks/assets обнуляются без соответствующих scoped permissions.
- **Service scope evidence:** `access.projectWhere('projects.read')` [source](../../src/features/projects/application/project.service.ts#L37); `access.allows('tasks.read', { projectId: project.id })` [source](../../src/features/projects/application/project.service.ts#L48); `access.allows('assets.read', { projectId: project.id })` [source](../../src/features/projects/application/project.service.ts#L51).
- **Calls:** [ProjectService.list](../../src/features/projects/application/project.service.ts#L30). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/projects/route.ts#L16); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/projects/route.ts#L20); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/projects/route.ts#L22)

```ts
return apiList(result.projects, { ...query.data, total: result.total })
```

</details>

<a id="api-118"></a>
### API-118: POST /api/projects

Источник handler: [src/app/api/projects/route.ts:25](../../src/app/api/projects/route.ts#L25).

- **Auth:** `authorizeApiRequest(request, 'projects.create')` [source](../../src/app/api/projects/route.ts#L26); общие auth branches выше.
- **Схемы HTTP boundary:** [createProjectSchema](#schema-c3af2619f1) ([source](../../src/features/projects/contracts/project.ts#L3)).
- **Parsing:** `createProjectSchema.safeParse(await request.json())` [source](../../src/app/api/projects/route.ts#L28); `request.json()` [source](../../src/app/api/projects/route.ts#L28).
- **Выходные формы:** [R078](#r078) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** projects.create имеет scope none; созданный проект может получить assignment для actor в service.
- **Service scope evidence:** `tx.userProjectScope.createMany({ data: scopedAssignments.map((grant) => ({ roleAssignmentId: grant.assignmentId, projectId: project.id, })), skipDuplicates: true, })` [source](../../src/features/projects/application/project.service.ts#L208).
- **Calls:** [ProjectService.create](../../src/features/projects/application/project.service.ts#L162). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Project + audit; по templateId defaults/tasks/dependencies; может выдать actor scoped project assignment.
- **Writes/IO evidence:** `tx.project.create` [source](../../src/features/projects/application/project.service.ts#L170); `tx.task.create` [source](../../src/features/projects/application/project.service.ts#L180); `tx.taskDependency.createMany` [source](../../src/features/projects/application/project.service.ts#L195); `tx.userProjectScope.createMany` [source](../../src/features/projects/application/project.service.ts#L208); `tx.auditLog.create` [source](../../src/features/projects/application/project.service.ts#L216).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/projects/route.ts#L27); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/projects/route.ts#L29); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/projects/route.ts#L31)

```ts
return apiData(await ProjectService.create(input.data, auth.user.id, auth.requestId, auth.access), { status: 201 })
```

[source](../../src/app/api/projects/route.ts#L33); enclosing checks: `catch AND error instanceof ProjectServiceError`

```ts
return apiError(error.code, 'Проект с таким кодом уже существует', 409)
```

</details>

<a id="api-119"></a>
### API-119: POST /api/reports/custom

Источник handler: [src/app/api/reports/custom/route.ts:16](../../src/app/api/reports/custom/route.ts#L16).

- **Auth:** `authorizeApiRequest(request, 'reports.read')` [source](../../src/app/api/reports/custom/route.ts#L17); общие auth branches выше.
- **Схемы HTTP boundary:** [reportPresetSchema](#schema-c5db04403d) ([source](../../src/features/reporting/contracts/report-presets.ts#L14)), [querySchema](#schema-1a4a5a6a6d) ([source](../../src/app/api/reports/custom/route.ts#L9)).
- **Вход и transport:** JSON {preset: reportPresetSchema,query: querySchema}; valid group metrics и permissions отдельными branches. query dates проверяют лишь regex, dateFrom<=dateTo не проверяется.
- **Parsing:** `request.json()` [source](../../src/app/api/reports/custom/route.ts#L21); `reportPresetSchema.safeParse(body.preset)` [source](../../src/app/api/reports/custom/route.ts#L22); `querySchema.safeParse(body.query)` [source](../../src/app/api/reports/custom/route.ts#L25).
- **Выходные формы:** [R082](#r082), [R083](#r083), [R039](#r039) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Дополнительные permissions зависят от group/metrics; service применяет department/project/employee/asset/finance filters по каждой выборке.
- **Route scope predicates:** `auth.access.has(permission)` [source](../../src/app/api/reports/custom/route.ts#L51).
- **Service scope evidence:** `access.departmentWhere('departments.read')` [source](../../src/features/reporting/application/report.service.ts#L371); `access.employeeWhere('employees.read')` [source](../../src/features/reporting/application/report.service.ts#L380); `access.assetWhere('assets.read')` [source](../../src/features/reporting/application/report.service.ts#L394); `access.employeeWhere('finance.salary.read')` [source](../../src/features/reporting/application/report.service.ts#L411); `access.projectWhere('projects.read')` [source](../../src/features/reporting/application/report.service.ts#L461); `access.financeEntryWhere('finance.salary.read')` [source](../../src/features/reporting/application/report.service.ts#L467); `access.assetWhere('assets.read')` [source](../../src/features/reporting/application/report.service.ts#L474).
- **Calls:** [ReportService.getCustomReport](../../src/features/reporting/application/report.service.ts#L355). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/reports/custom/route.ts#L18); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/reports/custom/route.ts#L23); enclosing checks: `!presetParsed.success`

```ts
return apiValidationError(presetParsed.error)
```

[source](../../src/app/api/reports/custom/route.ts#L26); enclosing checks: `!queryParsed.success`

```ts
return apiValidationError(queryParsed.error)
```

[source](../../src/app/api/reports/custom/route.ts#L29); enclosing checks: `!presetParsed.data.groupBy`

```ts
return NextResponse.json({
        error: { code: 'INVALID_GROUP', message: 'Выберите группировку отчёта' },
      }, { status: 400 })
```

[source](../../src/app/api/reports/custom/route.ts#L38); enclosing checks: `presetParsed.data.metrics.some((metric) => !validMetrics.has(metric))`

```ts
return NextResponse.json({
        error: { code: 'INVALID_METRIC', message: 'Показатель недоступен для выбранной группировки' },
      }, { status: 400 })
```

[source](../../src/app/api/reports/custom/route.ts#L52); enclosing checks: `[...requiredPermissions].some((permission) => !auth.access.has(permission))`

```ts
return NextResponse.json({
        error: { code: 'FORBIDDEN', message: 'Недостаточно прав для выбранных показателей' },
      }, { status: 403 })
```

[source](../../src/app/api/reports/custom/route.ts#L69)

```ts
return NextResponse.json(data)
```

[source](../../src/app/api/reports/custom/route.ts#L71); enclosing checks: `catch`

```ts
return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
```

</details>

<a id="api-120"></a>
### API-120: GET /api/reports/depreciation

Источник handler: [src/app/api/reports/depreciation/route.ts:13](../../src/app/api/reports/depreciation/route.ts#L13).

- **Auth:** `authorizeApiRequest(request, { allOf: ['reports.read', 'assets.read'] })` [source](../../src/app/api/reports/depreciation/route.ts#L14); общие auth branches выше.
- **Схемы HTTP boundary:** [querySchema](#schema-0c1e9cf445) ([source](../../src/app/api/reports/depreciation/route.ts#L7)).
- **Parsing:** `querySchema.safeParse(searchParams)` [source](../../src/app/api/reports/depreciation/route.ts#L18).
- **Выходные формы:** [R084](#r084) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** assetWhere(assets.read); movements выдаются только с operations.read и фильтруются через assetWhere(operations.read).
- **Service scope evidence:** `access.assetWhere('assets.read')` [source](../../src/features/reporting/application/report.service.ts#L189); `access.has('operations.read')` [source](../../src/features/reporting/application/report.service.ts#L245); `access.assetWhere('operations.read')` [source](../../src/features/reporting/application/report.service.ts#L252).
- **Calls:** [ReportService.getAssetDepreciationReport](../../src/features/reporting/application/report.service.ts#L177). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/reports/depreciation/route.ts#L15); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/reports/depreciation/route.ts#L19); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/reports/depreciation/route.ts#L31)

```ts
return NextResponse.json(data)
```

</details>

<a id="api-121"></a>
### API-121: GET /api/reports/export

Источник handler: [src/app/api/reports/export/route.ts:24](../../src/app/api/reports/export/route.ts#L24).

- **Auth:** `authorizeApiRequest(request, 'reports.export')` [source](../../src/app/api/reports/export/route.ts#L25); общие auth branches выше.
- **Схемы HTTP boundary:** [dashboardQuerySchema](#schema-b84db7227c) ([source](../../src/features/reporting/contracts/dashboard.ts#L5)).
- **Parsing:** `dashboardQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))` [source](../../src/app/api/reports/export/route.ts#L27).
- **Binary/headers:** 200 buffered XLSX, consilium-report-dateFrom-dateTo.xlsx; cache-control no-store. После rendering route прямо пишет audit REPORT_EXPORT; затем ответ.
- **Resource scope:** Permission-aware overview: employees.read либо finance.salary.read как employee permission; project/asset/department scopes и has checks по разделам. reports.export сам не открывает все разделы.
- **Service scope evidence:** `selectedPermission(access)` [source](../../src/features/reporting/application/dashboard.service.ts#L54); `access.projectWhere('projects.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L55); `access.employeeWhere(employeePermission)` [source](../../src/features/reporting/application/dashboard.service.ts#L57); `access.assetWhere('assets.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L59); `access.has('vacations.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L90); `access.has('projects.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L91); `access.has('tasks.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L92); `access.has('assets.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L93); `access.has('finance.salary.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L94); `access.has('staffSchedule.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L95); `access.has('departments.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L111); `access.departmentWhere('departments.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L115); `access.departmentWhere('departments.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L161); `access.has('operations.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L236); `access.has('personnelActions.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L252); `access.has('auditLogs.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L268); `employees .filter((employee) => access.has('employees.read') && employee.contractEndDate && employee.contractEndDate >= today && employee.contractEndDate <= contractHorizon ) .map((employee) => ({ id: employee.id, code: employee.code, employee: employee.fullName, department: employee.department, position: employee.staffSchedule?.position || '—', contractEndDate: employee.contractEndDate!, daysLeft: Math.ceil((employee.contractEndDate!.getTime() - today.getTime()) / DAY), })) .sort((left, right) => left.contractEndDate.getTime() - right.contractEndDate.getTime())` [source](../../src/features/reporting/application/dashboard.service.ts#L354); `access.has('employees.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L355); `access.has('auditLogs.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L434); `access.has('employees.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L37); `access.has('finance.salary.read')` [source](../../src/features/reporting/application/dashboard.service.ts#L38).
- **Calls:** [DashboardService.getOverview](../../src/features/reporting/application/dashboard.service.ts#L43), [styleSheet](../../src/app/api/reports/export/route.ts#L13), [getDb](../../src/lib/prisma.ts#L9). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Прямой DB в route:** `await getDb().auditLog.create({` [source](../../src/app/api/reports/export/route.ts#L152).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/reports/export/route.ts#L26); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/reports/export/route.ts#L28); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/reports/export/route.ts#L167)

```ts
return new Response(buffer as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="consilium-report-${query.data.dateFrom}-${query.data.dateTo}.xlsx"`,
      'cache-control': 'no-store',
    },
  })
```

</details>

<a id="api-122"></a>
### API-122: GET /api/reports/presets

Источник handler: [src/app/api/reports/presets/route.ts:7](../../src/app/api/reports/presets/route.ts#L7).

- **Auth:** `authorizeApiRequest(request, 'reports.read')` [source](../../src/app/api/reports/presets/route.ts#L8); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R085](#r085) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** userId=actor.
- **Calls:** [ReportService.listPresets](../../src/features/reporting/application/report.service.ts#L326). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/reports/presets/route.ts#L9); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/reports/presets/route.ts#L12)

```ts
return NextResponse.json(presets)
```

</details>

<a id="api-123"></a>
### API-123: POST /api/reports/presets

Источник handler: [src/app/api/reports/presets/route.ts:15](../../src/app/api/reports/presets/route.ts#L15).

- **Auth:** `authorizeApiRequest(request, 'reports.read')` [source](../../src/app/api/reports/presets/route.ts#L16); общие auth branches выше.
- **Схемы HTTP boundary:** [reportPresetSchema](#schema-c5db04403d) ([source](../../src/features/reporting/contracts/report-presets.ts#L14)).
- **Parsing:** `request.json()` [source](../../src/app/api/reports/presets/route.ts#L20); `reportPresetSchema.safeParse(body)` [source](../../src/app/api/reports/presets/route.ts#L21).
- **Выходные формы:** [R086](#r086), [R039](#r039) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** userId=actor; preset хранится отдельно от permissions на execution custom report.
- **Calls:** [ReportService.savePreset](../../src/features/reporting/application/report.service.ts#L334). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Создаёт собственный ReportPreset; audit/outbox отсутствуют.
- **Writes/IO evidence:** `db.reportPreset.create` [source](../../src/features/reporting/application/report.service.ts#L336).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/reports/presets/route.ts#L17); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/reports/presets/route.ts#L22); enclosing checks: `!parsed.success`

```ts
return apiValidationError(parsed.error)
```

[source](../../src/app/api/reports/presets/route.ts#L25)

```ts
return NextResponse.json(saved, { status: 201 })
```

[source](../../src/app/api/reports/presets/route.ts#L27); enclosing checks: `catch`

```ts
return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
```

</details>

<a id="api-124"></a>
### API-124: DELETE /api/reports/presets

Источник handler: [src/app/api/reports/presets/route.ts:31](../../src/app/api/reports/presets/route.ts#L31).

- **Auth:** `authorizeApiRequest(request, 'reports.read')` [source](../../src/app/api/reports/presets/route.ts#L32); общие auth branches выше.
- **Вход и transport:** Query id обязателен непустой; body отсутствует; несуществующий/чужой id всё равно 204.
- **Query/header reads:** `request.nextUrl.searchParams.get('id')` [source](../../src/app/api/reports/presets/route.ts#L35).
- **Выходные формы:** [R039](#r039) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** id AND userId=actor; route всегда 204 даже при отсутствующем/чужом ID.
- **Calls:** [ReportService.deletePreset](../../src/features/reporting/application/report.service.ts#L347). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Удаляет свой ReportPreset через deleteMany; audit/outbox отсутствуют.
- **Writes/IO evidence:** `db.reportPreset.delete` [source](../../src/features/reporting/application/report.service.ts#L349).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/reports/presets/route.ts#L33); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/reports/presets/route.ts#L37); enclosing checks: `!id`

```ts
return NextResponse.json({ error: 'Preset ID is required' }, { status: 400 })
```

[source](../../src/app/api/reports/presets/route.ts#L41)

```ts
return new Response(null, { status: 204 })
```

</details>

<a id="api-125"></a>
### API-125: GET /api/reports/profitability

Источник handler: [src/app/api/reports/profitability/route.ts:13](../../src/app/api/reports/profitability/route.ts#L13).

- **Auth:** `authorizeApiRequest(request, { allOf: ['reports.read', 'projects.read', 'projectPayroll.read', 'finance.salary.read'], })` [source](../../src/app/api/reports/profitability/route.ts#L14); общие auth branches выше.
- **Схемы HTTP boundary:** [querySchema](#schema-38bfb9013e) ([source](../../src/app/api/reports/profitability/route.ts#L7)).
- **Parsing:** `querySchema.safeParse(searchParams)` [source](../../src/app/api/reports/profitability/route.ts#L20).
- **Выходные формы:** [R087](#r087) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Пересечение projectWhere(projects.read) и projectWhere(projectPayroll.read); entries financeEntryWhere(finance.salary.read).
- **Service scope evidence:** `access.projectWhere('projects.read')` [source](../../src/features/reporting/application/report.service.ts#L107); `access.projectWhere('projectPayroll.read')` [source](../../src/features/reporting/application/report.service.ts#L108); `access.financeEntryWhere('finance.salary.read')` [source](../../src/features/reporting/application/report.service.ts#L121).
- **Calls:** [ReportService.getProjectProfitability](../../src/features/reporting/application/report.service.ts#L96). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/reports/profitability/route.ts#L17); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/reports/profitability/route.ts#L21); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/reports/profitability/route.ts#L33)

```ts
return NextResponse.json(data)
```

</details>

<a id="api-126"></a>
### API-126: GET /api/reports/turnover

Источник handler: [src/app/api/reports/turnover/route.ts:13](../../src/app/api/reports/turnover/route.ts#L13).

- **Auth:** `authorizeApiRequest(request, { allOf: ['reports.read', 'employees.read', 'personnelActions.read'], })` [source](../../src/app/api/reports/turnover/route.ts#L14); общие auth branches выше.
- **Схемы HTTP boundary:** [querySchema](#schema-8a3008dcdb) ([source](../../src/app/api/reports/turnover/route.ts#L7)).
- **Parsing:** `querySchema.safeParse(searchParams)` [source](../../src/app/api/reports/turnover/route.ts#L20).
- **Выходные формы:** [R088](#r088) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** employeeWhere(employees.read) и employeeWhere(personnelActions.read) применяются раздельно к headcount/action выборкам.
- **Service scope evidence:** `access.employeeWhere('employees.read')` [source](../../src/features/reporting/application/report.service.ts#L16); `access.employeeWhere('personnelActions.read')` [source](../../src/features/reporting/application/report.service.ts#L17).
- **Calls:** [ReportService.getTurnoverReport](../../src/features/reporting/application/report.service.ts#L9). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/reports/turnover/route.ts#L17); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/reports/turnover/route.ts#L21); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/reports/turnover/route.ts#L33)

```ts
return NextResponse.json(data)
```

</details>

<a id="api-127"></a>
### API-127: GET /api/reports/vacations

Источник handler: [src/app/api/reports/vacations/route.ts:13](../../src/app/api/reports/vacations/route.ts#L13).

- **Auth:** `authorizeApiRequest(request, { allOf: ['reports.read', 'vacations.read'] })` [source](../../src/app/api/reports/vacations/route.ts#L14); общие auth branches выше.
- **Схемы HTTP boundary:** [querySchema](#schema-04014003c4) ([source](../../src/app/api/reports/vacations/route.ts#L7)).
- **Parsing:** `querySchema.safeParse(searchParams)` [source](../../src/app/api/reports/vacations/route.ts#L18).
- **Выходные формы:** [R089](#r089) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** employeeWhere(vacations.read) на employee relation.
- **Service scope evidence:** `access.employeeWhere('vacations.read')` [source](../../src/features/reporting/application/report.service.ts#L299).
- **Calls:** [ReportService.getVacationCalendar](../../src/features/reporting/application/report.service.ts#L287). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/reports/vacations/route.ts#L15); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/reports/vacations/route.ts#L19); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/reports/vacations/route.ts#L31)

```ts
return NextResponse.json(data)
```

</details>

<a id="api-128"></a>
### API-128: GET /api/search

Источник handler: [src/app/api/search/route.ts:7](../../src/app/api/search/route.ts#L7).

- **Auth:** `authorizeApiRequest(request, { anyOf: GLOBAL_SEARCH_PERMISSIONS })` [source](../../src/app/api/search/route.ts#L8); общие auth branches выше.
- **Схемы HTTP boundary:** [globalSearchQuerySchema](#schema-2ff1e8c68e) ([source](../../src/features/search/contracts/search.ts#L12)).
- **Parsing:** `globalSearchQuerySchema.safeParse({ q: request.nextUrl.searchParams.get('q') })` [source](../../src/app/api/search/route.ts#L11).
- **Query/header reads:** `request.nextUrl.searchParams.get('q')` [source](../../src/app/api/search/route.ts#L11).
- **Выходные формы:** [R090](#r090) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Отдельная проверка has permission и scope filter для каждой employee/asset/project/task/document категории; максимум 5 на категорию.
- **Service scope evidence:** `access.has('employees.read')` [source](../../src/features/search/application/global-search.service.ts#L15); `access.employeeWhere('employees.read')` [source](../../src/features/search/application/global-search.service.ts#L20); `access.has('assets.read')` [source](../../src/features/search/application/global-search.service.ts#L29); `access.assetWhere('assets.read')` [source](../../src/features/search/application/global-search.service.ts#L34); `access.has('projects.read')` [source](../../src/features/search/application/global-search.service.ts#L43); `access.projectWhere('projects.read')` [source](../../src/features/search/application/global-search.service.ts#L47); `access.has('tasks.read')` [source](../../src/features/search/application/global-search.service.ts#L56); `access.projectWhere('tasks.read')` [source](../../src/features/search/application/global-search.service.ts#L60); `access.has('documents.read')` [source](../../src/features/search/application/global-search.service.ts#L75); `access.documentWhere('documents.read')` [source](../../src/features/search/application/global-search.service.ts#L80).
- **Calls:** [GlobalSearchService.search](../../src/features/search/application/global-search.service.ts#L11). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/search/route.ts#L9); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/search/route.ts#L12); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/search/route.ts#L13)

```ts
return apiData(await GlobalSearchService.search(query.data.q, auth.access))
```

</details>

<a id="api-129"></a>
### API-129: PUT /api/staff-schedule/[id]

Источник handler: [src/app/api/staff-schedule/[id]/route.ts:20](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L20).

- **Auth:** `authorizeApiRequest(request, 'staffSchedule.update')` [source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L21); общие auth branches выше.
- **Схемы HTTP boundary:** [createStaffScheduleSchema](#schema-554fd88c9f) ([source](../../src/features/employees/contracts/schemas.ts#L19)).
- **Parsing:** `createStaffScheduleSchema.safeParse(await request.json())` [source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L23); `request.json()` [source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L23).
- **Выходные формы:** [R091](#r091) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет current и destination departments по staffSchedule.update.
- **Route scope predicates:** `staffPositionTarget(id)` [source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L27); `departmentForReference(input.data)` [source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L28); `auth.access.allows('staffSchedule.update', { departmentIds: [ ...(currentTarget.departmentId ? [currentTarget.departmentId] : []), ...(nextDepartmentId ? [nextDepartmentId] : []), ], })` [source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L30).
- **Calls:** [WorkforceService.updatePosition](../../src/features/employees/application/workforce.service.ts#L130). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Organization mutation lock; StaffSchedule update + audit, rate>=occupied и department transfer rules.
- **Writes/IO evidence:** `tx.staffSchedule.update` [source](../../src/features/employees/application/workforce.service.ts#L142); `tx.auditLog.create` [source](../../src/features/employees/application/workforce.service.ts#L152).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [mapError](#mapper-8ec90f8ee5) ([source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L12)), [getDepartmentReferenceErrorMeta](#mapper-6cf752dd03) ([source](../../src/lib/organization/department-reference.ts#L20)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L22); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L24); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L35); enclosing checks: `currentTarget && !auth.access.allows('staffSchedule.update', { departmentIds: [ ...(currentTarget.departmentId ? [currentTarget.departmentId] : []), ...(nextDepartmentId ? [nextDepartmentId] : []), ], })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L37)

```ts
return apiData(await WorkforceService.updatePosition(id, input.data, auth.user.id, auth.requestId))
```

[source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L39); enclosing checks: `catch AND error instanceof WorkforceServiceError`

```ts
return mapError(error)
```

[source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L42); enclosing checks: `catch AND error instanceof DepartmentReferenceError`

```ts
return apiError(error.code, meta.message, meta.status)
```

[Local error mapping source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L12)

```ts
const mapError = (error: WorkforceServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'Должность не найдена', 404)
  : error.code === 'POSITION_DEPARTMENT_CHANGE_IN_USE'
    ? apiError(error.code, 'Нельзя изменить подразделение должности с назначенными сотрудниками', 409)
  : apiError(error.code, error.code === 'POSITION_IN_USE'
    ? 'Нельзя удалить должность с назначенными сотрудниками'
    : 'Нельзя уменьшить количество ставок ниже занятого значения', 409)
```

</details>

<a id="api-130"></a>
### API-130: DELETE /api/staff-schedule/[id]

Источник handler: [src/app/api/staff-schedule/[id]/route.ts:48](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L48).

- **Auth:** `authorizeApiRequest(request, 'staffSchedule.delete')` [source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L49); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R030](#r030) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет department текущей позиции; service запрещает удаление при employees.
- **Route scope predicates:** `staffPositionTarget(id)` [source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L52); `auth.access.allows('staffSchedule.delete', target)` [source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L53).
- **Calls:** [WorkforceService.deletePosition](../../src/features/employees/application/workforce.service.ts#L177). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Organization mutation lock; отвязывает DISMISSED employees, StaffSchedule delete + audit; активные employees запрещают delete.
- **Writes/IO evidence:** `tx.employee.updateMany` [source](../../src/features/employees/application/workforce.service.ts#L184); `tx.staffSchedule.delete` [source](../../src/features/employees/application/workforce.service.ts#L185); `tx.auditLog.create` [source](../../src/features/employees/application/workforce.service.ts#L186).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [mapError](#mapper-8ec90f8ee5) ([source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L12)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L50); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L54); enclosing checks: `target && !auth.access.allows('staffSchedule.delete', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L57)

```ts
return apiData(await WorkforceService.deletePosition(id, auth.user.id, auth.requestId))
```

[source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L59); enclosing checks: `catch AND error instanceof WorkforceServiceError`

```ts
return mapError(error)
```

[Local error mapping source](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L12)

```ts
const mapError = (error: WorkforceServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'Должность не найдена', 404)
  : error.code === 'POSITION_DEPARTMENT_CHANGE_IN_USE'
    ? apiError(error.code, 'Нельзя изменить подразделение должности с назначенными сотрудниками', 409)
  : apiError(error.code, error.code === 'POSITION_IN_USE'
    ? 'Нельзя удалить должность с назначенными сотрудниками'
    : 'Нельзя уменьшить количество ставок ниже занятого значения', 409)
```

</details>

<a id="api-131"></a>
### API-131: GET /api/staff-schedule

Источник handler: [src/app/api/staff-schedule/route.ts:17](../../src/app/api/staff-schedule/route.ts#L17).

- **Auth:** `authorizeApiRequest(request, 'staffSchedule.read')` [source](../../src/app/api/staff-schedule/route.ts#L18); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R092](#r092) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** allowedDepartmentIds(staffSchedule.read) ограничивает штатные позиции.
- **Calls:** [WorkforceService.listPositions](../../src/features/employees/application/workforce.service.ts#L82). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/staff-schedule/route.ts#L19); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/staff-schedule/route.ts#L20)

```ts
return apiData(await WorkforceService.listPositions(auth.access))
```

</details>

<a id="api-132"></a>
### API-132: POST /api/staff-schedule

Источник handler: [src/app/api/staff-schedule/route.ts:23](../../src/app/api/staff-schedule/route.ts#L23).

- **Auth:** `authorizeApiRequest(request, 'staffSchedule.create')` [source](../../src/app/api/staff-schedule/route.ts#L24); общие auth branches выше.
- **Схемы HTTP boundary:** [createStaffScheduleSchema](#schema-554fd88c9f) ([source](../../src/features/employees/contracts/schemas.ts#L19)).
- **Parsing:** `createStaffScheduleSchema.safeParse(await request.json())` [source](../../src/app/api/staff-schedule/route.ts#L26); `request.json()` [source](../../src/app/api/staff-schedule/route.ts#L26).
- **Выходные формы:** [R091](#r091) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет departmentForReference; service требует active department.
- **Route scope predicates:** `departmentForReference(input.data)` [source](../../src/app/api/staff-schedule/route.ts#L28); `auth.access.allows('staffSchedule.create', { departmentId })` [source](../../src/app/api/staff-schedule/route.ts#L29).
- **Calls:** [WorkforceService.createPosition](../../src/features/employees/application/workforce.service.ts#L101). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Organization mutation lock; StaffSchedule create + audit.
- **Writes/IO evidence:** `tx.staffSchedule.create` [source](../../src/features/employees/application/workforce.service.ts#L104); `tx.auditLog.create` [source](../../src/features/employees/application/workforce.service.ts#L113).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [mapDepartmentError](#mapper-61f03e8359) ([source](../../src/app/api/staff-schedule/route.ts#L12)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/staff-schedule/route.ts#L25); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/staff-schedule/route.ts#L27); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/staff-schedule/route.ts#L30); enclosing checks: `departmentId && !auth.access.allows('staffSchedule.create', { departmentId })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/staff-schedule/route.ts#L33)

```ts
return apiData(await WorkforceService.createPosition(input.data, auth.user.id, auth.requestId), { status: 201 })
```

[source](../../src/app/api/staff-schedule/route.ts#L35); enclosing checks: `catch AND error instanceof DepartmentReferenceError`

```ts
return mapDepartmentError(error)
```

</details>

<a id="api-133"></a>
### API-133: POST /api/tasks/[id]/comments

Источник handler: [src/app/api/tasks/[id]/comments/route.ts:8](../../src/app/api/tasks/%5Bid%5D/comments/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'tasks.update')` [source](../../src/app/api/tasks/%5Bid%5D/comments/route.ts#L12); общие auth branches выше.
- **Схемы HTTP boundary:** [createTaskCommentSchema](#schema-ff87d232c6) ([source](../../src/features/projects/contracts/task.ts#L56)).
- **Parsing:** `createTaskCommentSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/tasks/%5Bid%5D/comments/route.ts#L14); `request.json()` [source](../../src/app/api/tasks/%5Bid%5D/comments/route.ts#L14).
- **Выходные формы:** [R093](#r093) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route сначала требует task existence и tasks.update на project; authorId только actor.
- **Route scope predicates:** `taskTarget(id)` [source](../../src/app/api/tasks/%5Bid%5D/comments/route.ts#L17); `auth.access.allows('tasks.update', target)` [source](../../src/app/api/tasks/%5Bid%5D/comments/route.ts#L19).
- **Calls:** [TaskService.addComment](../../src/features/projects/application/task.service.ts#L224). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** TaskComment с actor authorId + audit в transaction.
- **Writes/IO evidence:** `tx.taskComment.create` [source](../../src/features/projects/application/task.service.ts#L233); `tx.auditLog.create` [source](../../src/features/projects/application/task.service.ts#L237).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/tasks/%5Bid%5D/comments/route.ts#L13); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/tasks/%5Bid%5D/comments/route.ts#L15); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/tasks/%5Bid%5D/comments/route.ts#L18); enclosing checks: `!target`

```ts
return apiError('TASK_NOT_FOUND', 'Задача не найдена', 404)
```

[source](../../src/app/api/tasks/%5Bid%5D/comments/route.ts#L20); enclosing checks: `!auth.access.allows('tasks.update', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/tasks/%5Bid%5D/comments/route.ts#L23)

```ts
return apiData(await TaskService.addComment(
      id,
      auth.user.id,
      input.data.body,
      auth.requestId,
    ), { status: 201 })
```

[source](../../src/app/api/tasks/%5Bid%5D/comments/route.ts#L31); enclosing checks: `catch AND error instanceof TaskServiceError`

```ts
return apiError(error.code, error.message, error.code === 'TASK_NOT_FOUND' ? 404 : 422)
```

</details>

<a id="api-134"></a>
### API-134: PUT /api/tasks/[id]

Источник handler: [src/app/api/tasks/[id]/route.ts:14](../../src/app/api/tasks/%5Bid%5D/route.ts#L14).

- **Auth:** `authorizeApiRequest(request, 'tasks.update')` [source](../../src/app/api/tasks/%5Bid%5D/route.ts#L15); общие auth branches выше.
- **Схемы HTTP boundary:** [updateTaskSchema](#schema-a2b755c86a) ([source](../../src/features/projects/contracts/task.ts#L40)).
- **Parsing:** `updateTaskSchema.safeParse(await request.json())` [source](../../src/app/api/tasks/%5Bid%5D/route.ts#L22); `request.json()` [source](../../src/app/api/tasks/%5Bid%5D/route.ts#L22).
- **Выходные формы:** [R080](#r080) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет projectId текущей задачи по tasks.update; service валидирует graph и assignees.
- **Route scope predicates:** `taskTarget(id)` [source](../../src/app/api/tasks/%5Bid%5D/route.ts#L18); `auth.access.allows('tasks.update', target)` [source](../../src/app/api/tasks/%5Bid%5D/route.ts#L19).
- **Calls:** [TaskService.update](../../src/features/projects/application/task.service.ts#L160). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Task и заменяемые assignees/dependencies/checklist + audit в transaction.
- **Writes/IO evidence:** `tx.task.update` [source](../../src/features/projects/application/task.service.ts#L176); `tx.auditLog.create` [source](../../src/features/projects/application/task.service.ts#L208); `visiting.delete` [source](../../src/features/projects/domain/task-rules.ts#L31).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [mapError](#mapper-21178c39a1) ([source](../../src/app/api/tasks/%5Bid%5D/route.ts#L8)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/tasks/%5Bid%5D/route.ts#L16); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/tasks/%5Bid%5D/route.ts#L20); enclosing checks: `target && !auth.access.allows('tasks.update', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/tasks/%5Bid%5D/route.ts#L23); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/tasks/%5Bid%5D/route.ts#L25)

```ts
return apiData(await TaskService.update(id, input.data, auth.user.id, auth.requestId))
```

[source](../../src/app/api/tasks/%5Bid%5D/route.ts#L27); enclosing checks: `catch AND error instanceof TaskServiceError`

```ts
return mapError(error)
```

[Local error mapping source](../../src/app/api/tasks/%5Bid%5D/route.ts#L8)

```ts
const mapError = (error: TaskServiceError) => apiError(
  error.code,
  error.message,
  error.code === 'TASK_NOT_FOUND' ? 404 : 422,
)
```

</details>

<a id="api-135"></a>
### API-135: DELETE /api/tasks/[id]

Источник handler: [src/app/api/tasks/[id]/route.ts:32](../../src/app/api/tasks/%5Bid%5D/route.ts#L32).

- **Auth:** `authorizeApiRequest(request, 'tasks.delete')` [source](../../src/app/api/tasks/%5Bid%5D/route.ts#L33); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R030](#r030) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет taskTarget по tasks.delete; service удаляет task, audit.
- **Route scope predicates:** `taskTarget(id)` [source](../../src/app/api/tasks/%5Bid%5D/route.ts#L36); `auth.access.allows('tasks.delete', target)` [source](../../src/app/api/tasks/%5Bid%5D/route.ts#L37).
- **Calls:** [TaskService.delete](../../src/features/projects/application/task.service.ts#L251). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Task physical delete + audit; relations удаляются по FK behavior.
- **Writes/IO evidence:** `tx.auditLog.create` [source](../../src/features/projects/application/task.service.ts#L257); `tx.task.delete` [source](../../src/features/projects/application/task.service.ts#L268).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [mapError](#mapper-21178c39a1) ([source](../../src/app/api/tasks/%5Bid%5D/route.ts#L8)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/tasks/%5Bid%5D/route.ts#L34); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/tasks/%5Bid%5D/route.ts#L38); enclosing checks: `target && !auth.access.allows('tasks.delete', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/tasks/%5Bid%5D/route.ts#L41)

```ts
return apiData(await TaskService.delete(id, auth.user.id, auth.requestId))
```

[source](../../src/app/api/tasks/%5Bid%5D/route.ts#L43); enclosing checks: `catch AND error instanceof TaskServiceError`

```ts
return mapError(error)
```

[Local error mapping source](../../src/app/api/tasks/%5Bid%5D/route.ts#L8)

```ts
const mapError = (error: TaskServiceError) => apiError(
  error.code,
  error.message,
  error.code === 'TASK_NOT_FOUND' ? 404 : 422,
)
```

</details>

<a id="api-136"></a>
### API-136: PUT /api/time-entries/[id]

Источник handler: [src/app/api/time-entries/[id]/route.ts:8](../../src/app/api/time-entries/%5Bid%5D/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'timekeeping.update')` [source](../../src/app/api/time-entries/%5Bid%5D/route.ts#L12); общие auth branches выше.
- **Схемы HTTP boundary:** [updateTimeEntrySchema](#schema-4abcf11eb2) ([source](../../src/features/timekeeping/contracts/time-entry.ts#L22)).
- **Parsing:** `updateTimeEntrySchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/time-entries/%5Bid%5D/route.ts#L14); `request.json()` [source](../../src/app/api/time-entries/%5Bid%5D/route.ts#L14).
- **Выходные формы:** [R094](#r094) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Проверяет возможность изменения текущего и нового target; PERIOD_CLOSED/SUBMITTED/APPROVED locks и daily hours.
- **Service scope evidence:** `assertEntryWritable( tx, current.employeeId, current.workDate, access, correctionReason, periods.get(currentKey), )` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L394); `assertEntryWritable( tx, employeeId, workDate, access, correctionReason, periods.get(nextKey), )` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L402); `mutationTarget( current.employeeId, current.projectId, current.taskId, tx, )` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L410); `mutationTarget(employeeId, projectId, taskId, tx)` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L416); `canMutate(access, currentTarget)` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L417); `access.has('timekeeping.timesheets.correct')` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L130); `access.roles.some((role) => privilegedWriteRoles.has(role))` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L74); `access.allows('projects.update', { projectId: target.projectId })` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L78).
- **Calls:** [TimekeepingService.update](../../src/features/timekeeping/application/timekeeping.service.ts#L374). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** TimeEntry + пересчёт старого/нового month salary, reset corrected APPROVED timesheet в DRAFT и audit.
- **Writes/IO evidence:** `tx.timeEntry.update` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L421); `tx.auditLog.create` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L445); `tx.payrollPeriod.upsert` [source](../../src/lib/payroll-period-transaction.ts#L8); `tx.timesheet.updateMany` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L146).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [timekeepingApiError](#mapper-9eba8a037c) ([source](../../src/features/timekeeping/application/http.ts#L4)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/time-entries/%5Bid%5D/route.ts#L13); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/time-entries/%5Bid%5D/route.ts#L15); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/time-entries/%5Bid%5D/route.ts#L18)

```ts
return apiData(
      await TimekeepingService.update(
        id,
        input.data,
        auth.access,
        auth.user.id,
        auth.requestId,
      ),
    )
```

[source](../../src/app/api/time-entries/%5Bid%5D/route.ts#L28); enclosing checks: `catch`

```ts
return timekeepingApiError(error)
```

</details>

<a id="api-137"></a>
### API-137: DELETE /api/time-entries/[id]

Источник handler: [src/app/api/time-entries/[id]/route.ts:32](../../src/app/api/time-entries/%5Bid%5D/route.ts#L32).

- **Auth:** `authorizeApiRequest(request, 'timekeeping.delete')` [source](../../src/app/api/time-entries/%5Bid%5D/route.ts#L36); общие auth branches выше.
- **Схемы HTTP boundary:** [timeEntryDeleteSchema](#schema-69766dc8be) ([source](../../src/features/timekeeping/contracts/time-entry.ts#L51)).
- **Вход и transport:** Optional JSON correctionReason. Malformed/empty JSON catch→{} и затем schema.default({}), поэтому malformed body принимается как отсутствующая reason.
- **Parsing:** `timeEntryDeleteSchema.safeParse(await request.json().catch(() => ({})))` [source](../../src/app/api/time-entries/%5Bid%5D/route.ts#L38); `request.json()` [source](../../src/app/api/time-entries/%5Bid%5D/route.ts#L38).
- **Выходные формы:** [R001](#r001) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Проверяет текущий target тем же canMutate и период/табель; correctionReason для APPROVED.
- **Service scope evidence:** `assertEntryWritable( tx, current.employeeId, current.workDate, access, correctionReason, periodStatus, )` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L482); `mutationTarget(current.employeeId, current.projectId, current.taskId, tx)` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L490); `canMutate(access, target)` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L491); `access.has('timekeeping.timesheets.correct')` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L130); `access.roles.some((role) => privilegedWriteRoles.has(role))` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L74); `access.allows('projects.update', { projectId: target.projectId })` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L78).
- **Calls:** [TimekeepingService.remove](../../src/features/timekeeping/application/timekeeping.service.ts#L466). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** TimeEntry delete + пересчёт salary, corrected timesheet reset и audit.
- **Writes/IO evidence:** `tx.timeEntry.delete` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L492); `tx.auditLog.create` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L494); `tx.payrollPeriod.upsert` [source](../../src/lib/payroll-period-transaction.ts#L8); `tx.timesheet.updateMany` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L146).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [timekeepingApiError](#mapper-9eba8a037c) ([source](../../src/features/timekeeping/application/http.ts#L4)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/time-entries/%5Bid%5D/route.ts#L37); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/time-entries/%5Bid%5D/route.ts#L39); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/time-entries/%5Bid%5D/route.ts#L49)

```ts
return apiData({ success: true })
```

[source](../../src/app/api/time-entries/%5Bid%5D/route.ts#L51); enclosing checks: `catch`

```ts
return timekeepingApiError(error)
```

</details>

<a id="api-138"></a>
### API-138: GET /api/time-entries

Источник handler: [src/app/api/time-entries/route.ts:13](../../src/app/api/time-entries/route.ts#L13).

- **Auth:** `authorizeApiRequest(request, 'timekeeping.read')` [source](../../src/app/api/time-entries/route.ts#L14); общие auth branches выше.
- **Схемы HTTP boundary:** [timeEntryQuerySchema](#schema-233b046031) ([source](../../src/features/timekeeping/contracts/time-entry.ts#L4)).
- **Parsing:** `timeEntryQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))` [source](../../src/app/api/time-entries/route.ts#L16).
- **Выходные формы:** [R095](#r095) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** ADMIN/HR/ACCOUNTANT/AUDITOR visibleWhere={} независимо от scopes. Остальные OR employeeWhere(employees.read)/projectWhere(projects.read). Особые role rules; staff/project references выдаются через сервисный фильтр, отличный от generic timekeeping permission (scope none).
- **Service scope evidence:** `visibleWhere(access)` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L170); `access.roles.some((role) => privilegedReadRoles.has(role))` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L35); `access.has('employees.read')` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L37); `access.employeeWhere('employees.read')` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L38); `access.has('projects.read')` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L40); `access.projectWhere('projects.read')` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L41); `access.has('timekeeping.timesheets.read')` [source](../../src/features/timekeeping/application/timesheet.service.ts#L74); `access.employeeWhere('timekeeping.timesheets.read')` [source](../../src/features/timekeeping/application/timesheet.service.ts#L75); `access.has('timekeeping.timesheets.review')` [source](../../src/features/timekeeping/application/timesheet.service.ts#L77); `access.employeeWhere('timekeeping.timesheets.review')` [source](../../src/features/timekeeping/application/timesheet.service.ts#L78); `access.roles.some((role) => hrRoles.has(role))` [source](../../src/features/timekeeping/application/timesheet.service.ts#L20); `access.roles.some((role) => privilegedReadRoles.has(role))` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L282); `access.has('employees.read')` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L285); `access.employeeWhere('employees.read')` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L286); `access.has('projects.read')` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L287); `access.projectWhere('projects.read')` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L292); `access.projectWhere('projects.read')` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L311).
- **Calls:** [TimekeepingService.getMonth](../../src/features/timekeeping/application/timekeeping.service.ts#L166), [TimekeepingService.options](../../src/features/timekeeping/application/timekeeping.service.ts#L281). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/time-entries/route.ts#L15); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/time-entries/route.ts#L17); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/time-entries/route.ts#L22)

```ts
return apiData({ ...month, ...options })
```

</details>

<a id="api-139"></a>
### API-139: POST /api/time-entries

Источник handler: [src/app/api/time-entries/route.ts:25](../../src/app/api/time-entries/route.ts#L25).

- **Auth:** `authorizeApiRequest(request, 'timekeeping.create')` [source](../../src/app/api/time-entries/route.ts#L26); общие auth branches выше.
- **Схемы HTTP boundary:** [createTimeEntrySchema](#schema-a6ac88e0f2) ([source](../../src/features/timekeeping/contracts/time-entry.ts#L11)).
- **Parsing:** `createTimeEntrySchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/time-entries/route.ts#L28); `request.json()` [source](../../src/app/api/time-entries/route.ts#L28).
- **Выходные формы:** [R094](#r094) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** canMutate: ADMIN/HR, own employee или projects.update на проект; employee/project/task existence и task→project согласованы.
- **Service scope evidence:** `assertEntryWritable( tx, input.employeeId, input.workDate, access, correctionReason, )` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L335); `mutationTarget(input.employeeId, input.projectId, input.taskId, tx)` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L342); `canMutate(access, target)` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L343); `access.has('timekeeping.timesheets.correct')` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L130); `access.roles.some((role) => privilegedWriteRoles.has(role))` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L74); `access.allows('projects.update', { projectId: target.projectId })` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L78).
- **Calls:** [TimekeepingService.create](../../src/features/timekeeping/application/timekeeping.service.ts#L327). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** TimeEntry + пересчёт salary/month labour results и audit в transaction; payroll period lock и daily hours.
- **Writes/IO evidence:** `tx.timeEntry.create` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L345); `tx.auditLog.create` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L355); `tx.payrollPeriod.upsert` [source](../../src/lib/payroll-period-transaction.ts#L8); `tx.timesheet.updateMany` [source](../../src/features/timekeeping/application/timekeeping.service.ts#L146).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [timekeepingApiError](#mapper-9eba8a037c) ([source](../../src/features/timekeeping/application/http.ts#L4)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/time-entries/route.ts#L27); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/time-entries/route.ts#L29); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/time-entries/route.ts#L31)

```ts
return apiData(
      await TimekeepingService.create(
        input.data,
        auth.access,
        auth.user.id,
        auth.requestId,
      ),
      { status: 201 },
    )
```

[source](../../src/app/api/time-entries/route.ts#L41); enclosing checks: `catch`

```ts
return timekeepingApiError(error)
```

</details>

<a id="api-140"></a>
### API-140: POST /api/timekeeping/timesheets/[id]/decision

Источник handler: [src/app/api/timekeeping/timesheets/[id]/decision/route.ts:8](../../src/app/api/timekeeping/timesheets/%5Bid%5D/decision/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'timekeeping.timesheets.review')` [source](../../src/app/api/timekeeping/timesheets/%5Bid%5D/decision/route.ts#L12); общие auth branches выше.
- **Схемы HTTP boundary:** [timesheetDecisionSchema](#schema-c6d89d5d98) ([source](../../src/features/timekeeping/contracts/time-entry.ts#L39)).
- **Parsing:** `timesheetDecisionSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/timekeeping/timesheets/%5Bid%5D/decision/route.ts#L14); `request.json()` [source](../../src/app/api/timekeeping/timesheets/%5Bid%5D/decision/route.ts#L14).
- **Выходные формы:** [R096](#r096) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Запрещено approve own; точный head department/ancestor с eligible account и department scope. ADMIN/HR fallback только при отсутствующем/непригодном head, с scope и reason.
- **Service scope evidence:** `access.has('timekeeping.timesheets.review')` [source](../../src/features/timekeeping/application/timesheet.service.ts#L260); `access.allows('timekeeping.timesheets.review', { departmentId: timesheet.employee.departmentId, })` [source](../../src/features/timekeeping/application/timesheet.service.ts#L300); `access.roles.some((role) => hrRoles.has(role))` [source](../../src/features/timekeeping/application/timesheet.service.ts#L20); `assignment.departmentScopes.some((scope) => ancestorIds.has(scope.departmentId))` [source](../../src/features/timekeeping/application/timesheet.service.ts#L63).
- **Calls:** [TimesheetService.decide](../../src/features/timekeeping/application/timesheet.service.ts#L227). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Timesheet APPROVED либо RETURNED, reason/decidedBy/At и audit; payroll period lock.
- **Writes/IO evidence:** `tx.timesheet.update` [source](../../src/features/timekeeping/application/timesheet.service.ts#L319); `tx.auditLog.create` [source](../../src/features/timekeeping/application/timesheet.service.ts#L328); `tx.payrollPeriod.upsert` [source](../../src/lib/payroll-period-transaction.ts#L8).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [timekeepingApiError](#mapper-9eba8a037c) ([source](../../src/features/timekeeping/application/http.ts#L4)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/timekeeping/timesheets/%5Bid%5D/decision/route.ts#L13); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/timekeeping/timesheets/%5Bid%5D/decision/route.ts#L15); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/timekeeping/timesheets/%5Bid%5D/decision/route.ts#L18)

```ts
return apiData(await new TimesheetService().decide(
      id,
      input.data,
      auth.user.id,
      auth.user.employeeId,
      auth.access,
      auth.requestId,
    ))
```

[source](../../src/app/api/timekeeping/timesheets/%5Bid%5D/decision/route.ts#L27); enclosing checks: `catch`

```ts
return timekeepingApiError(error)
```

</details>

<a id="api-141"></a>
### API-141: POST /api/timekeeping/timesheets

Источник handler: [src/app/api/timekeeping/timesheets/route.ts:8](../../src/app/api/timekeeping/timesheets/route.ts#L8).

- **Auth:** `authorizeApiRequest(request, 'timekeeping.timesheets.submit')` [source](../../src/app/api/timekeeping/timesheets/route.ts#L9); общие auth branches выше.
- **Схемы HTTP boundary:** [submitTimesheetSchema](#schema-173df884d4) ([source](../../src/features/timekeeping/contracts/time-entry.ts#L33)).
- **Parsing:** `submitTimesheetSchema.safeParse(await request.json().catch(() => null))` [source](../../src/app/api/timekeeping/timesheets/route.ts#L11); `request.json()` [source](../../src/app/api/timekeeping/timesheets/route.ts#L11).
- **Выходные формы:** [R096](#r096) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Свой employee + submit permission или роль ADMIN/HR; ADMIN/HR здесь обходят department scopes. Нулевые часы требуют подтверждения.
- **Service scope evidence:** `access.has('timekeeping.timesheets.submit')` [source](../../src/features/timekeeping/application/timesheet.service.ts#L160); `access.roles.some((role) => hrRoles.has(role))` [source](../../src/features/timekeeping/application/timesheet.service.ts#L20).
- **Calls:** [TimesheetService.submit](../../src/features/timekeeping/application/timesheet.service.ts#L148). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Timesheet create/update SUBMITTED и audit; payroll period lock.
- **Writes/IO evidence:** `tx.timesheet.update` [source](../../src/features/timekeeping/application/timesheet.service.ts#L199); `tx.timesheet.create` [source](../../src/features/timekeeping/application/timesheet.service.ts#L200); `tx.auditLog.create` [source](../../src/features/timekeeping/application/timesheet.service.ts#L208); `tx.payrollPeriod.upsert` [source](../../src/lib/payroll-period-transaction.ts#L8).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [timekeepingApiError](#mapper-9eba8a037c) ([source](../../src/features/timekeeping/application/http.ts#L4)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/timekeeping/timesheets/route.ts#L10); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/timekeeping/timesheets/route.ts#L12); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/timekeeping/timesheets/route.ts#L14)

```ts
return apiData(await new TimesheetService().submit(
      input.data,
      auth.user.id,
      auth.user.employeeId,
      auth.access,
      auth.requestId,
    ), { status: 201 })
```

[source](../../src/app/api/timekeeping/timesheets/route.ts#L22); enclosing checks: `catch`

```ts
return timekeepingApiError(error)
```

</details>

<a id="api-142"></a>
### API-142: PATCH /api/users/[id]

Источник handler: [src/app/api/users/[id]/route.ts:17](../../src/app/api/users/%5Bid%5D/route.ts#L17).

- **Auth:** `authorizeApiRequest(request, 'access.users.update')` [source](../../src/app/api/users/%5Bid%5D/route.ts#L21); общие auth branches выше.
- **Схемы HTTP boundary:** [updateUserSchema](#schema-da14015b0f) ([source](../../src/features/users/contracts/schemas.ts#L88)).
- **Parsing:** `updateUserSchema.safeParse(await request.json())` [source](../../src/app/api/users/%5Bid%5D/route.ts#L24); `request.json()` [source](../../src/app/api/users/%5Bid%5D/route.ts#L24).
- **Выходные формы:** [R097](#r097) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** access.users.update scope none; target user ID глобальный; self deactivation и last active ADMIN guards.
- **Service scope evidence:** `assignment.departmentScopes.map((scope) => scope.departmentId)` [source](../../src/features/users/application/user.service.ts#L256); `assignment.projectScopes.map((scope) => scope.projectId)` [source](../../src/features/users/application/user.service.ts#L257); `(() => { switch (input.role) { case 'ADMIN': case 'AUDITOR': return input.departmentScopeMode === 'ALL' && input.projectScopeMode === 'ALL' case 'EMPLOYEE': return input.departmentScopeMode === 'SELF' && input.projectScopeMode === 'SELF' case 'HR': return scopedModes.has(input.departmentScopeMode) && input.projectScopeMode === 'NONE' case 'ACCOUNTANT': case 'DEPARTMENT_HEAD': return scopedModes.has(input.departmentScopeMode) && scopedModes.has(input.projectScopeMode) case 'PROJECT_MANAGER': return input.departmentScopeMode === 'NONE' && scopedModes.has(input.projectScopeMode) case 'ASSET_CUSTODIAN': return scopedModes.has(input.departmentScopeMode) && input.projectScopeMode === 'NONE' } })()` [source](../../src/features/users/application/user.service.ts#L81).
- **Calls:** [UserService.update](../../src/features/users/application/user.service.ts#L238). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** User/role assignments/scopes; sessionVersion меняется для auth-sensitive changes; last-admin advisory lock и self-deactivation guard; audit.
- **Writes/IO evidence:** `tx.user.update` [source](../../src/features/users/application/user.service.ts#L278); `tx.auditLog.create` [source](../../src/features/users/application/user.service.ts#L307).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/users/%5Bid%5D/route.ts#L22); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/users/%5Bid%5D/route.ts#L25); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/users/%5Bid%5D/route.ts#L28)

```ts
return apiData(await UserService.update((await params).id, input.data, auth.user.id, auth.requestId))
```

[source](../../src/app/api/users/%5Bid%5D/route.ts#L32); enclosing checks: `catch AND error instanceof UserServiceError && userErrorMessages[error.code]`

```ts
return apiError(error.code, message, status)
```

[Local error mapping source](../../src/app/api/users/%5Bid%5D/route.ts#L7)

```ts
const userErrorMessages: Record<string, [string, number]> = {
  USER_NOT_FOUND: ['Пользователь не найден', 404],
  CANNOT_DEACTIVATE_SELF: ['Нельзя отключить собственную учётную запись', 409],
  LAST_ADMIN_REQUIRED: ['В системе должен остаться хотя бы один активный администратор', 409],
  INVALID_SCOPE_ASSIGNMENT: ['Недопустимая область доступа для выбранной роли', 422],
  INVALID_SCOPE_REFERENCE: ['Подразделение, проект или сотрудник не найден', 422],
  EMPLOYEE_LINK_REQUIRED: ['Для роли сотрудника нужна кадровая карточка', 422],
  EMPLOYEE_ALREADY_LINKED: ['Кадровая карточка уже связана с другим пользователем', 409],
}
```

</details>

<a id="api-143"></a>
### API-143: GET /api/users

Источник handler: [src/app/api/users/route.ts:7](../../src/app/api/users/route.ts#L7).

- **Auth:** `authorizeApiRequest(request, 'access.users.read')` [source](../../src/app/api/users/route.ts#L8); общие auth branches выше.
- **Схемы HTTP boundary:** [usersQuerySchema](#schema-f581630f9a) ([source](../../src/features/users/contracts/schemas.ts#L122)).
- **Parsing:** `usersQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))` [source](../../src/app/api/users/route.ts#L11).
- **Выходные формы:** [R098](#r098) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** access.users.read scope none; весь реестр пользователей, passwordHash/sessionVersion/login counters не входят в userSelect.
- **Calls:** [UserService.list](../../src/features/users/application/user.service.ts#L161). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/users/route.ts#L9); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/users/route.ts#L12); enclosing checks: `!query.success`

```ts
return apiValidationError(query.error)
```

[source](../../src/app/api/users/route.ts#L15)

```ts
return apiList(result.users, { ...query.data, total: result.total })
```

</details>

<a id="api-144"></a>
### API-144: POST /api/users

Источник handler: [src/app/api/users/route.ts:18](../../src/app/api/users/route.ts#L18).

- **Auth:** `authorizeApiRequest(request, 'access.users.create')` [source](../../src/app/api/users/route.ts#L19); общие auth branches выше.
- **Схемы HTTP boundary:** [createUserSchema](#schema-a295985f88) ([source](../../src/features/users/contracts/schemas.ts#L72)).
- **Parsing:** `createUserSchema.safeParse(await request.json())` [source](../../src/app/api/users/route.ts#L22); `request.json()` [source](../../src/app/api/users/route.ts#L22).
- **Выходные формы:** [R097](#r097) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** access.users.create scope none; normalized role assignments/scopes проверяются на допустимость и existence.
- **Service scope evidence:** `(() => { switch (input.role) { case 'ADMIN': case 'AUDITOR': return input.departmentScopeMode === 'ALL' && input.projectScopeMode === 'ALL' case 'EMPLOYEE': return input.departmentScopeMode === 'SELF' && input.projectScopeMode === 'SELF' case 'HR': return scopedModes.has(input.departmentScopeMode) && input.projectScopeMode === 'NONE' case 'ACCOUNTANT': case 'DEPARTMENT_HEAD': return scopedModes.has(input.departmentScopeMode) && scopedModes.has(input.projectScopeMode) case 'PROJECT_MANAGER': return input.departmentScopeMode === 'NONE' && scopedModes.has(input.projectScopeMode) case 'ASSET_CUSTODIAN': return scopedModes.has(input.departmentScopeMode) && input.projectScopeMode === 'NONE' } })()` [source](../../src/features/users/application/user.service.ts#L81).
- **Calls:** [UserService.create](../../src/features/users/application/user.service.ts#L197). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** User + role assignments/scopes; temporaryPassword hash, mustChangePassword=true; audit в транзакции.
- **Writes/IO evidence:** `tx.user.create` [source](../../src/features/users/application/user.service.ts#L203); `tx.auditLog.create` [source](../../src/features/users/application/user.service.ts#L215).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/users/route.ts#L20); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/users/route.ts#L23); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/users/route.ts#L26)

```ts
return apiData(await UserService.create(input.data, auth.user.id, auth.requestId), { status: 201 })
```

[source](../../src/app/api/users/route.ts#L30); enclosing checks: `catch AND error instanceof UserServiceError AND error.code === 'USERNAME_EXISTS'`

```ts
return apiError('USERNAME_EXISTS', 'Пользователь с таким логином уже существует', 409)
```

[source](../../src/app/api/users/route.ts#L33); enclosing checks: `catch AND error instanceof UserServiceError AND error.code === 'EMPLOYEE_ALREADY_LINKED'`

```ts
return apiError(error.code, 'Кадровая карточка уже связана с другим пользователем', 409)
```

[source](../../src/app/api/users/route.ts#L36); enclosing checks: `catch AND error instanceof UserServiceError AND ['INVALID_SCOPE_ASSIGNMENT', 'INVALID_SCOPE_REFERENCE', 'EMPLOYEE_LINK_REQUIRED'].includes(error.code)`

```ts
return apiError(error.code, 'Проверьте роли, области доступа и связь с сотрудником', 422)
```

</details>

<a id="api-145"></a>
### API-145: PUT /api/vacations/[id]

Источник handler: [src/app/api/vacations/[id]/route.ts:12](../../src/app/api/vacations/%5Bid%5D/route.ts#L12).

- **Auth:** `authorizeApiRequest(request, 'vacations.update')` [source](../../src/app/api/vacations/%5Bid%5D/route.ts#L13); общие auth branches выше.
- **Схемы HTTP boundary:** [createVacationSchema](#schema-125c70cae7) ([source](../../src/features/employees/contracts/schemas.ts#L30)).
- **Parsing:** `createVacationSchema.safeParse(await request.json())` [source](../../src/app/api/vacations/%5Bid%5D/route.ts#L15); `request.json()` [source](../../src/app/api/vacations/%5Bid%5D/route.ts#L15).
- **Выходные формы:** [R099](#r099) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет employee target; PUT учитывает текущий employee и departments текущего/нового сотрудника. Service проверяет корректные dates/order.
- **Route scope predicates:** `vacationTarget(id)` [source](../../src/app/api/vacations/%5Bid%5D/route.ts#L19); `employeeTarget(input.data.employeeId)` [source](../../src/app/api/vacations/%5Bid%5D/route.ts#L20); `auth.access.allows('vacations.update', { employeeId: currentTarget.employeeId, departmentIds, })` [source](../../src/app/api/vacations/%5Bid%5D/route.ts#L26).
- **Calls:** [WorkforceService.saveVacation](../../src/features/employees/application/workforce.service.ts#L35). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Vacation create/update + audit в transaction; Employee.status не изменяет.
- **Writes/IO evidence:** `tx.vacation.update` [source](../../src/features/employees/application/workforce.service.ts#L45); `tx.vacation.create` [source](../../src/features/employees/application/workforce.service.ts#L49); `tx.auditLog.create` [source](../../src/features/employees/application/workforce.service.ts#L53).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [mapError](#mapper-adbd9c641f) ([source](../../src/app/api/vacations/%5Bid%5D/route.ts#L8)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/vacations/%5Bid%5D/route.ts#L14); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/vacations/%5Bid%5D/route.ts#L16); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/vacations/%5Bid%5D/route.ts#L29); enclosing checks: `currentTarget && !auth.access.allows('vacations.update', { employeeId: currentTarget.employeeId, departmentIds, })`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/vacations/%5Bid%5D/route.ts#L31)

```ts
return apiData(await WorkforceService.saveVacation(id, input.data, auth.user.id, auth.requestId))
```

[source](../../src/app/api/vacations/%5Bid%5D/route.ts#L33); enclosing checks: `catch AND error instanceof WorkforceServiceError`

```ts
return mapError(error)
```

[Local error mapping source](../../src/app/api/vacations/%5Bid%5D/route.ts#L8)

```ts
const mapError = (error: WorkforceServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'Отпуск не найден', 404)
  : apiError(error.code, 'Некорректные даты отпуска', 422)
```

</details>

<a id="api-146"></a>
### API-146: DELETE /api/vacations/[id]

Источник handler: [src/app/api/vacations/[id]/route.ts:38](../../src/app/api/vacations/%5Bid%5D/route.ts#L38).

- **Auth:** `authorizeApiRequest(request, 'vacations.delete')` [source](../../src/app/api/vacations/%5Bid%5D/route.ts#L39); общие auth branches выше.
- **Вход:** только path params, если они есть; body/query route не читает.
- **Выходные формы:** [R030](#r030) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет vacationTarget, employeeId/department; service AccessContext не принимает.
- **Route scope predicates:** `vacationTarget(id)` [source](../../src/app/api/vacations/%5Bid%5D/route.ts#L42); `auth.access.allows('vacations.delete', target)` [source](../../src/app/api/vacations/%5Bid%5D/route.ts#L43).
- **Calls:** [WorkforceService.deleteVacation](../../src/features/employees/application/workforce.service.ts#L67). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Vacation physical delete + audit в transaction.
- **Writes/IO evidence:** `tx.vacation.delete` [source](../../src/features/employees/application/workforce.service.ts#L71); `tx.auditLog.create` [source](../../src/features/employees/application/workforce.service.ts#L72).
- **Error maps:** [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [mapError](#mapper-adbd9c641f) ([source](../../src/app/api/vacations/%5Bid%5D/route.ts#L8)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/vacations/%5Bid%5D/route.ts#L40); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/vacations/%5Bid%5D/route.ts#L44); enclosing checks: `target && !auth.access.allows('vacations.delete', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/vacations/%5Bid%5D/route.ts#L47)

```ts
return apiData(await WorkforceService.deleteVacation(id, auth.user.id, auth.requestId))
```

[source](../../src/app/api/vacations/%5Bid%5D/route.ts#L49); enclosing checks: `catch AND error instanceof WorkforceServiceError`

```ts
return mapError(error)
```

[Local error mapping source](../../src/app/api/vacations/%5Bid%5D/route.ts#L8)

```ts
const mapError = (error: WorkforceServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'Отпуск не найден', 404)
  : apiError(error.code, 'Некорректные даты отпуска', 422)
```

</details>

<a id="api-147"></a>
### API-147: GET /api/vacations

Источник handler: [src/app/api/vacations/route.ts:11](../../src/app/api/vacations/route.ts#L11).

- **Auth:** `authorizeApiRequest(request, 'vacations.read')` [source](../../src/app/api/vacations/route.ts#L12); общие auth branches выше.
- **Схемы HTTP boundary:** [yearSchema](#schema-6a30e581db) ([source](../../src/app/api/vacations/route.ts#L9)).
- **Вход и transport:** year из query или текущий локальный год; z.coerce.number().int().min(2000).max(2100).
- **Parsing:** `yearSchema.safeParse(request.nextUrl.searchParams.get('year') || new Date().getFullYear())` [source](../../src/app/api/vacations/route.ts#L14).
- **Query/header reads:** `request.nextUrl.searchParams.get('year')` [source](../../src/app/api/vacations/route.ts#L14).
- **Выходные формы:** [R100](#r100) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** employeeWhere(vacations.read) на relation employee и выбранный год.
- **Service scope evidence:** `access.employeeWhere('vacations.read')` [source](../../src/features/employees/application/workforce.service.ts#L27).
- **Calls:** [WorkforceService.listVacations](../../src/features/employees/application/workforce.service.ts#L20). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** выбранный business read не содержит model writes.
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/vacations/route.ts#L13); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/vacations/route.ts#L15); enclosing checks: `!year.success`

```ts
return apiValidationError(year.error)
```

[source](../../src/app/api/vacations/route.ts#L16)

```ts
return apiData(await WorkforceService.listVacations(year.data, auth.access))
```

</details>

<a id="api-148"></a>
### API-148: POST /api/vacations

Источник handler: [src/app/api/vacations/route.ts:19](../../src/app/api/vacations/route.ts#L19).

- **Auth:** `authorizeApiRequest(request, 'vacations.create')` [source](../../src/app/api/vacations/route.ts#L20); общие auth branches выше.
- **Схемы HTTP boundary:** [createVacationSchema](#schema-125c70cae7) ([source](../../src/features/employees/contracts/schemas.ts#L30)).
- **Parsing:** `createVacationSchema.safeParse(await request.json())` [source](../../src/app/api/vacations/route.ts#L22); `request.json()` [source](../../src/app/api/vacations/route.ts#L22).
- **Выходные формы:** [R099](#r099) (полные поля ниже; apiList оборачивает element[] в pagination).
- **Resource scope:** Route проверяет employee target; PUT учитывает текущий employee и departments текущего/нового сотрудника. Service проверяет корректные dates/order.
- **Route scope predicates:** `employeeTarget(input.data.employeeId)` [source](../../src/app/api/vacations/route.ts#L24); `auth.access.allows('vacations.create', target)` [source](../../src/app/api/vacations/route.ts#L25).
- **Calls:** [WorkforceService.saveVacation](../../src/features/employees/application/workforce.service.ts#L35). Полные bodies, dependencies и select/include/serializers сохранены в JSON.behaviors.
- **Side effects:** Vacation create/update + audit в transaction; Employee.status не изменяет.
- **Writes/IO evidence:** `tx.vacation.update` [source](../../src/features/employees/application/workforce.service.ts#L45); `tx.vacation.create` [source](../../src/features/employees/application/workforce.service.ts#L49); `tx.auditLog.create` [source](../../src/features/employees/application/workforce.service.ts#L53).
- **Error maps:** [apiValidationError](#mapper-a7d5b2af16) ([source](../../src/lib/http/api-response.ts#L33)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)), [apiError](#mapper-67fe6e3ed1) ([source](../../src/lib/http/api-response.ts#L21)).

<details>
<summary>Все return/status/error branches этого handler с условиями</summary>

[source](../../src/app/api/vacations/route.ts#L21); enclosing checks: `auth.response`

```ts
return auth.response
```

[source](../../src/app/api/vacations/route.ts#L23); enclosing checks: `!input.success`

```ts
return apiValidationError(input.error)
```

[source](../../src/app/api/vacations/route.ts#L26); enclosing checks: `target && !auth.access.allows('vacations.create', target)`

```ts
return apiError('FORBIDDEN', 'Недостаточно прав', 403)
```

[source](../../src/app/api/vacations/route.ts#L29)

```ts
return apiData(await WorkforceService.saveVacation(undefined, input.data, auth.user.id, auth.requestId), { status: 201 })
```

[source](../../src/app/api/vacations/route.ts#L31); enclosing checks: `catch AND error instanceof WorkforceServiceError`

```ts
return apiError(error.code, 'Некорректные даты отпуска', 422)
```

</details>

## Error mapper definitions

<a id="mapper-a7d5b2af16"></a>
### apiValidationError

[src/lib/http/api-response.ts:33](../../src/lib/http/api-response.ts#L33)

```ts
export function apiValidationError(error: ZodError) {
  return apiError('VALIDATION_ERROR', 'Проверьте введённые данные', 422, error.flatten().fieldErrors)
}
```

<a id="mapper-67fe6e3ed1"></a>
### apiError

[src/lib/http/api-response.ts:21](../../src/lib/http/api-response.ts#L21)

```ts
export function apiError(
  code: string,
  message: string,
  status: number,
  fieldErrors?: Record<string, string[] | undefined>,
) {
  return NextResponse.json(
    { error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } },
    { status },
  )
}
```

<a id="mapper-27092afa0d"></a>
### approvalApiError

[src/features/approvals/application/http.ts:14](../../src/features/approvals/application/http.ts#L14)

```ts
export function approvalApiError(error: unknown) {
  if (error instanceof ApprovalServiceError) {
    const [code, message, status] = errors[error.code]
    return apiError(code, message, status)
  }
  throw error
}
```

[src/features/approvals/application/http.ts:4](../../src/features/approvals/application/http.ts#L4)

```ts
errors = {
  NOT_FOUND: ['APPROVAL_NOT_FOUND', 'Согласование не найдено', 404],
  FORBIDDEN: ['FORBIDDEN', 'Недостаточно прав для этого согласования', 403],
  INVALID_STATE: ['INVALID_APPROVAL_STATE', 'Согласование уже завершено или изменилось', 409],
  INVALID_APPROVER: ['INVALID_APPROVER', 'Один из согласующих недоступен', 422],
  REFERENCE_NOT_FOUND: ['REFERENCE_NOT_FOUND', 'Связанный объект не найден', 422],
  TEMPLATE_EXISTS: ['APPROVAL_TEMPLATE_EXISTS', 'Шаблон с таким названием уже существует', 409],
  TEMPLATE_NOT_FOUND: ['APPROVAL_TEMPLATE_NOT_FOUND', 'Шаблон маршрута не найден', 404],
} as const
```

<a id="mapper-b01473cd35"></a>
### assetLifecycleApiError

[src/features/assets/application/asset-lifecycle-http.ts:4](../../src/features/assets/application/asset-lifecycle-http.ts#L4)

```ts
export function assetLifecycleApiError(error: unknown) {
  if (!(error instanceof AssetLifecycleError)) throw error
  if (error.code === 'ASSET_NOT_FOUND' || error.code === 'MAINTENANCE_NOT_FOUND') {
    return apiError(error.code, 'Запись не найдена', 404)
  }
  if (error.code === 'ASSET_UNAVAILABLE') {
    return apiError(error.code, 'Архивный или списанный объект нельзя обслуживать', 409)
  }
  return apiError(error.code, 'Недопустимый переход статуса обслуживания', 409)
}
```

<a id="mapper-736b16126e"></a>
### mapAssetError

[src/app/api/assets/[id]/route.ts:16](../../src/app/api/assets/%5Bid%5D/route.ts#L16)

```ts
function mapAssetError(error: unknown) {
  if (error instanceof AssetServiceError && errorMap[error.code]) {
    const mapped = errorMap[error.code]
    return apiError(error.code, mapped.message, mapped.status)
  }
  return null
}
```

[src/app/api/assets/[id]/route.ts:9](../../src/app/api/assets/%5Bid%5D/route.ts#L9)

```ts
errorMap: Record<string, { message: string; status: number }> = {
  ASSET_NOT_FOUND: { message: 'Объект имущества не найден', status: 404 },
  QUANTITY_OPERATION_REQUIRED: { message: 'Количество изменяется только операцией поступления или списания', status: 409 },
  MOL_TRANSFER_REQUIRED: { message: 'МОЛ изменяется только через операцию передачи', status: 409 },
  CONCURRENT_UPDATE: { message: 'Данные изменились параллельно, повторите операцию', status: 409 },
}
```

<a id="mapper-9d396433e5"></a>
### assetInventoryApiError

[src/features/assets/application/inventory-http.ts:14](../../src/features/assets/application/inventory-http.ts#L14)

```ts
export function assetInventoryApiError(error: unknown) {
  if (!(error instanceof AssetInventoryError)) return null
  const response = inventoryErrorResponses[error.code]
  return apiError(error.code, response.message, response.status)
}
```

[src/features/assets/application/inventory-http.ts:4](../../src/features/assets/application/inventory-http.ts#L4)

```ts
inventoryErrorResponses: Record<AssetInventoryError['code'], { status: number; message: string }> = {
  MOL_NOT_FOUND: { status: 404, message: 'МОЛ не найден или недоступен' },
  FORBIDDEN: { status: 403, message: 'Недостаточно прав для этой инвентаризации' },
  EMPTY_INVENTORY: { status: 422, message: 'В выбранном месте нет имущества для инвентаризации' },
  INVENTORY_TOO_LARGE: { status: 422, message: 'Разделите проверку: в одной ведомости не более 5 000 позиций' },
  INVENTORY_NOT_FOUND: { status: 404, message: 'Инвентаризация не найдена' },
  INVENTORY_COMPLETED: { status: 409, message: 'Инвентаризация уже завершена' },
  ASSET_NOT_IN_INVENTORY: { status: 404, message: 'Позиция не входит в эту инвентаризацию' },
}
```

<a id="mapper-4bd2e58d56"></a>
### mapWriteError

[src/features/departments/application/department.service.ts:75](../../src/features/departments/application/department.service.ts#L75)

```ts
function mapWriteError(error: unknown): never {
  if (error instanceof DepartmentServiceError) throw error
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2003') throw new DepartmentServiceError('IN_USE')
    if (error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target ?? '')
      throw new DepartmentServiceError(target.includes('name') ? 'NAME_EXISTS' : 'CODE_EXISTS')
    }
  }
  throw error
}
```

<a id="mapper-99b29f36a0"></a>
### mapDepartmentError

[src/app/api/departments/[id]/route.ts:11](../../src/app/api/departments/%5Bid%5D/route.ts#L11)

```ts
function mapDepartmentError(error: DepartmentServiceError) {
  const meta = getDepartmentErrorMeta(error.code)
  return apiError(error.code, meta.message, meta.status)
}
```

<a id="mapper-3aec2a9dbc"></a>
### getDepartmentErrorMeta

[src/features/departments/application/error-mapping.ts:14](../../src/features/departments/application/error-mapping.ts#L14)

```ts
export function getDepartmentErrorMeta(code: DepartmentErrorCode) {
  return departmentErrors[code]
}
```

[src/features/departments/application/error-mapping.ts:3](../../src/features/departments/application/error-mapping.ts#L3)

```ts
departmentErrors: Record<DepartmentErrorCode, { message: string; status: number }> = {
  NOT_FOUND: { message: 'Подразделение не найдено', status: 404 },
  CODE_EXISTS: { message: 'Подразделение с таким кодом уже существует', status: 409 },
  NAME_EXISTS: { message: 'Подразделение с таким названием уже существует', status: 409 },
  PARENT_NOT_FOUND: { message: 'Родительское подразделение не найдено', status: 422 },
  HEAD_NOT_FOUND: { message: 'Руководитель не найден или больше не работает', status: 422 },
  CYCLIC_HIERARCHY: { message: 'Нельзя создать циклическую структуру подразделений', status: 409 },
  IN_USE: { message: 'Подразделение используется и не может быть удалено', status: 409 },
  DEPARTMENT_REQUIRED: { message: 'Подразделение обязательно', status: 422 },
  INACTIVE_DEPARTMENT: { message: 'Нельзя назначить неактивное подразделение', status: 409 },
}
```

<a id="mapper-578ed40228"></a>
### mapDepartmentError

[src/app/api/departments/route.ts:14](../../src/app/api/departments/route.ts#L14)

```ts
function mapDepartmentError(error: DepartmentServiceError) {
  const meta = getDepartmentErrorMeta(error.code)
  return apiError(error.code, meta.message, meta.status)
}
```

<a id="mapper-b6cb4c4a05"></a>
### mapAuthorizationError

[src/features/documents/application/document.service.ts:120](../../src/features/documents/application/document.service.ts#L120)

```ts
function mapAuthorizationError(error: unknown): never {
  if (error instanceof DocumentAuthorizationError) {
    throw new DocumentServiceError('FORBIDDEN')
  }
  throw error
}
```

<a id="mapper-c1b7a22109"></a>
### documentApiError

[src/features/documents/application/http.ts:90](../../src/features/documents/application/http.ts#L90)

```ts
export function documentApiError(error: unknown) {
  if (error instanceof ZodError) return apiValidationError(error)
  if (error instanceof DocumentUploadRequestError) {
    return apiError(error.code, error.message, 422)
  }
  if (error instanceof DocumentFilePolicyError) {
    return apiError(error.code, error.message, 422)
  }
  if (error instanceof LocalStorageError) {
    const status = error.code === 'OBJECT_NOT_FOUND' ? 404 : 422
    return apiError(error.code, error.message, status)
  }
  if (error instanceof DocumentServiceError) {
    const responses: Record<
      DocumentServiceError['code'],
      { message: string; status: number }
    > = {
      NOT_FOUND: { message: 'Документ или версия не найдены', status: 404 },
      FORBIDDEN: { message: 'Недостаточно прав', status: 403 },
      INVALID_STATE: {
        message: 'Операция недоступна в текущем статусе документа',
        status: 409,
      },
      OPTIMISTIC_LOCK_CONFLICT: {
        message: 'Документ уже изменён другим пользователем. Обновите страницу',
        status: 409,
      },
      LINK_NOT_FOUND: {
        message: 'Связанный проект, сотрудник или объект имущества не найден',
        status: 422,
      },
      STORAGE_CORRUPTED: {
        message: 'Файл повреждён или отсутствует в хранилище',
        status: 503,
      },
    }
    const response = responses[error.code]
    return apiError(error.code, response.message, response.status)
  }
  throw error
}
```

<a id="mapper-63711b1257"></a>
### hrError

[src/features/employees/domain/hr-domain.ts:17](../../src/features/employees/domain/hr-domain.ts#L17)

```ts
hrError = (code: HrErrorCode) => new ServiceError(code)
```

<a id="mapper-97765decfa"></a>
### mapEmployeeError

[src/app/api/employees/[id]/route.ts:18](../../src/app/api/employees/%5Bid%5D/route.ts#L18)

```ts
function mapEmployeeError(error: unknown) {
  if (error instanceof DepartmentReferenceError) {
    const meta = getDepartmentReferenceErrorMeta(error.code)
    return apiError(error.code, meta.message, meta.status)
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return apiError('EMPLOYEE_CODE_EXISTS', 'Сотрудник с таким табельным номером уже существует', 409)
  }
  const routeError = getEmployeeRouteErrorMeta(error)
  return routeError ? apiError('EMPLOYEE_DOMAIN_ERROR', routeError.error, routeError.status) : null
}
```

[src/features/employees/application/error-mapping.ts:3](../../src/features/employees/application/error-mapping.ts#L3)

```ts
getEmployeeRouteErrorMeta = (error: unknown) => {
  if (!(error instanceof ServiceError)) return null
  switch (error.code) {
    case 'POSITION_REQUIRED': return { status: 400, error: 'Должность из штатного расписания обязательна' }
    case 'POSITION_NOT_FOUND': return { status: 404, error: 'Должность из штатного расписания не найдена' }
    case 'EMPLOYEE_NOT_FOUND': return { status: 404, error: 'Сотрудник не найден' }
    case 'INSUFFICIENT_POSITION_RATE': return { status: 400, error: 'Недостаточно свободных ставок по выбранной должности' }
    case 'INACTIVE_POSITION_DEPARTMENT': return { status: 409, error: 'Подразделение выбранной должности неактивно' }
    case 'INVALID_EMPLOYMENT_RATE': return { status: 400, error: 'Количество ставок сотрудника должно быть больше нуля' }
    case 'INVALID_CONTRACT_DATE_RANGE': return { status: 400, error: 'Дата подписания договора должна быть раньше срока действия договора' }
    case 'INVALID_CONTRACT_DATE': return { status: 400, error: 'Некорректная дата договора' }
    default: return null
  }
}
```

<a id="mapper-6cf752dd03"></a>
### getDepartmentReferenceErrorMeta

[src/lib/organization/department-reference.ts:20](../../src/lib/organization/department-reference.ts#L20)

```ts
export function getDepartmentReferenceErrorMeta(code: DepartmentReferenceErrorCode) {
  return referenceErrorMeta[code]
}
```

[src/lib/organization/department-reference.ts:11](../../src/lib/organization/department-reference.ts#L11)

```ts
referenceErrorMeta: Record<
  DepartmentReferenceErrorCode,
  { message: string; status: 404 | 409 | 422 }
> = {
  NOT_FOUND: { message: 'Подразделение не найдено', status: 404 },
  DEPARTMENT_REQUIRED: { message: 'Подразделение обязательно', status: 422 },
  INACTIVE_DEPARTMENT: { message: 'Нельзя назначить неактивное подразделение', status: 409 },
}
```

<a id="mapper-02b4d49c8c"></a>
### getEmployeeRouteErrorMeta

[src/features/employees/application/error-mapping.ts:3](../../src/features/employees/application/error-mapping.ts#L3)

```ts
getEmployeeRouteErrorMeta = (error: unknown) => {
  if (!(error instanceof ServiceError)) return null
  switch (error.code) {
    case 'POSITION_REQUIRED': return { status: 400, error: 'Должность из штатного расписания обязательна' }
    case 'POSITION_NOT_FOUND': return { status: 404, error: 'Должность из штатного расписания не найдена' }
    case 'EMPLOYEE_NOT_FOUND': return { status: 404, error: 'Сотрудник не найден' }
    case 'INSUFFICIENT_POSITION_RATE': return { status: 400, error: 'Недостаточно свободных ставок по выбранной должности' }
    case 'INACTIVE_POSITION_DEPARTMENT': return { status: 409, error: 'Подразделение выбранной должности неактивно' }
    case 'INVALID_EMPLOYMENT_RATE': return { status: 400, error: 'Количество ставок сотрудника должно быть больше нуля' }
    case 'INVALID_CONTRACT_DATE_RANGE': return { status: 400, error: 'Дата подписания договора должна быть раньше срока действия договора' }
    case 'INVALID_CONTRACT_DATE': return { status: 400, error: 'Некорректная дата договора' }
    default: return null
  }
}
```

<a id="mapper-45975a9e99"></a>
### mapEmployeeError

[src/app/api/employees/route.ts:17](../../src/app/api/employees/route.ts#L17)

```ts
function mapEmployeeError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return apiError('EMPLOYEE_CODE_EXISTS', 'Сотрудник с таким табельным номером уже существует', 409)
  }
  const routeError = getEmployeeRouteErrorMeta(error)
  return routeError ? apiError('EMPLOYEE_DOMAIN_ERROR', routeError.error, routeError.status) : null
}
```

[src/features/employees/application/error-mapping.ts:3](../../src/features/employees/application/error-mapping.ts#L3)

```ts
getEmployeeRouteErrorMeta = (error: unknown) => {
  if (!(error instanceof ServiceError)) return null
  switch (error.code) {
    case 'POSITION_REQUIRED': return { status: 400, error: 'Должность из штатного расписания обязательна' }
    case 'POSITION_NOT_FOUND': return { status: 404, error: 'Должность из штатного расписания не найдена' }
    case 'EMPLOYEE_NOT_FOUND': return { status: 404, error: 'Сотрудник не найден' }
    case 'INSUFFICIENT_POSITION_RATE': return { status: 400, error: 'Недостаточно свободных ставок по выбранной должности' }
    case 'INACTIVE_POSITION_DEPARTMENT': return { status: 409, error: 'Подразделение выбранной должности неактивно' }
    case 'INVALID_EMPLOYMENT_RATE': return { status: 400, error: 'Количество ставок сотрудника должно быть больше нуля' }
    case 'INVALID_CONTRACT_DATE_RANGE': return { status: 400, error: 'Дата подписания договора должна быть раньше срока действия договора' }
    case 'INVALID_CONTRACT_DATE': return { status: 400, error: 'Некорректная дата договора' }
    default: return null
  }
}
```

<a id="mapper-fa2f3c2ad5"></a>
### financePlanError

[src/features/finance/domain/finance-plan.ts:24](../../src/features/finance/domain/finance-plan.ts#L24)

```ts
financePlanError = (code: FinancePlanErrorCode) => new ServiceError(code)
```

<a id="mapper-f85cd1f049"></a>
### getFinancePlanErrorMeta

[src/features/finance/application/finance-plan.service.ts:52](../../src/features/finance/application/finance-plan.service.ts#L52)

```ts
getFinancePlanErrorMeta = (error: unknown) => {
  if (!(error instanceof ServiceError)) {
    return null
  }

  switch (error.code) {
    case 'INVALID_EMPLOYEE_SELECTION':
      return { status: 400, error: 'Employee is no longer available for planning' }
    case 'PROJECT_NOT_FOUND':
      return { status: 404, error: 'Project not found' }
    case 'PROJECT_REQUIRED':
      return { status: 400, error: 'Выберите проект' }
    case 'INVALID_OKLAD_AMOUNT':
      return { status: 400, error: 'Для сотрудника не задан оклад' }
    case 'INVALID_FINANCE_AMOUNT':
      return { status: 400, error: 'Введите сумму больше нуля' }
    case 'INVALID_ALLOCATIONS':
      return { status: 400, error: 'Добавьте хотя бы одно начисление' }
    case 'PAYROLL_PERIOD_CLOSED':
      return { status: 409, error: 'Расчётный месяц закрыт' }
    default:
      return null
  }
}
```

<a id="mapper-893d6ee441"></a>
### isPrismaError

[src/features/assets/application/catalog.service.ts:12](../../src/features/assets/application/catalog.service.ts#L12)

```ts
function isPrismaError(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
}
```

<a id="mapper-8b30972318"></a>
### catalogError

[src/app/api/groups/[id]/route.ts:7](../../src/app/api/groups/%5Bid%5D/route.ts#L7)

```ts
catalogError = (error: CatalogServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'Группа не найдена', 404)
  : error.code === 'CODE_EXISTS'
    ? apiError(error.code, 'Группа с таким кодом уже существует', 409)
    : apiError(error.code, 'Группа используется объектами имущества', 409)
```

<a id="mapper-78a450d1b9"></a>
### catalogError

[src/app/api/mols/[id]/route.ts:12](../../src/app/api/mols/%5Bid%5D/route.ts#L12)

```ts
catalogError = (error: CatalogServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'МОЛ не найден', 404)
  : error.code === 'CODE_EXISTS'
    ? apiError(error.code, 'МОЛ с таким кодом уже существует', 409)
    : apiError(error.code, 'МОЛ используется в остатках или истории имущества', 409)
```

<a id="mapper-c6411e183e"></a>
### notificationApiError

[src/features/notifications/application/http.ts:4](../../src/features/notifications/application/http.ts#L4)

```ts
export function notificationApiError(error: unknown) {
  if (error instanceof NotificationServiceError && error.code === 'NOT_FOUND') {
    return apiError('NOT_FOUND', 'Уведомление не найдено', 404)
  }
  throw error
}
```

<a id="mapper-6381d81c16"></a>
### errorMessage

[src/features/notifications/application/alert-runner.ts:56](../../src/features/notifications/application/alert-runner.ts#L56)

```ts
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : 'UNKNOWN_ERROR'
}
```

<a id="mapper-1eb9b0a5b6"></a>
### payrollApiError

[src/features/finance/application/payroll-http.ts:4](../../src/features/finance/application/payroll-http.ts#L4)

```ts
export function payrollApiError(error: unknown) {
  if (!(error instanceof PayrollError)) throw error
  if (error.code === 'ADJUSTMENT_NOT_FOUND') {
    return apiError(error.code, 'Выплата не найдена', 404)
  }
  return apiError(error.code, 'Месяц закрыт для изменений', 409)
}
```

<a id="mapper-38f0e7ccac"></a>
### getPersonnelActionRouteErrorMeta

[src/features/employees/application/error-mapping.ts:18](../../src/features/employees/application/error-mapping.ts#L18)

```ts
getPersonnelActionRouteErrorMeta = (error: unknown) => {
  if (!(error instanceof ServiceError)) return null
  switch (error.code) {
    case 'EMPLOYEE_NOT_FOUND': return { status: 404, error: 'Сотрудник не найден' }
    case 'INVALID_HIRE_PAYLOAD': return { status: 400, error: 'Отсутствуют обязательные поля для приема на работу' }
    case 'POSITION_REQUIRED': return { status: 400, error: 'Должность из штатного расписания обязательна' }
    case 'POSITION_NOT_FOUND': return { status: 404, error: 'Должность из штатного расписания не найдена' }
    case 'INVALID_EMPLOYMENT_RATE': return { status: 400, error: 'Количество ставок сотрудника должно быть больше нуля' }
    case 'INSUFFICIENT_POSITION_RATE': return { status: 400, error: 'Недостаточно свободных ставок по выбранной должности' }
    case 'INACTIVE_POSITION_DEPARTMENT': return { status: 409, error: 'Подразделение выбранной должности неактивно' }
    case 'MISSING_EMPLOYEE_ID': return { status: 400, error: 'Сотрудник обязателен для этого действия' }
    case 'MISSING_CONTRACT_END_DATE': return { status: 400, error: 'Новая дата окончания контракта обязательна' }
    case 'INVALID_CONTRACT_DATE': return { status: 400, error: 'Некорректная дата договора' }
    case 'INVALID_ACTION_DATE': return { status: 400, error: 'Некорректная дата кадрового действия' }
    case 'INVALID_CONTRACT_DATE_RANGE': return { status: 400, error: 'Дата подписания договора должна быть раньше срока действия договора' }
    default: return null
  }
}
```

<a id="mapper-7044e41e93"></a>
### procurementApiError

[src/features/procurement/application/http.ts:13](../../src/features/procurement/application/http.ts#L13)

```ts
export function procurementApiError(error: unknown) {
  if (!(error instanceof ProcurementError)) throw error
  const [code, message, status] = errors[error.code]
  return apiError(code, message, status)
}
```

[src/features/procurement/application/http.ts:4](../../src/features/procurement/application/http.ts#L4)

```ts
errors = {
  NOT_FOUND: ['PROCUREMENT_NOT_FOUND', 'Закупка или её этап не найдены', 404],
  INVALID_STATE: ['INVALID_PROCUREMENT_STATE', 'Действие недоступно на текущем этапе закупки', 409],
  REFERENCE_NOT_FOUND: ['REFERENCE_NOT_FOUND', 'Связанный объект не найден', 422],
  BUDGET_EXCEEDED: ['BUDGET_EXCEEDED', 'Сумма договора превышает бюджетный лимит', 409],
  DELIVERY_EXCEEDED: ['DELIVERY_EXCEEDED', 'Количество поставки превышает остаток по заявке', 409],
  ALREADY_CAPITALIZED: ['ALREADY_CAPITALIZED', 'Позиция уже поставлена на учёт', 409],
} as const
```

<a id="mapper-e4592378ad"></a>
### projectMemberError

[src/features/projects/application/project-member.service.ts:11](../../src/features/projects/application/project-member.service.ts#L11)

```ts
projectMemberError = (code: ProjectMemberErrorCode) => new ServiceError(code)
```

<a id="mapper-40ec4c20c6"></a>
### getProjectMemberErrorMeta

[src/features/projects/application/project-member.service.ts:115](../../src/features/projects/application/project-member.service.ts#L115)

```ts
getProjectMemberErrorMeta = (error: unknown) => {
  if (!(error instanceof ServiceError)) {
    return null
  }

  switch (error.code) {
    case 'PROJECT_NOT_FOUND':
      return { status: 404, error: 'Проект не найден' }
    case 'EMPLOYEE_NOT_FOUND':
      return { status: 404, error: 'Сотрудник не найден' }
    case 'EMPLOYEE_DISMISSED':
      return { status: 400, error: 'Нельзя добавить уволенного сотрудника' }
    case 'PROJECT_MEMBER_NOT_FOUND':
      return { status: 404, error: 'Участник проекта не найден' }
    default:
      return null
  }
}
```

<a id="mapper-86de139b10"></a>
### projectPayrollError

[src/features/finance/application/project-payroll.service.ts:42](../../src/features/finance/application/project-payroll.service.ts#L42)

```ts
projectPayrollError = (code: ProjectPayrollErrorCode) => new ServiceError(code)
```

<a id="mapper-495934dbef"></a>
### getProjectPayrollErrorMeta

[src/features/finance/application/project-payroll.service.ts:101](../../src/features/finance/application/project-payroll.service.ts#L101)

```ts
getProjectPayrollErrorMeta = (error: unknown) => {
  if (!(error instanceof ServiceError)) {
    return null
  }

  switch (error.code) {
    case 'PROJECT_NOT_FOUND':
      return { status: 404, error: 'Проект не найден' }
    case 'PROJECT_MEMBER_NOT_FOUND':
      return { status: 404, error: 'Сотрудник не найден в составе проекта' }
    case 'INVALID_NADBAVKA_AMOUNT':
      return { status: 400, error: 'Введите корректную сумму надбавки' }
    case 'INVALID_OKLAD_AMOUNT':
      return { status: 400, error: 'Для сотрудника не задан оклад в составе проекта' }
    case 'PAYROLL_PERIOD_CLOSED':
      return { status: 409, error: 'Расчётный месяц закрыт' }
    default:
      return null
  }
}
```

<a id="mapper-8ec90f8ee5"></a>
### mapError

[src/app/api/staff-schedule/[id]/route.ts:12](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L12)

```ts
mapError = (error: WorkforceServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'Должность не найдена', 404)
  : error.code === 'POSITION_DEPARTMENT_CHANGE_IN_USE'
    ? apiError(error.code, 'Нельзя изменить подразделение должности с назначенными сотрудниками', 409)
  : apiError(error.code, error.code === 'POSITION_IN_USE'
    ? 'Нельзя удалить должность с назначенными сотрудниками'
    : 'Нельзя уменьшить количество ставок ниже занятого значения', 409)
```

<a id="mapper-61f03e8359"></a>
### mapDepartmentError

[src/app/api/staff-schedule/route.ts:12](../../src/app/api/staff-schedule/route.ts#L12)

```ts
function mapDepartmentError(error: DepartmentReferenceError) {
  const meta = getDepartmentReferenceErrorMeta(error.code)
  return apiError(error.code, meta.message, meta.status)
}
```

<a id="mapper-21178c39a1"></a>
### mapError

[src/app/api/tasks/[id]/route.ts:8](../../src/app/api/tasks/%5Bid%5D/route.ts#L8)

```ts
mapError = (error: TaskServiceError) => apiError(
  error.code,
  error.message,
  error.code === 'TASK_NOT_FOUND' ? 404 : 422,
)
```

<a id="mapper-9eba8a037c"></a>
### timekeepingApiError

[src/features/timekeeping/application/http.ts:4](../../src/features/timekeeping/application/http.ts#L4)

```ts
export function timekeepingApiError(error: unknown) {
  if (!(error instanceof TimekeepingError)) throw error
  if (error.code === 'NOT_FOUND') return apiError('NOT_FOUND', 'Запись табеля не найдена', 404)
  if (error.code === 'FORBIDDEN') return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  if (error.code === 'TIMESHEET_DECISION_FORBIDDEN') {
    return apiError(error.code, 'Утверждать табель может только руководитель по маршруту согласования', 403)
  }
  if (error.code === 'PERIOD_CLOSED') {
    return apiError(error.code, 'Расчётный месяц закрыт', 409)
  }
  if (error.code === 'TIMESHEET_LOCKED') {
    return apiError(error.code, 'Отправленный или утверждённый табель заблокирован', 409)
  }
  if (error.code === 'TIMESHEET_STATE_INVALID') {
    return apiError(error.code, 'Табель уже обработан или не ожидает решения', 409)
  }
  if (error.code === 'ZERO_HOURS_CONFIRMATION_REQUIRED') {
    return apiError(error.code, 'Подтвердите, что за месяц нет часов', 422)
  }
  if (error.code === 'CORRECTION_REASON_REQUIRED') {
    return apiError(error.code, 'Для изменения утверждённого табеля укажите причину корректировки', 422)
  }
  if (error.code === 'APPROVAL_REASON_REQUIRED') {
    return apiError(error.code, 'Для этого решения необходимо указать причину', 422)
  }
  if (error.code === 'PAYROLL_TIMESHEETS_PENDING') {
    return apiError(error.code, 'Сначала утвердите табели всех сотрудников', 409)
  }
  if (error.code === 'DAILY_HOURS_EXCEEDED') {
    return apiError('DAILY_HOURS_EXCEEDED', 'За один день нельзя указать больше 24 часов', 409)
  }
  return apiError('INVALID_REFERENCE', 'Сотрудник, проект или задача не найдены', 400)
}
```

<a id="mapper-adbd9c641f"></a>
### mapError

[src/app/api/vacations/[id]/route.ts:8](../../src/app/api/vacations/%5Bid%5D/route.ts#L8)

```ts
mapError = (error: WorkforceServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'Отпуск не найден', 404)
  : apiError(error.code, 'Некорректные даты отпуска', 422)
```

## Развёрнутые входные схемы и зависимости

Здесь оставлены точные Zod expressions из текущего кода: min/max, nullable/optional, defaults, coercion, regex, strict, preprocess/transform/refine/superRefine. Определение derived schema читается вместе с её linked dependencies. Сервисные правила и permissions не заменяются этими схемами. Native Prisma enums развёрнуты из schema.prisma.

<a id="schema-3f4985fa7d"></a>
### ApprovalRequestStatus — prisma/schema.prisma

[prisma/schema.prisma:536](../../prisma/schema.prisma#L536)

```prisma
enum ApprovalRequestStatus {
  DRAFT
  PENDING
  APPROVED
  REJECTED
  CANCELLED

  @@map("approval_request_status")
}
```

<a id="schema-ba9b6f5d47"></a>
### AssetMaintenanceStatus — prisma/schema.prisma

[prisma/schema.prisma:169](../../prisma/schema.prisma#L169)

```prisma
enum AssetMaintenanceStatus {
  PLANNED
  IN_PROGRESS
  COMPLETED
  CANCELED

  @@map("asset_maintenance_status")
}
```

<a id="schema-5e3e4519bc"></a>
### AssetMaintenanceType — prisma/schema.prisma

[prisma/schema.prisma:160](../../prisma/schema.prisma#L160)

```prisma
enum AssetMaintenanceType {
  INSPECTION
  CALIBRATION
  REPAIR
  SERVICE

  @@map("asset_maintenance_type")
}
```

<a id="schema-a9cfefa659"></a>
### DocumentCategory — prisma/schema.prisma

[prisma/schema.prisma:1328](../../prisma/schema.prisma#L1328)

```prisma
enum DocumentCategory {
  GENERAL
  CONTRACT
  ORDER
  ACT
  INVOICE
  PERSONNEL
  PROJECT
  ASSET
  OTHER

  @@map("document_category")
}
```

<a id="schema-cbbf8a645e"></a>
### DocumentStatus — prisma/schema.prisma

[prisma/schema.prisma:1318](../../prisma/schema.prisma#L1318)

```prisma
enum DocumentStatus {
  DRAFT
  IN_REVIEW
  APPROVED
  SIGNED
  ARCHIVED

  @@map("document_status")
}
```

<a id="schema-fb7b18904d"></a>
### NotificationChannel — prisma/schema.prisma

[prisma/schema.prisma:448](../../prisma/schema.prisma#L448)

```prisma
enum NotificationChannel {
  IN_APP
  EMAIL

  @@map("notification_channel")
}
```

<a id="schema-984509cf8b"></a>
### NotificationEventType — prisma/schema.prisma

[prisma/schema.prisma:435](../../prisma/schema.prisma#L435)

```prisma
enum NotificationEventType {
  SYSTEM
  APPROVAL_REQUESTED
  APPROVAL_DECIDED
  CONTRACT_EXPIRING
  TASK_OVERDUE
  ASSET_DISPOSAL_DUE
  ASSET_MAINTENANCE_DUE
  BUDGET_OVERRUN

  @@map("notification_event_type")
}
```

<a id="schema-c9a8a6bc75"></a>
### PayrollAdjustmentType — prisma/schema.prisma

[prisma/schema.prisma:1178](../../prisma/schema.prisma#L1178)

```prisma
enum PayrollAdjustmentType {
  BONUS
  ONE_TIME
  DEDUCTION

  @@map("payroll_adjustment_type")
}
```

<a id="schema-18b0be929e"></a>
### PayrollPeriodStatus — prisma/schema.prisma

[prisma/schema.prisma:1186](../../prisma/schema.prisma#L1186)

```prisma
enum PayrollPeriodStatus {
  OPEN
  CLOSED

  @@map("payroll_period_status")
}
```

<a id="schema-c8dd90874c"></a>
### ProcurementStatus — prisma/schema.prisma

[prisma/schema.prisma:679](../../prisma/schema.prisma#L679)

```prisma
enum ProcurementStatus {
  DRAFT
  SUBMITTED
  APPROVED
  CONTRACTED
  PARTIALLY_DELIVERED
  DELIVERED
  CAPITALIZED
  REJECTED
  CANCELLED

  @@map("procurement_status")
}
```

<a id="schema-a6e4a147b3"></a>
### TimeEntryType — prisma/schema.prisma

[prisma/schema.prisma:1078](../../prisma/schema.prisma#L1078)

```prisma
enum TimeEntryType {
  REGULAR
  VACATION
  SICK_LEAVE
  BUSINESS_TRIP
  OVERTIME

  @@map("time_entry_type")
}
```

<a id="schema-f7779812ff"></a>
### querySchema — src/app/api/documents/[id]/download/route.ts

[src/app/api/documents/[id]/download/route.ts:16](../../src/app/api/documents/%5Bid%5D/download/route.ts#L16)

```ts
querySchema = z.object({
  version: z.coerce.number().int().positive().optional(),
})
```

<a id="schema-deedfbdc22"></a>
### querySchema — src/app/api/employees/route.ts

[src/app/api/employees/route.ts:11](../../src/app/api/employees/route.ts#L11)

```ts
querySchema = z.object({
  scope: z.enum(['active', 'archive', 'expired', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})
```

<a id="schema-57e59401cd"></a>
### yearSchema — src/app/api/finance/salary/route.ts

[src/app/api/finance/salary/route.ts:9](../../src/app/api/finance/salary/route.ts#L9)

```ts
yearSchema = z.coerce.number().int().min(2000).max(2100)
```

<a id="schema-f267578cd6"></a>
### smtpSettingsSchema — src/app/api/notifications/smtp/route.ts

[src/app/api/notifications/smtp/route.ts:7](../../src/app/api/notifications/smtp/route.ts#L7)

```ts
smtpSettingsSchema = z.object({
  host: z.string().trim().min(1),
  port: z.coerce.number().int().positive(),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  secure: z.boolean().default(false),
  fromEmail: z.string().email(),
})
```

<a id="schema-6e9a1aaf1c"></a>
### smtpTestSchema — src/app/api/notifications/smtp/test/route.ts

[src/app/api/notifications/smtp/test/route.ts:7](../../src/app/api/notifications/smtp/test/route.ts#L7)

```ts
smtpTestSchema = z.object({
  host: z.string().trim().min(1),
  port: z.coerce.number().int().positive(),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  secure: z.boolean().default(false),
  fromEmail: z.string().email(),
})
```

<a id="schema-9a62e4b4cb"></a>
### payslipQuerySchema — src/app/api/payroll/export-payslip/route.ts

[src/app/api/payroll/export-payslip/route.ts:8](../../src/app/api/payroll/export-payslip/route.ts#L8)

```ts
payslipQuerySchema = z.object({
  year: z.coerce.number().int().positive(),
  month: z.coerce.number().int().min(1).max(12),
  employeeId: z.string().min(1),
})
```

<a id="schema-9cb53482ce"></a>
### querySchema — src/app/api/personnel-actions/route.ts

[src/app/api/personnel-actions/route.ts:13](../../src/app/api/personnel-actions/route.ts#L13)

```ts
querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})
```

<a id="schema-01ff8ae0de"></a>
### querySchema — src/app/api/projects/route.ts

[src/app/api/projects/route.ts:8](../../src/app/api/projects/route.ts#L8)

```ts
querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
})
```

<a id="schema-1a4a5a6a6d"></a>
### querySchema — src/app/api/reports/custom/route.ts

[src/app/api/reports/custom/route.ts:9](../../src/app/api/reports/custom/route.ts#L9)

```ts
querySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departmentId: z.string().optional(),
  projectId: z.string().optional(),
})
```

<a id="schema-0c1e9cf445"></a>
### querySchema — src/app/api/reports/depreciation/route.ts

[src/app/api/reports/depreciation/route.ts:7](../../src/app/api/reports/depreciation/route.ts#L7)

```ts
querySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departmentId: z.string().optional(),
})
```

<a id="schema-38bfb9013e"></a>
### querySchema — src/app/api/reports/profitability/route.ts

[src/app/api/reports/profitability/route.ts:7](../../src/app/api/reports/profitability/route.ts#L7)

```ts
querySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  projectId: z.string().optional(),
})
```

<a id="schema-8a3008dcdb"></a>
### querySchema — src/app/api/reports/turnover/route.ts

[src/app/api/reports/turnover/route.ts:7](../../src/app/api/reports/turnover/route.ts#L7)

```ts
querySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departmentId: z.string().optional(),
})
```

<a id="schema-04014003c4"></a>
### querySchema — src/app/api/reports/vacations/route.ts

[src/app/api/reports/vacations/route.ts:7](../../src/app/api/reports/vacations/route.ts#L7)

```ts
querySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departmentId: z.string().optional(),
})
```

<a id="schema-6a30e581db"></a>
### yearSchema — src/app/api/vacations/route.ts

[src/app/api/vacations/route.ts:9](../../src/app/api/vacations/route.ts#L9)

```ts
yearSchema = z.coerce.number().int().min(2000).max(2200)
```

<a id="schema-77864056a6"></a>
### approvalDecisionSchema — src/features/approvals/contracts/approval.ts

[src/features/approvals/contracts/approval.ts:36](../../src/features/approvals/contracts/approval.ts#L36)

```ts
approvalDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  comment: z.string().trim().max(2000).nullable().optional(),
})
```

<a id="schema-1665b20e13"></a>
### approvalQuerySchema — src/features/approvals/contracts/approval.ts

[src/features/approvals/contracts/approval.ts:71](../../src/features/approvals/contracts/approval.ts#L71)

Зависимости: [ApprovalRequestStatus](#schema-3f4985fa7d).

```ts
approvalQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.nativeEnum(ApprovalRequestStatus).optional(),
  search: z.string().trim().max(200).optional(),
  assignedToMe: z.coerce.boolean().optional(),
})
```

<a id="schema-e46d49f4b8"></a>
### approvalTemplateRouteSchema — src/features/approvals/contracts/approval.ts

[src/features/approvals/contracts/approval.ts:46](../../src/features/approvals/contracts/approval.ts#L46)

Зависимости: [approvalTemplateStepSchema](#schema-1870da720e).

```ts
approvalTemplateRouteSchema = z.array(approvalTemplateStepSchema).min(1).max(20)
  .superRefine((steps, context) => {
    const approvers = new Set(steps.map((step) => step.approverId))
    if (approvers.size !== steps.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'Согласующий не должен повторяться',
      })
    }
  })
```

<a id="schema-1870da720e"></a>
### approvalTemplateStepSchema — src/features/approvals/contracts/approval.ts

[src/features/approvals/contracts/approval.ts:41](../../src/features/approvals/contracts/approval.ts#L41)

```ts
approvalTemplateStepSchema = z.object({
  approverId: z.string().trim().min(1).max(128),
  name: z.string().trim().min(2).max(120),
})
```

<a id="schema-c8054f23e4"></a>
### createApprovalSchema — src/features/approvals/contracts/approval.ts

[src/features/approvals/contracts/approval.ts:6](../../src/features/approvals/contracts/approval.ts#L6)

Зависимости: [optionalId](#schema-ba9d1e5a83).

```ts
createApprovalSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  documentId: optionalId,
  projectId: optionalId,
  entityType: z.string().trim().max(80).nullable().optional(),
  entityId: optionalId,
  dueAt: z.coerce.date().nullable().optional(),
  steps: z.array(z.object({
    approverId: z.string().trim().min(1).max(128),
    name: z.string().trim().min(2).max(120),
  })).min(1).max(20),
}).superRefine((value, context) => {
  const approvers = new Set(value.steps.map((step) => step.approverId))
  if (approvers.size !== value.steps.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['steps'],
      message: 'Согласующий не должен повторяться',
    })
  }
  if (value.dueAt && value.dueAt <= new Date()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dueAt'],
      message: 'Срок должен быть в будущем',
    })
  }
})
```

<a id="schema-f00e0d03f4"></a>
### createApprovalTemplateSchema — src/features/approvals/contracts/approval.ts

[src/features/approvals/contracts/approval.ts:58](../../src/features/approvals/contracts/approval.ts#L58)

Зависимости: [approvalTemplateRouteSchema](#schema-e46d49f4b8).

```ts
createApprovalTemplateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  steps: approvalTemplateRouteSchema,
})
```

<a id="schema-ba9d1e5a83"></a>
### optionalId — src/features/approvals/contracts/approval.ts

[src/features/approvals/contracts/approval.ts:4](../../src/features/approvals/contracts/approval.ts#L4)

```ts
optionalId = z.string().trim().min(1).max(128).nullable().optional()
```

<a id="schema-9e751cd8f3"></a>
### updateApprovalTemplateSchema — src/features/approvals/contracts/approval.ts

[src/features/approvals/contracts/approval.ts:63](../../src/features/approvals/contracts/approval.ts#L63)

Зависимости: [approvalTemplateRouteSchema](#schema-e46d49f4b8).

```ts
updateApprovalTemplateSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  steps: approvalTemplateRouteSchema.optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'Укажите хотя бы одно поле для изменения',
})
```

<a id="schema-c68b44d8cc"></a>
### MAX_ASSET_IMPORT_ROWS — src/features/assets/contracts/asset-import.ts

[src/features/assets/contracts/asset-import.ts:5](../../src/features/assets/contracts/asset-import.ts#L5)

```ts
MAX_ASSET_IMPORT_ROWS = 100
```

<a id="schema-1f323000b9"></a>
### assetImportCommitSchema — src/features/assets/contracts/asset-import.ts

[src/features/assets/contracts/asset-import.ts:67](../../src/features/assets/contracts/asset-import.ts#L67)

Зависимости: [importAssetSchema](#schema-8ddaca8bf1), [MAX_ASSET_IMPORT_ROWS](#schema-c68b44d8cc).

```ts
assetImportCommitSchema = z.object({
  assets: z.array(importAssetSchema).min(1).max(MAX_ASSET_IMPORT_ROWS),
}).strict()
```

<a id="schema-8ddaca8bf1"></a>
### importAssetSchema — src/features/assets/contracts/asset-import.ts

[src/features/assets/contracts/asset-import.ts:8](../../src/features/assets/contracts/asset-import.ts#L8)

Зависимости: [createAssetSchema](#schema-eecb5d4b27).

```ts
importAssetSchema = createAssetSchema
  .omit({
    projectId: true,
    status: true,
    documentFiles: true,
    plannedDisposalDate: true,
    plannedDisposalReason: true,
    photos: true,
  })
  .superRefine((input, context) => {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.recordingDate)
    const date = dateMatch
      ? new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])))
      : null
    if (!dateMatch || !date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.recordingDate) {
      context.addIssue({ code: 'custom', path: ['recordingDate'], message: 'Укажите корректную дату в формате ГГГГ-ММ-ДД' })
    }
    const unitPrice = input.unitPrice
    const quantity = input.quantity
    if (Number(unitPrice.toFixed(2)) !== unitPrice) {
      context.addIssue({ code: 'custom', path: ['unitPrice'], message: 'Допустимо не более двух знаков после запятой' })
    }
    if (Number(quantity.toFixed(2)) !== quantity) {
      context.addIssue({ code: 'custom', path: ['quantity'], message: 'Допустимо не более двух знаков после запятой' })
    }
    if (unitPrice > 99_999_999.99) {
      context.addIssue({ code: 'custom', path: ['unitPrice'], message: 'Цена превышает допустимый предел' })
    }
    if (quantity > 99_999_999.99) {
      context.addIssue({ code: 'custom', path: ['quantity'], message: 'Количество превышает допустимый предел' })
    }
    if (unitPrice * quantity > 9_999_999_999.99) {
      context.addIssue({ code: 'custom', path: ['unitPrice'], message: 'Итоговая стоимость превышает допустимый предел' })
    }
  })
  .transform((input) => ({
    ...input,
    inventoryNumber: input.inventoryNumber.trim(),
    name: input.name.trim(),
    unitOfMeasure: input.unitOfMeasure.trim(),
    molId: input.molId.trim(),
    groupId: input.groupId.trim(),
    documentType: input.documentType.trim(),
    documentDetails: input.documentDetails.trim(),
    contractCode: input.contractCode?.trim(),
    internalFundingCode: input.internalFundingCode?.trim(),
    notes: input.notes?.trim(),
  }))
  .pipe(createAssetSchema)
  .transform((input) => ({
    ...input,
    projectId: null,
    status: 'IN_STOCK' as const,
    documentFiles: [],
    plannedDisposalDate: null,
    plannedDisposalReason: null,
    photos: [],
  }))
```

<a id="schema-586a726670"></a>
### assetInventoryEntriesQuerySchema — src/features/assets/contracts/inventory.ts

[src/features/assets/contracts/inventory.ts:22](../../src/features/assets/contracts/inventory.ts#L22)

```ts
assetInventoryEntriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(120).optional(),
})
```

<a id="schema-46736f1d7b"></a>
### assetInventoryListQuerySchema — src/features/assets/contracts/inventory.ts

[src/features/assets/contracts/inventory.ts:17](../../src/features/assets/contracts/inventory.ts#L17)

```ts
assetInventoryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
```

<a id="schema-16da03d912"></a>
### createAssetInventorySchema — src/features/assets/contracts/inventory.ts

[src/features/assets/contracts/inventory.ts:3](../../src/features/assets/contracts/inventory.ts#L3)

```ts
createAssetInventorySchema = z.object({
  name: z.string().trim().min(3).max(120),
  molId: z.string().trim().min(1).max(128),
})
```

<a id="schema-1958d2cb6a"></a>
### recordAssetInventoryCountSchema — src/features/assets/contracts/inventory.ts

[src/features/assets/contracts/inventory.ts:8](../../src/features/assets/contracts/inventory.ts#L8)

```ts
recordAssetInventoryCountSchema = z.object({
  inventoryNumber: z.string().trim().min(1).max(100),
  foundQuantity: z.coerce.number().finite().min(0).max(99_999_999.99)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, {
      message: 'Количество может содержать не более двух знаков после запятой',
    }),
  note: z.string().trim().max(1000).nullable().optional(),
})
```

<a id="schema-541dd306b2"></a>
### createMaintenanceSchema — src/features/assets/contracts/maintenance.ts

[src/features/assets/contracts/maintenance.ts:4](../../src/features/assets/contracts/maintenance.ts#L4)

Зависимости: [AssetMaintenanceType](#schema-5e3e4519bc).

```ts
createMaintenanceSchema = z.object({
  type: z.nativeEnum(AssetMaintenanceType),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  scheduledDate: z.coerce.date(),
  nextDueDate: z.coerce.date().nullable().optional(),
  provider: z.string().trim().max(200).nullable().optional(),
  cost: z.coerce.number().min(0).default(0),
})
```

<a id="schema-d7d4c1c92f"></a>
### updateMaintenanceSchema — src/features/assets/contracts/maintenance.ts

[src/features/assets/contracts/maintenance.ts:14](../../src/features/assets/contracts/maintenance.ts#L14)

Зависимости: [AssetMaintenanceStatus](#schema-ba9b6f5d47).

```ts
updateMaintenanceSchema = z.object({
  status: z.nativeEnum(AssetMaintenanceStatus).optional(),
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  scheduledDate: z.coerce.date().optional(),
  startedAt: z.coerce.date().nullable().optional(),
  completedAt: z.coerce.date().nullable().optional(),
  nextDueDate: z.coerce.date().nullable().optional(),
  provider: z.string().trim().max(200).nullable().optional(),
  cost: z.coerce.number().min(0).optional(),
  result: z.string().trim().max(1000).nullable().optional(),
}).strict()
```

<a id="schema-8aec9ce6fa"></a>
### assetSavedViewFiltersSchema — src/features/assets/contracts/saved-view.ts

[src/features/assets/contracts/saved-view.ts:3](../../src/features/assets/contracts/saved-view.ts#L3)

```ts
assetSavedViewFiltersSchema = z.object({
  search: z.string().trim().max(200).optional().transform((value) => value || undefined),
  molId: z.string().trim().min(1).max(128).optional(),
  groupId: z.string().trim().min(1).max(128).optional(),
  status: z.enum([
    'IN_STOCK',
    'IN_USE',
    'UNDER_REPAIR',
    'PLANNED_FOR_DISPOSAL',
    'PARTIALLY_DISPOSED',
    'FULLY_DISPOSED',
  ]).optional(),
  accountingForm: z.enum(['145', '367']).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict().refine(
  (value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo,
  { path: ['dateTo'], message: 'Дата окончания должна быть не раньше даты начала' },
)
```

<a id="schema-46e0b80a66"></a>
### createAssetSavedViewSchema — src/features/assets/contracts/saved-view.ts

[src/features/assets/contracts/saved-view.ts:23](../../src/features/assets/contracts/saved-view.ts#L23)

Зависимости: [assetSavedViewFiltersSchema](#schema-8aec9ce6fa).

```ts
createAssetSavedViewSchema = z.object({
  name: z.string().trim().min(1).max(80),
  filters: assetSavedViewFiltersSchema,
})
```

<a id="schema-4b102f2d43"></a>
### archiveAssetSchema — src/features/assets/contracts/schemas.ts

[src/features/assets/contracts/schemas.ts:70](../../src/features/assets/contracts/schemas.ts#L70)

```ts
archiveAssetSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
})
```

<a id="schema-a9481ccf7f"></a>
### assetsQuerySchema — src/features/assets/contracts/schemas.ts

[src/features/assets/contracts/schemas.ts:79](../../src/features/assets/contracts/schemas.ts#L79)

```ts
assetsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  molId: z.string().optional(),
  groupId: z.string().optional(),
  status: z.enum([
    'IN_STOCK', 'IN_USE', 'UNDER_REPAIR',
    'PLANNED_FOR_DISPOSAL', 'PARTIALLY_DISPOSED', 'FULLY_DISPOSED',
  ]).optional(),
  accountingForm: z.enum(['145', '367']).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  archived: z.enum(['true', 'false']).transform((value) => value === 'true').default('false'),
}).refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
  path: ['dateTo'],
  message: 'Дата окончания должна быть не раньше даты начала',
})
```

<a id="schema-eecb5d4b27"></a>
### createAssetSchema — src/features/assets/contracts/schemas.ts

[src/features/assets/contracts/schemas.ts:3](../../src/features/assets/contracts/schemas.ts#L3)

```ts
createAssetSchema = z.object({
  name: z.string().min(1, 'Наименование обязательно').max(500),
  inventoryNumber: z.string().min(1, 'Инвентарный номер обязателен').max(100),
  unitPrice: z.coerce.number().positive('Цена должна быть больше нуля'),
  unitOfMeasure: z.string().min(1, 'Единица измерения обязательна').max(50),
  quantity: z.coerce.number().positive('Количество должно быть больше нуля'),
  molId: z.string().min(1, 'МОЛ обязателен'),
  groupId: z.string().min(1, 'Группа обязательна'),
  projectId: z.string().nullable().optional(),
  contractCode: z.string().max(100).optional(),
  internalFundingCode: z.string().max(100).optional(),
  isExistingAsset: z.boolean().optional().default(false),
  recordingDate: z.string().min(1, 'Дата поступления обязательна'),
  documentType: z.string().min(1, 'Тип документа обязателен').max(200),
  documentDetails: z.string().min(1, 'Данные документа обязательны').max(500),
  documentFiles: z.array(z.string()).optional().default([]),
  status: z.enum([
    'IN_STOCK', 'IN_USE', 'UNDER_REPAIR',
    'PLANNED_FOR_DISPOSAL', 'PARTIALLY_DISPOSED', 'FULLY_DISPOSED',
  ]).optional().default('IN_STOCK'),
  notes: z.string().max(2000).optional().nullable(),
  plannedDisposalDate: z.string().optional().nullable(),
  plannedDisposalReason: z.string().max(500).optional().nullable(),
  photos: z.array(z.string()).optional().default([]),
  accountingForm: z.enum(['145', '367']).optional().default('145'),
})
```

<a id="schema-bb3e7c7416"></a>
### createGroupSchema — src/features/assets/contracts/schemas.ts

[src/features/assets/contracts/schemas.ts:42](../../src/features/assets/contracts/schemas.ts#L42)

```ts
createGroupSchema = z.object({
  name: z.string().min(1, 'Наименование обязательно').max(200),
  code: z.string().min(1, 'Код обязателен').max(50),
  description: z.string().max(500).optional().nullable(),
})
```

<a id="schema-8c5db32cb4"></a>
### createMolSchema — src/features/assets/contracts/schemas.ts

[src/features/assets/contracts/schemas.ts:30](../../src/features/assets/contracts/schemas.ts#L30)

```ts
createMolSchema = z.object({
  code: z.string().min(1, 'Код МОЛ обязателен').max(50),
  departmentId: z.string().trim().min(1).max(100).optional(),
  department: z.string().trim().min(1, 'Подразделение обязательно').max(200).optional(),
  fullName: z.string().min(1, 'ФИО обязательно').max(200),
  storageLocation: z.string().min(1, 'Место хранения обязательно').max(300),
  photo: z.string().optional().nullable(),
}).refine((value) => value.departmentId || value.department, {
  path: ['departmentId'],
  message: 'Подразделение обязательно',
})
```

<a id="schema-e5e4a0e51e"></a>
### disposeAssetSchema — src/features/assets/contracts/schemas.ts

[src/features/assets/contracts/schemas.ts:65](../../src/features/assets/contracts/schemas.ts#L65)

Зависимости: [operationDocumentSchema](#schema-5d28c4a88e).

```ts
disposeAssetSchema = operationDocumentSchema.extend({
  fromMolId: z.string().min(1),
  quantity: z.coerce.number().positive(),
})
```

<a id="schema-5d28c4a88e"></a>
### operationDocumentSchema — src/features/assets/contracts/schemas.ts

[src/features/assets/contracts/schemas.ts:48](../../src/features/assets/contracts/schemas.ts#L48)

```ts
operationDocumentSchema = z.object({
  date: z.coerce.date(),
  documentType: z.string().trim().min(1).max(200),
  documentDetails: z.string().trim().min(1).max(500),
  reason: z.string().trim().max(1000).optional().nullable(),
  documentFiles: z.array(z.string()).max(50).optional().default([]),
})
```

<a id="schema-b8c72ab68e"></a>
### operationsQuerySchema — src/features/assets/contracts/schemas.ts

[src/features/assets/contracts/schemas.ts:98](../../src/features/assets/contracts/schemas.ts#L98)

```ts
operationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  assetId: z.string().optional(),
  type: z.enum(['RECEIPT', 'TRANSFER', 'DISPOSAL', 'STATUS_CHANGE']).optional(),
})
```

<a id="schema-43de7964ad"></a>
### transferAssetSchema — src/features/assets/contracts/schemas.ts

[src/features/assets/contracts/schemas.ts:56](../../src/features/assets/contracts/schemas.ts#L56)

Зависимости: [operationDocumentSchema](#schema-5d28c4a88e).

```ts
transferAssetSchema = operationDocumentSchema.extend({
  fromMolId: z.string().min(1),
  toMolId: z.string().min(1),
  quantity: z.coerce.number().positive(),
}).refine((value) => value.fromMolId !== value.toMolId, {
  path: ['toMolId'],
  message: 'Получатель должен отличаться от отправителя',
})
```

<a id="schema-23a9c957af"></a>
### updateAssetSchema — src/features/assets/contracts/schemas.ts

[src/features/assets/contracts/schemas.ts:74](../../src/features/assets/contracts/schemas.ts#L74)

Зависимости: [createAssetSchema](#schema-eecb5d4b27).

```ts
updateAssetSchema = createAssetSchema.extend({
  editReason: z.string().trim().min(3, 'Основание редактирования обязательно').max(1000),
  isArchived: z.boolean().optional(),
})
```

<a id="schema-feffe27de4"></a>
### createDepartmentSchema — src/features/departments/contracts/schemas.ts

[src/features/departments/contracts/schemas.ts:20](../../src/features/departments/contracts/schemas.ts#L20)

Зависимости: [departmentFields](#schema-584c6e83a8).

```ts
createDepartmentSchema = z.object(departmentFields)
```

<a id="schema-584c6e83a8"></a>
### departmentFields — src/features/departments/contracts/schemas.ts

[src/features/departments/contracts/schemas.ts:8](../../src/features/departments/contracts/schemas.ts#L8)

Зависимости: [nullableId](#schema-d13589a250).

```ts
departmentFields = {
  code: z.string()
    .trim()
    .min(1, 'Код подразделения обязателен')
    .max(50)
    .regex(/^[\p{L}\p{N}._-]+$/u, 'Код может содержать буквы, цифры, точку, дефис и подчёркивание'),
  name: z.string().trim().min(1, 'Название подразделения обязательно').max(200),
  parentId: nullableId,
  headEmployeeId: nullableId,
  isActive: z.boolean().default(true),
}
```

<a id="schema-325b28d603"></a>
### departmentsQuerySchema — src/features/departments/contracts/schemas.ts

[src/features/departments/contracts/schemas.ts:32](../../src/features/departments/contracts/schemas.ts#L32)

```ts
departmentsQuerySchema = z.object({
  activeOnly: z.enum(['true', 'false']).transform((value) => value === 'true').default('false'),
})
```

<a id="schema-d13589a250"></a>
### nullableId — src/features/departments/contracts/schemas.ts

[src/features/departments/contracts/schemas.ts:3](../../src/features/departments/contracts/schemas.ts#L3)

```ts
nullableId = z.preprocess(
  (value) => value === '' ? null : value,
  z.string().trim().min(1).max(100).nullable().optional(),
)
```

<a id="schema-c1166dfc00"></a>
### updateDepartmentSchema — src/features/departments/contracts/schemas.ts

[src/features/departments/contracts/schemas.ts:22](../../src/features/departments/contracts/schemas.ts#L22)

Зависимости: [departmentFields](#schema-584c6e83a8).

```ts
updateDepartmentSchema = z.object({
  code: departmentFields.code.optional(),
  name: departmentFields.name.optional(),
  parentId: departmentFields.parentId,
  headEmployeeId: departmentFields.headEmployeeId,
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'Укажите хотя бы одно изменяемое поле',
})
```

<a id="schema-1a18d19622"></a>
### addDocumentVersionMetadataSchema — src/features/documents/contracts/document.ts

[src/features/documents/contracts/document.ts:24](../../src/features/documents/contracts/document.ts#L24)

```ts
addDocumentVersionMetadataSchema = z.object({
  filename: z.string().min(1).max(1024),
  comment: z.string().trim().max(500).optional(),
  lockVersion: z.coerce.number().int().positive(),
})
```

<a id="schema-85d1f910db"></a>
### archiveDocumentSchema — src/features/documents/contracts/document.ts

[src/features/documents/contracts/document.ts:40](../../src/features/documents/contracts/document.ts#L40)

```ts
archiveDocumentSchema = z.object({
  lockVersion: z.coerce.number().int().positive(),
})
```

<a id="schema-abfd3c45bd"></a>
### changeDocumentStatusSchema — src/features/documents/contracts/document.ts

[src/features/documents/contracts/document.ts:30](../../src/features/documents/contracts/document.ts#L30)

```ts
changeDocumentStatusSchema = z.object({
  status: z.enum([
    DocumentStatus.DRAFT,
    DocumentStatus.IN_REVIEW,
    DocumentStatus.APPROVED,
    DocumentStatus.SIGNED,
  ]),
  lockVersion: z.coerce.number().int().positive(),
})
```

<a id="schema-af84638cd0"></a>
### createDocumentMetadataSchema — src/features/documents/contracts/document.ts

[src/features/documents/contracts/document.ts:14](../../src/features/documents/contracts/document.ts#L14)

Зависимости: [documentCategorySchema](#schema-8edd9afc48), [optionalId](#schema-082e7b1596).

```ts
createDocumentMetadataSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  category: documentCategorySchema.default(DocumentCategory.GENERAL),
  projectId: optionalId,
  employeeId: optionalId,
  assetId: optionalId,
  filename: z.string().min(1).max(1024),
})
```

<a id="schema-8edd9afc48"></a>
### documentCategorySchema — src/features/documents/contracts/document.ts

[src/features/documents/contracts/document.ts:11](../../src/features/documents/contracts/document.ts#L11)

Зависимости: [DocumentCategory](#schema-a9cfefa659).

```ts
documentCategorySchema = z.nativeEnum(DocumentCategory)
```

<a id="schema-3b4cf87b5e"></a>
### documentStatusSchema — src/features/documents/contracts/document.ts

[src/features/documents/contracts/document.ts:12](../../src/features/documents/contracts/document.ts#L12)

Зависимости: [DocumentStatus](#schema-cbbf8a645e).

```ts
documentStatusSchema = z.nativeEnum(DocumentStatus)
```

<a id="schema-c18f905739"></a>
### documentsQuerySchema — src/features/documents/contracts/document.ts

[src/features/documents/contracts/document.ts:58](../../src/features/documents/contracts/document.ts#L58)

Зависимости: [documentStatusSchema](#schema-3b4cf87b5e), [documentCategorySchema](#schema-8edd9afc48), [optionalId](#schema-082e7b1596).

```ts
documentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  status: documentStatusSchema.optional(),
  category: documentCategorySchema.optional(),
  projectId: optionalId,
  employeeId: optionalId,
  assetId: optionalId,
  archived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default('false'),
})
```

<a id="schema-bb598bdbac"></a>
### generateDocumentSchema — src/features/documents/contracts/document.ts

[src/features/documents/contracts/document.ts:44](../../src/features/documents/contracts/document.ts#L44)

Зависимости: [optionalId](#schema-082e7b1596).

```ts
generateDocumentSchema = z.object({
  template: z.enum(['PERSONNEL_ORDER', 'ACCEPTANCE_ACT']),
  title: z.string().trim().min(1).max(200),
  number: z.string().trim().min(1).max(50),
  date: z.coerce.date(),
  subject: z.string().trim().min(1).max(500),
  details: z.string().trim().min(1).max(5000),
  basis: z.string().trim().max(1000).optional(),
  projectId: optionalId,
  employeeId: optionalId,
  assetId: optionalId,
  format: z.enum(['docx', 'pdf']).default('docx').optional(),
})
```

<a id="schema-082e7b1596"></a>
### optionalId — src/features/documents/contracts/document.ts

[src/features/documents/contracts/document.ts:4](../../src/features/documents/contracts/document.ts#L4)

```ts
optionalId = z
  .union([
    z.string().trim().min(1).max(100),
    z.literal('').transform(() => undefined),
  ])
  .optional()
```

<a id="schema-1ab6ecc3f1"></a>
### contractTypeSchema — src/features/employees/contracts/employee.ts

[src/features/employees/contracts/employee.ts:4](../../src/features/employees/contracts/employee.ts#L4)

```ts
contractTypeSchema = z.enum(['PRIMARY', 'INTERNAL', 'EXTERNAL'])
```

<a id="schema-89da721e7c"></a>
### employeeSchema — src/features/employees/contracts/employee.ts

[src/features/employees/contracts/employee.ts:6](../../src/features/employees/contracts/employee.ts#L6)

Зависимости: [contractTypeSchema](#schema-1ab6ecc3f1), [employeeStatusSchema](#schema-9d63ecd6c9).

```ts
employeeSchema = z.object({
  code: z.string().min(1, 'Табельный номер обязателен').max(50),
  fullName: z.string().min(1, 'ФИО обязательно').max(200),
  department: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email('Некорректный email').max(200).optional().nullable().or(z.literal('')),
  photo: z.string().optional().nullable(),
  contractType: contractTypeSchema.optional().default('PRIMARY'),
  contractSignedDate: z.coerce.date({
    errorMap: () => ({ message: 'Некорректная дата подписания договора' })
  }),
  contractEndDate: z.preprocess((val) => (val === '' || val === null ? undefined : val), z.coerce.date().optional()),
  contractNumber: z.string().min(1, 'Номер договора обязателен').max(100),
  staffScheduleId: z.string().optional().nullable(),
  employmentRate: z.coerce.number().min(0, 'Количество ставок не может быть отрицательным'),
  status: employeeStatusSchema.optional().default('ACTIVE'),
})
```

<a id="schema-9d63ecd6c9"></a>
### employeeStatusSchema — src/features/employees/contracts/employee.ts

[src/features/employees/contracts/employee.ts:3](../../src/features/employees/contracts/employee.ts#L3)

```ts
employeeStatusSchema = z.enum(['ACTIVE', 'ON_VACATION', 'ON_SICK_LEAVE', 'DISMISSED'])
```

<a id="schema-86946c61bb"></a>
### updateEmployeeSchema — src/features/employees/contracts/employee.ts

[src/features/employees/contracts/employee.ts:28](../../src/features/employees/contracts/employee.ts#L28)

Зависимости: [employeeSchema](#schema-89da721e7c).

```ts
updateEmployeeSchema = employeeSchema.partial().extend({
  // Some fields might still be mandatory for update or have specific constraints
  id: z.string().optional(),
})
```

<a id="schema-8a90f64a14"></a>
### employeeProfileSchema — src/features/employees/contracts/profile.ts

[src/features/employees/contracts/profile.ts:6](../../src/features/employees/contracts/profile.ts#L6)

Зависимости: [optionalText](#schema-46a461a28f).

```ts
employeeProfileSchema = z.object({
  birthDate: z.string().date().nullable().optional(),
  education: optionalText(1000),
  qualification: optionalText(1000),
  managerId: z.string().trim().min(1).max(128).nullable().optional(),
  skills: z.array(z.object({
    name: z.string().trim().min(2).max(100),
    level: z.coerce.number().int().min(1).max(5).nullable().optional(),
  })).max(50),
  certificates: z.array(z.object({
    name: z.string().trim().min(2).max(160),
    issuer: optionalText(160),
    number: optionalText(100),
    issuedAt: z.string().date().nullable().optional(),
    expiresAt: z.string().date().nullable().optional(),
  })).max(50),
}).superRefine((value, context) => {
  const names = new Set<string>()
  value.skills.forEach((skill, index) => {
    const key = skill.name.toLocaleLowerCase('ru-RU')
    if (names.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Навык указан повторно',
        path: ['skills', index, 'name'],
      })
    }
    names.add(key)
  })
  value.certificates.forEach((certificate, index) => {
    if (
      certificate.issuedAt
      && certificate.expiresAt
      && certificate.expiresAt < certificate.issuedAt
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Срок действия не может быть раньше даты выдачи',
        path: ['certificates', index, 'expiresAt'],
      })
    }
  })
})
```

<a id="schema-46a461a28f"></a>
### optionalText — src/features/employees/contracts/profile.ts

[src/features/employees/contracts/profile.ts:3](../../src/features/employees/contracts/profile.ts#L3)

```ts
optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional()
```

<a id="schema-a6214717c1"></a>
### createEmployeeSchema — src/features/employees/contracts/schemas.ts

[src/features/employees/contracts/schemas.ts:3](../../src/features/employees/contracts/schemas.ts#L3)

```ts
createEmployeeSchema = z.object({
  code: z.string().min(1, 'Табельный номер обязателен').max(50),
  fullName: z.string().min(1, 'ФИО обязательно').max(200),
  department: z.string().max(200).optional(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email('Некорректный email').max(200).optional().nullable().or(z.literal('')),
  photo: z.string().optional().nullable(),
  contractType: z.enum(['PRIMARY', 'INTERNAL', 'EXTERNAL']).optional().default('PRIMARY'),
  contractSignedDate: z.string().min(1, 'Дата подписания договора обязательна'),
  contractEndDate: z.string().optional().nullable(),
  contractNumber: z.string().min(1, 'Номер договора обязателен').max(100),
  staffScheduleId: z.string().min(1, 'Должность обязательна'),
  employmentRate: z.coerce.number().positive('Количество ставок должно быть больше нуля'),
  hireDescription: z.string().max(500).optional(),
})
```

<a id="schema-45d79d466a"></a>
### createPersonnelActionSchema — src/features/employees/contracts/schemas.ts

[src/features/employees/contracts/schemas.ts:37](../../src/features/employees/contracts/schemas.ts#L37)

```ts
createPersonnelActionSchema = z.object({
  type: z.enum(['HIRE', 'DISMISS', 'ARCHIVE', 'TRANSFER', 'EXTEND', 'PROMOTE', 'EDIT']),
  date: z.string().min(1, 'Дата действия обязательна'),
  description: z.string().max(2000).optional().nullable(),
  employeeId: z.string().optional().nullable(),
  employeeData: z.any().optional(),
  staffScheduleId: z.string().optional().nullable(),
  employmentRate: z.coerce.number().optional().nullable(),
  newDepartment: z.string().optional().nullable(),
  newPosition: z.string().optional().nullable(),
  newContractEndDate: z.string().optional().nullable(),
})
```

<a id="schema-554fd88c9f"></a>
### createStaffScheduleSchema — src/features/employees/contracts/schemas.ts

[src/features/employees/contracts/schemas.ts:19](../../src/features/employees/contracts/schemas.ts#L19)

```ts
createStaffScheduleSchema = z.object({
  position: z.string().min(1, 'Название должности обязательно').max(200),
  departmentId: z.string().trim().min(1).max(100).optional(),
  department: z.string().trim().min(1, 'Подразделение обязательно').max(200).optional(),
  rate: z.coerce.number().positive('Количество ставок должно быть больше нуля'),
  salary: z.coerce.number().min(0, 'Оклад не может быть отрицательным'),
}).refine((value) => value.departmentId || value.department, {
  path: ['departmentId'],
  message: 'Подразделение обязательно',
})
```

<a id="schema-125c70cae7"></a>
### createVacationSchema — src/features/employees/contracts/schemas.ts

[src/features/employees/contracts/schemas.ts:30](../../src/features/employees/contracts/schemas.ts#L30)

```ts
createVacationSchema = z.object({
  employeeId: z.string().min(1, 'Сотрудник обязателен'),
  startDate: z.string().min(1, 'Дата начала обязательна'),
  endDate: z.string().min(1, 'Дата окончания обязательна'),
  type: z.enum(['VACATION', 'SICK_LEAVE', 'BUSINESS_TRIP', 'UNPAID_LEAVE']).default('VACATION'),
})
```

<a id="schema-6da8828987"></a>
### financePlanDeleteSchema — src/features/finance/contracts/finance-plan.ts

[src/features/finance/contracts/finance-plan.ts:20](../../src/features/finance/contracts/finance-plan.ts#L20)

Зависимости: [financePlanTypeSchema](#schema-7239a8dceb).

```ts
financePlanDeleteSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  type: financePlanTypeSchema,
  employeeId: z.string().min(1, 'Employee is required'),
})
```

<a id="schema-22081a1b79"></a>
### financePlanSaveSchema — src/features/finance/contracts/finance-plan.ts

[src/features/finance/contracts/finance-plan.ts:5](../../src/features/finance/contracts/finance-plan.ts#L5)

Зависимости: [financePlanTypeSchema](#schema-7239a8dceb).

```ts
financePlanSaveSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  type: financePlanTypeSchema,
  employeeId: z.string().min(1, 'Employee is required'),
  projectId: z.string().optional(),
  amount: z.string().optional(),
  allocations: z.array(
    z.object({
      projectId: z.string().optional(),
      amount: z.string().optional(),
    })
  ).optional(),
})
```

<a id="schema-7239a8dceb"></a>
### financePlanTypeSchema — src/features/finance/contracts/finance-plan.ts

[src/features/finance/contracts/finance-plan.ts:3](../../src/features/finance/contracts/finance-plan.ts#L3)

```ts
financePlanTypeSchema = z.enum(['oklad', 'nadbavka'])
```

<a id="schema-464cc99baf"></a>
### createPayrollAdjustmentSchema — src/features/finance/contracts/payroll.ts

[src/features/finance/contracts/payroll.ts:9](../../src/features/finance/contracts/payroll.ts#L9)

Зависимости: [PayrollAdjustmentType](#schema-c9a8a6bc75).

```ts
createPayrollAdjustmentSchema = z.object({
  employeeId: z.string().cuid(),
  projectId: z.string().cuid().nullable().optional(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  type: z.nativeEnum(PayrollAdjustmentType),
  amount: z.coerce.number().positive(),
  description: z.string().trim().min(2).max(500),
})
```

<a id="schema-082e23116b"></a>
### payrollPeriodSchema — src/features/finance/contracts/payroll.ts

[src/features/finance/contracts/payroll.ts:19](../../src/features/finance/contracts/payroll.ts#L19)

Зависимости: [payrollQuerySchema](#schema-41bbae37c4), [PayrollPeriodStatus](#schema-18b0be929e).

```ts
payrollPeriodSchema = payrollQuerySchema.extend({
  status: z.nativeEnum(PayrollPeriodStatus),
  reason: z.string().trim().min(3).max(500).optional(),
})
```

<a id="schema-41bbae37c4"></a>
### payrollQuerySchema — src/features/finance/contracts/payroll.ts

[src/features/finance/contracts/payroll.ts:4](../../src/features/finance/contracts/payroll.ts#L4)

```ts
payrollQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})
```

<a id="schema-277a06d382"></a>
### projectPayrollDeleteSchema — src/features/finance/contracts/project-payroll.ts

[src/features/finance/contracts/project-payroll.ts:11](../../src/features/finance/contracts/project-payroll.ts#L11)

```ts
projectPayrollDeleteSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  employeeId: z.string().min(1, 'Сотрудник обязателен'),
})
```

<a id="schema-65e830dc06"></a>
### projectPayrollSaveSchema — src/features/finance/contracts/project-payroll.ts

[src/features/finance/contracts/project-payroll.ts:3](../../src/features/finance/contracts/project-payroll.ts#L3)

```ts
projectPayrollSaveSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  employeeId: z.string().min(1, 'Сотрудник обязателен'),
  okladEnabled: z.boolean(),
  nadbavkaAmount: z.string().optional(),
})
```

<a id="schema-202d2259ec"></a>
### booleanQuery — src/features/notifications/contracts/notification.ts

[src/features/notifications/contracts/notification.ts:4](../../src/features/notifications/contracts/notification.ts#L4)

```ts
booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true')
```

<a id="schema-2c652a86d4"></a>
### notificationPreferencesSchema — src/features/notifications/contracts/notification.ts

[src/features/notifications/contracts/notification.ts:16](../../src/features/notifications/contracts/notification.ts#L16)

Зависимости: [NotificationEventType](#schema-984509cf8b), [NotificationChannel](#schema-fb7b18904d).

```ts
notificationPreferencesSchema = z.object({
  preferences: z.array(z.object({
    eventType: z.nativeEnum(NotificationEventType),
    channel: z.nativeEnum(NotificationChannel),
    enabled: z.boolean(),
  }).strict()).max(20),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>()
  value.preferences.forEach((preference, index) => {
    const key = `${preference.eventType}:${preference.channel}`
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Настройка канала указана повторно',
        path: ['preferences', index],
      })
    }
    seen.add(key)
  })
})
```

<a id="schema-97654639a9"></a>
### notificationStateSchema — src/features/notifications/contracts/notification.ts

[src/features/notifications/contracts/notification.ts:12](../../src/features/notifications/contracts/notification.ts#L12)

```ts
notificationStateSchema = z.object({
  read: z.boolean(),
}).strict()
```

<a id="schema-1c56423d38"></a>
### notificationsQuerySchema — src/features/notifications/contracts/notification.ts

[src/features/notifications/contracts/notification.ts:6](../../src/features/notifications/contracts/notification.ts#L6)

Зависимости: [booleanQuery](#schema-202d2259ec).

```ts
notificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: booleanQuery.default('false'),
})
```

<a id="schema-81ae034f98"></a>
### capitalizeDeliveryItemSchema — src/features/procurement/contracts/procurement.ts

[src/features/procurement/contracts/procurement.ts:108](../../src/features/procurement/contracts/procurement.ts#L108)

Зависимости: [optionalId](#schema-500d5d7732).

```ts
capitalizeDeliveryItemSchema = z.object({
  inventoryNumber: z.string().trim().min(1).max(100),
  molId: z.string().trim().min(1).max(100),
  groupId: optionalId,
  accountingForm: z.enum(['145', '367']).default('145'),
  notes: z.string().trim().max(2000).nullable().optional(),
})
```

<a id="schema-8d37f20298"></a>
### contractSchema — src/features/procurement/contracts/procurement.ts

[src/features/procurement/contracts/procurement.ts:85](../../src/features/procurement/contracts/procurement.ts#L85)

Зависимости: [date](#schema-7c0115e168), [optionalId](#schema-500d5d7732).

```ts
contractSchema = z.object({
  supplierId: z.string().trim().min(1).max(100),
  number: z.string().trim().min(2).max(100),
  amount: z.coerce.number().positive().max(10_000_000_000),
  signedAt: date,
  deliveryDueAt: date,
  documentId: optionalId,
}).refine((value) => value.deliveryDueAt >= value.signedAt, {
  path: ['deliveryDueAt'],
  message: 'Срок поставки не может быть раньше даты договора',
})
```

<a id="schema-0a3c8ee903"></a>
### createProcurementSchema — src/features/procurement/contracts/procurement.ts

[src/features/procurement/contracts/procurement.ts:40](../../src/features/procurement/contracts/procurement.ts#L40)

Зависимости: [procurementFieldsSchema](#schema-d7797b9b43), [withinBudget](#schema-0b830bcd0e).

```ts
createProcurementSchema = procurementFieldsSchema.superRefine(withinBudget)
```

<a id="schema-7c0115e168"></a>
### date — src/features/procurement/contracts/procurement.ts

[src/features/procurement/contracts/procurement.ts:5](../../src/features/procurement/contracts/procurement.ts#L5)

```ts
date = z.coerce.date()
```

<a id="schema-8d6495d6cb"></a>
### deliverySchema — src/features/procurement/contracts/procurement.ts

[src/features/procurement/contracts/procurement.ts:97](../../src/features/procurement/contracts/procurement.ts#L97)

Зависимости: [date](#schema-7c0115e168), [optionalId](#schema-500d5d7732).

```ts
deliverySchema = z.object({
  number: z.string().trim().min(1).max(100),
  receivedAt: date,
  note: z.string().trim().max(1000).nullable().optional(),
  documentId: optionalId,
  items: z.array(z.object({
    procurementItemId: z.string().trim().min(1).max(100),
    quantity: z.coerce.number().positive().max(1_000_000),
  })).min(1).max(50),
})
```

<a id="schema-27e50f7096"></a>
### isValidRussianINN — src/features/procurement/contracts/procurement.ts

[src/features/procurement/contracts/procurement.ts:51](../../src/features/procurement/contracts/procurement.ts#L51)

```ts
export function isValidRussianINN(inn: string): boolean {
  if (!/^\d{10}$|^\d{12}$/.test(inn)) {
    return false
  }
  const digits = inn.split('').map(Number)
  if (digits.length === 10) {
    const coefficients = [2, 4, 10, 3, 5, 9, 4, 6, 8]
    const sum = coefficients.reduce((acc, coef, idx) => acc + coef * digits[idx], 0)
    const checkDigit = (sum % 11) % 10
    return checkDigit === digits[9]
  } else if (digits.length === 12) {
    const coefficients11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
    const sum11 = coefficients11.reduce((acc, coef, idx) => acc + coef * digits[idx], 0)
    const checkDigit11 = (sum11 % 11) % 10

    const coefficients12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
    const sum12 = coefficients12.reduce((acc, coef, idx) => acc + coef * digits[idx], 0)
    const checkDigit12 = (sum12 % 11) % 10
    return checkDigit11 === digits[10] && checkDigit12 === digits[11]
  }
  return false
}
```

<a id="schema-500d5d7732"></a>
### optionalId — src/features/procurement/contracts/procurement.ts

[src/features/procurement/contracts/procurement.ts:4](../../src/features/procurement/contracts/procurement.ts#L4)

```ts
optionalId = z.string().trim().min(1).max(100).nullable().optional()
```

<a id="schema-d7797b9b43"></a>
### procurementFieldsSchema — src/features/procurement/contracts/procurement.ts

[src/features/procurement/contracts/procurement.ts:15](../../src/features/procurement/contracts/procurement.ts#L15)

Зависимости: [date](#schema-7c0115e168), [optionalId](#schema-500d5d7732), [procurementItemSchema](#schema-853899c100).

```ts
procurementFieldsSchema = z.object({
  number: z.string().trim().min(2).max(80),
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().max(2000).nullable().optional(),
  budgetLimit: z.coerce.number().positive().max(10_000_000_000),
  neededBy: date.nullable().optional(),
  projectId: optionalId,
  documentId: optionalId,
  items: z.array(procurementItemSchema).min(1).max(50),
})
```

<a id="schema-853899c100"></a>
### procurementItemSchema — src/features/procurement/contracts/procurement.ts

[src/features/procurement/contracts/procurement.ts:7](../../src/features/procurement/contracts/procurement.ts#L7)

Зависимости: [optionalId](#schema-500d5d7732).

```ts
procurementItemSchema = z.object({
  name: z.string().trim().min(2).max(300),
  quantity: z.coerce.number().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(30),
  unitPrice: z.coerce.number().positive().max(1_000_000_000),
  groupId: optionalId,
})
```

<a id="schema-8236f07e92"></a>
### procurementQuerySchema — src/features/procurement/contracts/procurement.ts

[src/features/procurement/contracts/procurement.ts:116](../../src/features/procurement/contracts/procurement.ts#L116)

Зависимости: [ProcurementStatus](#schema-c8dd90874c).

```ts
procurementQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  status: z.nativeEnum(ProcurementStatus).optional(),
})
```

<a id="schema-5e0524c8aa"></a>
### submitProcurementSchema — src/features/procurement/contracts/procurement.ts

[src/features/procurement/contracts/procurement.ts:43](../../src/features/procurement/contracts/procurement.ts#L43)

Зависимости: [date](#schema-7c0115e168).

```ts
submitProcurementSchema = z.object({
  dueAt: date.nullable().optional(),
  steps: z.array(z.object({
    name: z.string().trim().min(2).max(120),
    approverId: z.string().trim().min(1).max(100),
  })).min(1).max(10),
})
```

<a id="schema-ecc20b73be"></a>
### supplierSchema — src/features/procurement/contracts/procurement.ts

[src/features/procurement/contracts/procurement.ts:74](../../src/features/procurement/contracts/procurement.ts#L74)

Зависимости: [isValidRussianINN](#schema-27e50f7096).

```ts
supplierSchema = z.object({
  name: z.string().trim().min(2).max(300),
  taxId: z.string().trim().regex(/^\d{10}(\d{2})?$/, 'ИНН должен содержать 10 или 12 цифр')
    .nullable()
    .optional()
    .refine((val) => !val || isValidRussianINN(val), 'Некорректная контрольная сумма ИНН'),
  email: z.string().trim().email().max(200).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
})
```

<a id="schema-3cc0e15e9b"></a>
### updateProcurementSchema — src/features/procurement/contracts/procurement.ts

[src/features/procurement/contracts/procurement.ts:41](../../src/features/procurement/contracts/procurement.ts#L41)

Зависимости: [procurementFieldsSchema](#schema-d7797b9b43), [withinBudget](#schema-0b830bcd0e).

```ts
updateProcurementSchema = procurementFieldsSchema.omit({ number: true }).superRefine(withinBudget)
```

<a id="schema-0b830bcd0e"></a>
### withinBudget — src/features/procurement/contracts/procurement.ts

[src/features/procurement/contracts/procurement.ts:26](../../src/features/procurement/contracts/procurement.ts#L26)

```ts
withinBudget = (
  value: { budgetLimit: number; items: Array<{ quantity: number; unitPrice: number }> },
  ctx: z.RefinementCtx,
) => {
  const total = value.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  if (total > value.budgetLimit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['budgetLimit'],
      message: 'Стоимость позиций превышает бюджетный лимит',
    })
  }
}
```

<a id="schema-cfa2561536"></a>
### projectMemberCreateSchema — src/features/projects/contracts/project-members.ts

[src/features/projects/contracts/project-members.ts:3](../../src/features/projects/contracts/project-members.ts#L3)

```ts
projectMemberCreateSchema = z.object({
  employeeId: z.string({ required_error: 'Сотрудник обязателен' }).min(1, 'Сотрудник обязателен'),
})
```

<a id="schema-1485fd5b1f"></a>
### projectMemberUpdateSchema — src/features/projects/contracts/project-members.ts

[src/features/projects/contracts/project-members.ts:7](../../src/features/projects/contracts/project-members.ts#L7)

```ts
projectMemberUpdateSchema = z.object({
  isArchived: z.boolean(),
})
```

<a id="schema-c3af2619f1"></a>
### createProjectSchema — src/features/projects/contracts/project.ts

[src/features/projects/contracts/project.ts:3](../../src/features/projects/contracts/project.ts#L3)

```ts
createProjectSchema = z.object({
  code: z.string().min(1, 'Код проекта обязателен').max(50),
  name: z.string().min(1, 'Название проекта обязательно').max(300),
  description: z.string().max(2000).optional().nullable(),
  goals: z.string().max(2000).optional().nullable(),
  tasks: z.string().max(2000).optional().nullable(),
  results: z.string().max(2000).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional().default('ACTIVE'),
  plannedBudget: z.coerce.number().min(0).optional().default(0),
  actualBudget: z.coerce.number().min(0).optional().default(0),
  templateId: z.enum(['RESEARCH', 'PROCUREMENT']).optional().nullable(),
}).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
  path: ['endDate'],
  message: 'Дата окончания должна быть не раньше даты начала',
})
```

<a id="schema-895f00ea6c"></a>
### checklistSchema — src/features/projects/contracts/task.ts

[src/features/projects/contracts/task.ts:17](../../src/features/projects/contracts/task.ts#L17)

```ts
checklistSchema = z.array(z.object({
  title: z.string().trim().min(1).max(200),
  completed: z.boolean().optional().default(false),
})).max(100)
```

<a id="schema-ff87d232c6"></a>
### createTaskCommentSchema — src/features/projects/contracts/task.ts

[src/features/projects/contracts/task.ts:56](../../src/features/projects/contracts/task.ts#L56)

```ts
createTaskCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
})
```

<a id="schema-477ad46873"></a>
### createTaskSchema — src/features/projects/contracts/task.ts

[src/features/projects/contracts/task.ts:22](../../src/features/projects/contracts/task.ts#L22)

Зависимости: [optionalDate](#schema-3c73646889), [employeeIdsSchema](#schema-75c7546b4b), [predecessorIdsSchema](#schema-a2a7200321), [checklistSchema](#schema-895f00ea6c).

```ts
createTaskSchema = z.object({
  name: z.string().min(1, 'Название задачи обязательно').max(300),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().default('MEDIUM'),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().default('LOW'),
  isMilestone: z.boolean().optional().default(false),
  level: z.coerce.number().int().min(1).max(3).optional().default(1),
  parentId: z.string().min(1).optional().nullable(),
  startDate: optionalDate,
  endDate: optionalDate,
  duration: z.coerce.number().int().min(0).optional().nullable(),
  progress: z.coerce.number().int().min(0).max(100).optional().default(0),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED']).optional().default('NOT_STARTED'),
  employeeIds: employeeIdsSchema,
  predecessorIds: predecessorIdsSchema,
  checklist: checklistSchema.optional().default([]),
})
```

<a id="schema-75c7546b4b"></a>
### employeeIdsSchema — src/features/projects/contracts/task.ts

[src/features/projects/contracts/task.ts:10](../../src/features/projects/contracts/task.ts#L10)

```ts
employeeIdsSchema = z.array(z.string().min(1)).optional().default([]).transform((value) => {
  return Array.from(new Set(value))
})
```

<a id="schema-3c73646889"></a>
### optionalDate — src/features/projects/contracts/task.ts

[src/features/projects/contracts/task.ts:3](../../src/features/projects/contracts/task.ts#L3)

```ts
optionalDate = z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
  if (!value) return null

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
})
```

<a id="schema-a2a7200321"></a>
### predecessorIdsSchema — src/features/projects/contracts/task.ts

[src/features/projects/contracts/task.ts:14](../../src/features/projects/contracts/task.ts#L14)

```ts
predecessorIdsSchema = z.array(z.string().min(1)).max(50).optional().default([])
  .transform((value) => Array.from(new Set(value)))
```

<a id="schema-a2b755c86a"></a>
### updateTaskSchema — src/features/projects/contracts/task.ts

[src/features/projects/contracts/task.ts:40](../../src/features/projects/contracts/task.ts#L40)

Зависимости: [optionalDate](#schema-3c73646889), [employeeIdsSchema](#schema-75c7546b4b), [predecessorIdsSchema](#schema-a2a7200321), [checklistSchema](#schema-895f00ea6c).

```ts
updateTaskSchema = z.object({
  name: z.string().min(1, 'Название задачи обязательно').max(300).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  isMilestone: z.boolean().optional(),
  startDate: optionalDate.optional(),
  endDate: optionalDate.optional(),
  duration: z.coerce.number().int().min(0).optional().nullable(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED']).optional(),
  employeeIds: employeeIdsSchema.optional(),
  predecessorIds: predecessorIdsSchema.optional(),
  checklist: checklistSchema.optional(),
})
```

<a id="schema-b84db7227c"></a>
### dashboardQuerySchema — src/features/reporting/contracts/dashboard.ts

[src/features/reporting/contracts/dashboard.ts:5](../../src/features/reporting/contracts/dashboard.ts#L5)

Зависимости: [isoDate](#schema-178e3f3abb).

```ts
dashboardQuerySchema = z.object({
  dateFrom: isoDate,
  dateTo: isoDate,
  departmentId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (value.dateFrom > value.dateTo) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dateTo'],
      message: 'Дата окончания должна быть не раньше даты начала',
    })
  }
})
```

<a id="schema-178e3f3abb"></a>
### isoDate — src/features/reporting/contracts/dashboard.ts

[src/features/reporting/contracts/dashboard.ts:3](../../src/features/reporting/contracts/dashboard.ts#L3)

```ts
isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
```

<a id="schema-e65278e80e"></a>
### REPORT_METRICS — src/features/reporting/contracts/report-presets.ts

[src/features/reporting/contracts/report-presets.ts:3](../../src/features/reporting/contracts/report-presets.ts#L3)

```ts
REPORT_METRICS = [
  'headcount',
  'occupiedRate',
  'plannedFot',
  'assetValue',
  'projectBudget',
  'actualFot',
] as const
```

<a id="schema-c5db04403d"></a>
### reportPresetSchema — src/features/reporting/contracts/report-presets.ts

[src/features/reporting/contracts/report-presets.ts:14](../../src/features/reporting/contracts/report-presets.ts#L14)

Зависимости: [REPORT_METRICS](#schema-e65278e80e).

```ts
reportPresetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  metrics: z.array(z.enum(REPORT_METRICS)).min(1),
  groupBy: z.enum(['department', 'project']).nullable().optional(),
  filters: z.record(z.any()).nullable().optional(),
})
```

<a id="schema-2ff1e8c68e"></a>
### globalSearchQuerySchema — src/features/search/contracts/search.ts

[src/features/search/contracts/search.ts:12](../../src/features/search/contracts/search.ts#L12)

```ts
globalSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Введите не менее двух символов').max(100, 'Запрос слишком длинный'),
})
```

<a id="schema-a6ac88e0f2"></a>
### createTimeEntrySchema — src/features/timekeeping/contracts/time-entry.ts

[src/features/timekeeping/contracts/time-entry.ts:11](../../src/features/timekeeping/contracts/time-entry.ts#L11)

Зависимости: [TimeEntryType](#schema-a6e4a147b3).

```ts
createTimeEntrySchema = z.object({
  employeeId: z.string().cuid(),
  projectId: z.string().cuid().nullable().optional(),
  taskId: z.string().cuid().nullable().optional(),
  workDate: z.coerce.date(),
  type: z.nativeEnum(TimeEntryType),
  hours: z.coerce.number().positive().max(24),
  note: z.string().trim().max(500).nullable().optional(),
  correctionReason: z.string().trim().min(3).max(500).optional(),
})
```

<a id="schema-baf8967b25"></a>
### payrollMonth — src/features/timekeeping/contracts/time-entry.ts

[src/features/timekeeping/contracts/time-entry.ts:28](../../src/features/timekeeping/contracts/time-entry.ts#L28)

```ts
payrollMonth = {
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
}
```

<a id="schema-173df884d4"></a>
### submitTimesheetSchema — src/features/timekeeping/contracts/time-entry.ts

[src/features/timekeeping/contracts/time-entry.ts:33](../../src/features/timekeeping/contracts/time-entry.ts#L33)

Зависимости: [payrollMonth](#schema-baf8967b25).

```ts
submitTimesheetSchema = z.object({
  employeeId: z.string().cuid(),
  ...payrollMonth,
  zeroHoursConfirmed: z.boolean().default(false),
})
```

<a id="schema-69766dc8be"></a>
### timeEntryDeleteSchema — src/features/timekeeping/contracts/time-entry.ts

[src/features/timekeeping/contracts/time-entry.ts:51](../../src/features/timekeeping/contracts/time-entry.ts#L51)

```ts
timeEntryDeleteSchema = z.object({
  correctionReason: z.string().trim().min(3).max(500).optional(),
}).default({})
```

<a id="schema-233b046031"></a>
### timeEntryQuerySchema — src/features/timekeeping/contracts/time-entry.ts

[src/features/timekeeping/contracts/time-entry.ts:4](../../src/features/timekeeping/contracts/time-entry.ts#L4)

```ts
timeEntryQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  employeeId: z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
})
```

<a id="schema-c6d89d5d98"></a>
### timesheetDecisionSchema — src/features/timekeeping/contracts/time-entry.ts

[src/features/timekeeping/contracts/time-entry.ts:39](../../src/features/timekeeping/contracts/time-entry.ts#L39)

```ts
timesheetDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'RETURN']),
  reason: z.string().trim().min(3).max(500).optional(),
}).superRefine((value, context) => {
  if (value.decision === 'RETURN' && !value.reason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Укажите причину возврата' })
  }
})
```

<a id="schema-4abcf11eb2"></a>
### updateTimeEntrySchema — src/features/timekeeping/contracts/time-entry.ts

[src/features/timekeeping/contracts/time-entry.ts:22](../../src/features/timekeeping/contracts/time-entry.ts#L22)

Зависимости: [createTimeEntrySchema](#schema-a6ac88e0f2).

```ts
updateTimeEntrySchema = createTimeEntrySchema.partial()
```

<a id="schema-ddd6b96ec9"></a>
### appRoleSchema — src/features/users/contracts/schemas.ts

[src/features/users/contracts/schemas.ts:4](../../src/features/users/contracts/schemas.ts#L4)

Зависимости: [APP_ROLES](#schema-0a71a6dde2).

```ts
appRoleSchema = z.enum(APP_ROLES)
```

<a id="schema-0d1f2131cf"></a>
### assignmentSchema — src/features/users/contracts/schemas.ts

[src/features/users/contracts/schemas.ts:7](../../src/features/users/contracts/schemas.ts#L7)

Зависимости: [appRoleSchema](#schema-ddd6b96ec9), [scopeModeSchema](#schema-534870e101).

```ts
assignmentSchema = z.object({
  role: appRoleSchema,
  departmentScopeMode: scopeModeSchema,
  projectScopeMode: scopeModeSchema,
  departmentIds: z.array(z.string().min(1)).default([]),
  projectIds: z.array(z.string().min(1)).default([]),
}).superRefine((assignment, context) => {
  if (assignment.departmentScopeMode === 'ASSIGNED' && assignment.departmentIds.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['departmentIds'],
      message: 'Выберите хотя бы одно подразделение',
    })
  }
  if (assignment.projectScopeMode === 'ASSIGNED' && assignment.projectIds.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectIds'],
      message: 'Выберите хотя бы один проект',
    })
  }
  if (assignment.departmentScopeMode !== 'ASSIGNED' && assignment.departmentIds.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['departmentIds'],
      message: 'Для этого режима список подразделений должен быть пуст',
    })
  }
  if (assignment.projectScopeMode !== 'ASSIGNED' && assignment.projectIds.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectIds'],
      message: 'Для этого режима список проектов должен быть пуст',
    })
  }
})
```

<a id="schema-5f8a4a15c0"></a>
### assignmentsSchema — src/features/users/contracts/schemas.ts

[src/features/users/contracts/schemas.ts:44](../../src/features/users/contracts/schemas.ts#L44)

Зависимости: [assignmentSchema](#schema-0d1f2131cf), [APP_ROLES](#schema-0a71a6dde2).

```ts
assignmentsSchema = z.array(assignmentSchema).min(1, 'Назначьте хотя бы одну роль').max(APP_ROLES.length)
  .superRefine((assignments, context) => {
    const seen = new Set<string>()
    assignments.forEach((assignment, index) => {
      if (seen.has(assignment.role)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'role'],
          message: 'Роль уже назначена',
        })
      }
      seen.add(assignment.role)
    })
  })
```

<a id="schema-a998fa6c6c"></a>
### changePasswordSchema — src/features/users/contracts/schemas.ts

[src/features/users/contracts/schemas.ts:112](../../src/features/users/contracts/schemas.ts#L112)

Зависимости: [passwordSchema](#schema-0e3220bf65).

```ts
changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(512),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'Новый пароль должен отличаться от текущего',
  })
```

<a id="schema-a295985f88"></a>
### createUserSchema — src/features/users/contracts/schemas.ts

[src/features/users/contracts/schemas.ts:72](../../src/features/users/contracts/schemas.ts#L72)

Зависимости: [usernameSchema](#schema-6be0e87cbf), [assignmentsSchema](#schema-5f8a4a15c0), [passwordSchema](#schema-0e3220bf65).

```ts
createUserSchema = z.object({
  username: usernameSchema,
  name: z.string().trim().min(2).max(200),
  employeeId: z.string().min(1).nullable().optional(),
  assignments: assignmentsSchema,
  temporaryPassword: passwordSchema,
}).superRefine((input, context) => {
  if (input.assignments.some((assignment) => assignment.role === 'EMPLOYEE') && !input.employeeId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['employeeId'],
      message: 'Для роли сотрудника привяжите кадровую карточку',
    })
  }
})
```

<a id="schema-0e3220bf65"></a>
### passwordSchema — src/features/users/contracts/schemas.ts

[src/features/users/contracts/schemas.ts:67](../../src/features/users/contracts/schemas.ts#L67)

```ts
passwordSchema = z
  .string()
  .min(7, 'Пароль должен содержать минимум 7 символов')
  .max(512)
```

<a id="schema-534870e101"></a>
### scopeModeSchema — src/features/users/contracts/schemas.ts

[src/features/users/contracts/schemas.ts:5](../../src/features/users/contracts/schemas.ts#L5)

```ts
scopeModeSchema = z.enum(['NONE', 'ALL', 'ASSIGNED', 'SELF'])
```

<a id="schema-da14015b0f"></a>
### updateUserSchema — src/features/users/contracts/schemas.ts

[src/features/users/contracts/schemas.ts:88](../../src/features/users/contracts/schemas.ts#L88)

Зависимости: [assignmentsSchema](#schema-5f8a4a15c0), [passwordSchema](#schema-0e3220bf65).

```ts
updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    employeeId: z.string().min(1).nullable().optional(),
    assignments: assignmentsSchema.optional(),
    isActive: z.boolean().optional(),
    temporaryPassword: passwordSchema.optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'Необходимо передать хотя бы одно изменение',
  })
  .superRefine((input, context) => {
    if (
      input.assignments?.some((assignment) => assignment.role === 'EMPLOYEE') &&
      input.employeeId === null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['employeeId'],
        message: 'Для роли сотрудника привяжите кадровую карточку',
      })
    }
  })
```

<a id="schema-6be0e87cbf"></a>
### usernameSchema — src/features/users/contracts/schemas.ts

[src/features/users/contracts/schemas.ts:59](../../src/features/users/contracts/schemas.ts#L59)

```ts
usernameSchema = z
  .string()
  .trim()
  .min(3, 'Логин должен содержать минимум 3 символа')
  .max(100)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Допустимы латинские буквы, цифры, точка, _ и -')
  .transform((value) => value.toLowerCase())
```

<a id="schema-f581630f9a"></a>
### usersQuerySchema — src/features/users/contracts/schemas.ts

[src/features/users/contracts/schemas.ts:122](../../src/features/users/contracts/schemas.ts#L122)

```ts
usersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
```

<a id="schema-a11f631368"></a>
### LOCK_DURATION_MS — src/lib/auth.ts

[src/lib/auth.ts:15](../../src/lib/auth.ts#L15)

```ts
const LOCK_DURATION_MS = 15 * 60 * 1000
```

<a id="schema-6fd80280f3"></a>
### MAX_FAILED_ATTEMPTS — src/lib/auth.ts

[src/lib/auth.ts:14](../../src/lib/auth.ts#L14)

```ts
const MAX_FAILED_ATTEMPTS = 5
```

<a id="schema-ac4976ca83"></a>
### credentialsSchema — src/lib/auth.ts

[src/lib/auth.ts:7](../../src/lib/auth.ts#L7)

```ts
const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(100).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(512),
})
```

<a id="schema-0a71a6dde2"></a>
### APP_ROLES — src/lib/auth/permissions.ts

[src/lib/auth/permissions.ts:1](../../src/lib/auth/permissions.ts#L1)

```ts
APP_ROLES = [
  'ADMIN',
  'HR',
  'ACCOUNTANT',
  'PROJECT_MANAGER',
  'ASSET_CUSTODIAN',
  'DEPARTMENT_HEAD',
  'AUDITOR',
  'EMPLOYEE',
] as const
```

## Выходные формы

Это структурные типы конкретных выражений, переданных apiData/apiList/NextResponse.json, извлечённые TypeScript checker из текущих sources. У apiData внешний `{data:...}`, у apiList внешний list+pagination; raw JSON не получает data wrapper. Обозначения ISO/Decimal учитывают JSON serialization. Тип boolean/string может быть шире фактического literal в return; исходный return выше задаёт literal. Полное дерево и исходник serializer/select/include — в JSON. В HTTP error поле formErrors Zod не возвращается, только flatten().fieldErrors.

<a id="r001"></a>
### R001 — apiData

Sources: [src/app/api/account/password/route.ts:16](../../src/app/api/account/password/route.ts#L16), [src/app/api/payroll/adjustments/[id]/route.ts:15](../../src/app/api/payroll/adjustments/%5Bid%5D/route.ts#L15), [src/app/api/time-entries/[id]/route.ts:49](../../src/app/api/time-entries/%5Bid%5D/route.ts#L49).

```ts
{ success: true }
```

<a id="r002"></a>
### R002 — apiData

Sources: [src/app/api/approvals/[id]/cancel/route.ts:15](../../src/app/api/approvals/%5Bid%5D/cancel/route.ts#L15).

```ts
{ id: string; title: string; status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; requestedById: string; documentId: null | string }
```

<a id="r003"></a>
### R003 — apiData

Sources: [src/app/api/approvals/[id]/decision/route.ts:19](../../src/app/api/approvals/%5Bid%5D/decision/route.ts#L19).

```ts
{ requestId: string; title: string; requestedById: string; nextApproverId: null | string; nextSequence: number; status: "PENDING" | "APPROVED" | "REJECTED" }
```

<a id="r004"></a>
### R004 — Response.json

Sources: [src/app/api/approvals/[id]/route.ts:14](../../src/app/api/approvals/%5Bid%5D/route.ts#L14).

```ts
{ error: { message: string } }
```

<a id="r005"></a>
### R005 — apiData

Sources: [src/app/api/approvals/[id]/route.ts:15](../../src/app/api/approvals/%5Bid%5D/route.ts#L15), [src/app/api/approvals/route.ts:42](../../src/app/api/approvals/route.ts#L42).

```ts
{ project: null | { id: string; name: string; code: string }; document: null | { id: string; title: string; status: "DRAFT" | "APPROVED" | "ARCHIVED" | "IN_REVIEW" | "SIGNED" }; requestedBy: { id: string; name: string }; steps: ({ approver: { id: string; name: string }; id: string; status: "PENDING" | "APPROVED" | "REJECTED" | "WAITING" | "SKIPPED"; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; requestId: string; sequence: number; comment: null | string; decidedAt: null | string /* ISO datetime */; dueDate: null | string /* ISO datetime */; reminderSent: false | true; approverId: string })[]; id: string; title: string; description: null | string; entityType: null | string; entityId: null | string; status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; currentStep: number; dueAt: null | string /* ISO datetime */; submittedAt: null | string /* ISO datetime */; completedAt: null | string /* ISO datetime */; lockVersion: number; requestedById: string; documentId: null | string; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */ }
```

<a id="r006"></a>
### R006 — apiData

Sources: [src/app/api/approvals/options/route.ts:9](../../src/app/api/approvals/options/route.ts#L9).

```ts
({ id: string; name: string; username: string })[]
```

<a id="r007"></a>
### R007 — apiList

Sources: [src/app/api/approvals/route.ts:29](../../src/app/api/approvals/route.ts#L29).

```ts
({ project: null | { id: string; name: string; code: string }; document: null | { id: string; title: string; status: "DRAFT" | "APPROVED" | "ARCHIVED" | "IN_REVIEW" | "SIGNED" }; requestedBy: { id: string; name: string }; steps: ({ approver: { id: string; name: string }; id: string; status: "PENDING" | "APPROVED" | "REJECTED" | "WAITING" | "SKIPPED"; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; requestId: string; sequence: number; comment: null | string; decidedAt: null | string /* ISO datetime */; dueDate: null | string /* ISO datetime */; reminderSent: false | true; approverId: string })[]; id: string; title: string; description: null | string; entityType: null | string; entityId: null | string; status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; currentStep: number; dueAt: null | string /* ISO datetime */; submittedAt: null | string /* ISO datetime */; completedAt: null | string /* ISO datetime */; lockVersion: number; requestedById: string; documentId: null | string; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */ })[]
```

<a id="r008"></a>
### R008 — apiData

Sources: [src/app/api/approvals/templates/[id]/route.ts:19](../../src/app/api/approvals/templates/%5Bid%5D/route.ts#L19), [src/app/api/approvals/templates/route.ts:27](../../src/app/api/approvals/templates/route.ts#L27).

```ts
{ id: string; steps: null | string | number | false | true | import("/Users/mac/Desktop/organization-erp/node_modules/@prisma/client/runtime/library").JsonObject | { length: number }; name: string; isActive: false | true }
```

<a id="r009"></a>
### R009 — apiData

Sources: [src/app/api/approvals/templates/route.ts:18](../../src/app/api/approvals/templates/route.ts#L18).

```ts
({ id: string; steps: null | string | number | false | true | import("/Users/mac/Desktop/organization-erp/node_modules/@prisma/client/runtime/library").JsonObject | { length: number }; name: string; isActive: false | true })[]
```

<a id="r010"></a>
### R010 — apiData

Sources: [src/app/api/assets/[id]/archive/route.ts:23](../../src/app/api/assets/%5Bid%5D/archive/route.ts#L23), [src/app/api/assets/[id]/restore/route.ts:20](../../src/app/api/assets/%5Bid%5D/restore/route.ts#L20).

```ts
{ id: string; status: "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED"; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; inventoryNumber: string; orderNumber: number; unitPrice: string /* Decimal */; unitOfMeasure: string; quantity: string /* Decimal */; totalCost: string /* Decimal */; initialCost: string /* Decimal */; usefulLifeMonths: number; molId: string; groupId: string; contractCode: null | string; internalFundingCode: null | string; isExistingAsset: false | true; recordingDate: string /* ISO datetime */; documentType: string; documentDetails: string; documentFiles: (string)[]; isArchived: false | true; plannedDisposalDate: null | string /* ISO datetime */; plannedDisposalReason: null | string; photos: (string)[]; notes: null | string; accountingForm: string }
```

<a id="r011"></a>
### R011 — apiData

Sources: [src/app/api/assets/[id]/disposals/route.ts:22](../../src/app/api/assets/%5Bid%5D/disposals/route.ts#L22).

```ts
{ holdings: ({ id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; assetId: string; quantity: string /* Decimal */; molId: string })[]; id: string; status: "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED"; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; inventoryNumber: string; orderNumber: number; unitPrice: string /* Decimal */; unitOfMeasure: string; quantity: string /* Decimal */; totalCost: string /* Decimal */; initialCost: string /* Decimal */; usefulLifeMonths: number; molId: string; groupId: string; contractCode: null | string; internalFundingCode: null | string; isExistingAsset: false | true; recordingDate: string /* ISO datetime */; documentType: string; documentDetails: string; documentFiles: (string)[]; isArchived: false | true; plannedDisposalDate: null | string /* ISO datetime */; plannedDisposalReason: null | string; photos: (string)[]; notes: null | string; accountingForm: string }
```

<a id="r012"></a>
### R012 — apiData

Sources: [src/app/api/assets/[id]/maintenance/[maintenanceId]/route.ts:22](../../src/app/api/assets/%5Bid%5D/maintenance/%5BmaintenanceId%5D/route.ts#L22), [src/app/api/assets/[id]/maintenance/route.ts:35](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L35).

```ts
{ id: string; title: string; description: null | string; status: "COMPLETED" | "PLANNED" | "IN_PROGRESS" | "CANCELED"; completedAt: null | string /* ISO datetime */; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; result: null | string; assetId: string; type: "INSPECTION" | "CALIBRATION" | "REPAIR" | "SERVICE"; scheduledDate: string /* ISO datetime */; startedAt: null | string /* ISO datetime */; nextDueDate: null | string /* ISO datetime */; provider: null | string; cost: string /* Decimal */; assetStatusBefore: null | "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED" }
```

<a id="r013"></a>
### R013 — apiData

Sources: [src/app/api/assets/[id]/maintenance/route.ts:19](../../src/app/api/assets/%5Bid%5D/maintenance/route.ts#L19).

```ts
({ id: string; title: string; description: null | string; status: "COMPLETED" | "PLANNED" | "IN_PROGRESS" | "CANCELED"; completedAt: null | string /* ISO datetime */; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; result: null | string; assetId: string; type: "INSPECTION" | "CALIBRATION" | "REPAIR" | "SERVICE"; scheduledDate: string /* ISO datetime */; startedAt: null | string /* ISO datetime */; nextDueDate: null | string /* ISO datetime */; provider: null | string; cost: string /* Decimal */; assetStatusBefore: null | "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED" })[]
```

<a id="r014"></a>
### R014 — apiData

Sources: [src/app/api/assets/[id]/route.ts:37](../../src/app/api/assets/%5Bid%5D/route.ts#L37).

```ts
{ mol: { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; group: { id: string; description: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; code: string }; operations: ({ fromMol: null | { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; toMol: null | { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; id: string; createdAt: string /* ISO datetime */; assetId: string; type: "RECEIPT" | "TRANSFER" | "DISPOSAL" | "STATUS_CHANGE"; date: string /* ISO datetime */; unitPrice: string /* Decimal */; quantity: string /* Decimal */; totalCost: string /* Decimal */; documentType: string; documentDetails: string; documentFiles: (string)[]; fromMolId: null | string; toMolId: null | string; reason: null | string; oldStatus: null | "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED"; newStatus: null | "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED" })[]; holdings: ({ mol: { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; assetId: string; quantity: string /* Decimal */; molId: string })[]; id: string; status: "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED"; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; inventoryNumber: string; orderNumber: number; unitPrice: string /* Decimal */; unitOfMeasure: string; quantity: string /* Decimal */; totalCost: string /* Decimal */; initialCost: string /* Decimal */; usefulLifeMonths: number; molId: string; groupId: string; contractCode: null | string; internalFundingCode: null | string; isExistingAsset: false | true; recordingDate: string /* ISO datetime */; documentType: string; documentDetails: string; documentFiles: (string)[]; isArchived: false | true; plannedDisposalDate: null | string /* ISO datetime */; plannedDisposalReason: null | string; photos: (string)[]; notes: null | string; accountingForm: string }
```

<a id="r015"></a>
### R015 — apiData

Sources: [src/app/api/assets/[id]/route.ts:56](../../src/app/api/assets/%5Bid%5D/route.ts#L56), [src/app/api/assets/[id]/transfers/route.ts:37](../../src/app/api/assets/%5Bid%5D/transfers/route.ts#L37).

```ts
{ mol: { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; group: { id: string; description: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; code: string }; holdings: ({ mol: { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; assetId: string; quantity: string /* Decimal */; molId: string })[]; id: string; status: "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED"; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; inventoryNumber: string; orderNumber: number; unitPrice: string /* Decimal */; unitOfMeasure: string; quantity: string /* Decimal */; totalCost: string /* Decimal */; initialCost: string /* Decimal */; usefulLifeMonths: number; molId: string; groupId: string; contractCode: null | string; internalFundingCode: null | string; isExistingAsset: false | true; recordingDate: string /* ISO datetime */; documentType: string; documentDetails: string; documentFiles: (string)[]; isArchived: false | true; plannedDisposalDate: null | string /* ISO datetime */; plannedDisposalReason: null | string; photos: (string)[]; notes: null | string; accountingForm: string }
```

<a id="r016"></a>
### R016 — apiData

Sources: [src/app/api/assets/import/commit/route.ts:29](../../src/app/api/assets/import/commit/route.ts#L29).

```ts
{ importedCount: number; inventoryNumbers: (string)[] }
```

<a id="r017"></a>
### R017 — apiData

Sources: [src/app/api/assets/import/preview/route.ts:29](../../src/app/api/assets/import/preview/route.ts#L29).

```ts
{ rows: ({ rowNumber: number; inventoryNumber: string; name: string; molCode: string; groupCode: string; quantity: string; unitPrice: string; unitOfMeasure: string; input?: undefined | { status: "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED"; name: string; inventoryNumber: string; unitPrice: number; unitOfMeasure: string; quantity: number; molId: string; groupId: string; isExistingAsset: false | true; recordingDate: string; documentType: string; documentDetails: string; documentFiles: (string)[]; photos: (string)[]; accountingForm: "145" | "367"; projectId?: undefined | null | string; contractCode?: undefined | string; internalFundingCode?: undefined | string; plannedDisposalDate?: undefined | null | string; plannedDisposalReason?: undefined | null | string; notes?: undefined | null | string }; errors: (string)[] })[]; validCount: number; errorCount: number }
```

<a id="r018"></a>
### R018 — apiData

Sources: [src/app/api/assets/inventories/[id]/complete/route.ts:15](../../src/app/api/assets/inventories/%5Bid%5D/complete/route.ts#L15).

```ts
{ mol: { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; createdBy: { id: string; name: string }; id: string; status: "COMPLETED" | "IN_PROGRESS"; completedAt: null | string /* ISO datetime */; createdAt: string /* ISO datetime */; name: string; createdById: string; molId: string }
```

<a id="r019"></a>
### R019 — apiData

Sources: [src/app/api/assets/inventories/[id]/route.ts:18](../../src/app/api/assets/inventories/%5Bid%5D/route.ts#L18).

```ts
{ inventory: { id: string; name: string; status: "COMPLETED" | "IN_PROGRESS"; createdAt: string /* ISO datetime */; completedAt: null | string /* ISO datetime */; mol: { department: string; id: string; code: string; departmentId: string; fullName: string; storageLocation: string }; createdBy: { id: string; name: string } }; entries: ({ scannedBy: null | { id: string; name: string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; assetId: null | string; inventoryNumber: string; unitOfMeasure: string; inventoryId: string; assetName: string; expectedQuantity: string /* Decimal */; foundQuantity: null | string /* Decimal */; note: null | string; scannedById: null | string; scannedAt: null | string /* ISO datetime */ })[]; summary: { totalAssets: number; checkedAssets: number; missingAssets: number; quantityDiscrepancies: number; totalDiscrepancies: number; expectedQuantityTotal: string; foundQuantityTotal: string }; page: number; pageSize: number; total: number; totalPages: number }
```

<a id="r020"></a>
### R020 — apiData

Sources: [src/app/api/assets/inventories/[id]/scan/route.ts:18](../../src/app/api/assets/inventories/%5Bid%5D/scan/route.ts#L18).

```ts
{ id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; assetId: null | string; inventoryNumber: string; unitOfMeasure: string; inventoryId: string; assetName: string; expectedQuantity: string /* Decimal */; foundQuantity: null | string /* Decimal */; note: null | string; scannedById: null | string; scannedAt: null | string /* ISO datetime */ }
```

<a id="r021"></a>
### R021 — apiData

Sources: [src/app/api/assets/inventories/options/route.ts:9](../../src/app/api/assets/inventories/options/route.ts#L9).

```ts
({ department: string; id: string; code: string; departmentId: string; fullName: string; storageLocation: string })[]
```

<a id="r022"></a>
### R022 — apiData

Sources: [src/app/api/assets/inventories/resolve/route.ts:14](../../src/app/api/assets/inventories/resolve/route.ts#L14).

```ts
({ inventory: { id: string; name: string; mol: { id: string; code: string; departmentId: string; fullName: string } }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; assetId: null | string; inventoryNumber: string; unitOfMeasure: string; inventoryId: string; assetName: string; expectedQuantity: string /* Decimal */; foundQuantity: null | string /* Decimal */; note: null | string; scannedById: null | string; scannedAt: null | string /* ISO datetime */ })[]
```

<a id="r023"></a>
### R023 — apiList

Sources: [src/app/api/assets/inventories/route.ts:18](../../src/app/api/assets/inventories/route.ts#L18).

```ts
({ mol: { department: string; id: string; code: string; fullName: string; storageLocation: string }; _count: { entries: number }; createdBy: { id: string; name: string }; id: string; status: "COMPLETED" | "IN_PROGRESS"; completedAt: null | string /* ISO datetime */; createdAt: string /* ISO datetime */; name: string; createdById: string; molId: string })[]
```

<a id="r024"></a>
### R024 — apiData

Sources: [src/app/api/assets/inventories/route.ts:38](../../src/app/api/assets/inventories/route.ts#L38).

```ts
{ mol: { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; _count: { entries: number }; createdBy: { id: string; name: string }; id: string; status: "COMPLETED" | "IN_PROGRESS"; completedAt: null | string /* ISO datetime */; createdAt: string /* ISO datetime */; name: string; createdById: string; molId: string }
```

<a id="r025"></a>
### R025 — apiList

Sources: [src/app/api/assets/route.ts:25](../../src/app/api/assets/route.ts#L25).

```ts
({ mol: { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; _count: { operations: number }; group: { id: string; description: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; code: string }; holdings: ({ mol: { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; assetId: string; quantity: string /* Decimal */; molId: string })[]; id: string; status: "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED"; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; inventoryNumber: string; orderNumber: number; unitPrice: string /* Decimal */; unitOfMeasure: string; quantity: string /* Decimal */; totalCost: string /* Decimal */; initialCost: string /* Decimal */; usefulLifeMonths: number; molId: string; groupId: string; contractCode: null | string; internalFundingCode: null | string; isExistingAsset: false | true; recordingDate: string /* ISO datetime */; documentType: string; documentDetails: string; documentFiles: (string)[]; isArchived: false | true; plannedDisposalDate: null | string /* ISO datetime */; plannedDisposalReason: null | string; photos: (string)[]; notes: null | string; accountingForm: string })[]
```

<a id="r026"></a>
### R026 — apiData

Sources: [src/app/api/assets/route.ts:40](../../src/app/api/assets/route.ts#L40).

```ts
{ id: string; status: "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED"; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; inventoryNumber: string; orderNumber: number; unitPrice: string /* Decimal */; unitOfMeasure: string; quantity: string /* Decimal */; totalCost: string /* Decimal */; initialCost: string /* Decimal */; usefulLifeMonths: number; molId: string; groupId: string; contractCode: null | string; internalFundingCode: null | string; isExistingAsset: false | true; recordingDate: string /* ISO datetime */; documentType: string; documentDetails: string; documentFiles: (string)[]; isArchived: false | true; plannedDisposalDate: null | string /* ISO datetime */; plannedDisposalReason: null | string; photos: (string)[]; notes: null | string; accountingForm: string } | { mol: { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; group: { id: string; description: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; code: string }; holdings: ({ mol: { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; assetId: string; quantity: string /* Decimal */; molId: string })[]; id: string; status: "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED"; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; inventoryNumber: string; orderNumber: number; unitPrice: string /* Decimal */; unitOfMeasure: string; quantity: string /* Decimal */; totalCost: string /* Decimal */; initialCost: string /* Decimal */; usefulLifeMonths: number; molId: string; groupId: string; contractCode: null | string; internalFundingCode: null | string; isExistingAsset: false | true; recordingDate: string /* ISO datetime */; documentType: string; documentDetails: string; documentFiles: (string)[]; isArchived: false | true; plannedDisposalDate: null | string /* ISO datetime */; plannedDisposalReason: null | string; photos: (string)[]; notes: null | string; accountingForm: string }
```

<a id="r027"></a>
### R027 — apiData

Sources: [src/app/api/assets/saved-views/route.ts:16](../../src/app/api/assets/saved-views/route.ts#L16).

```ts
({ filters: { status?: undefined | "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED"; search?: undefined | string; molId?: undefined | string; groupId?: undefined | string; accountingForm?: undefined | "145" | "367"; dateFrom?: undefined | string; dateTo?: undefined | string }; id: string; name: string })[]
```

<a id="r028"></a>
### R028 — apiData

Sources: [src/app/api/assets/saved-views/route.ts:30](../../src/app/api/assets/saved-views/route.ts#L30).

```ts
{ id: string; name: string; filters: null | string | number | false | true | Prisma.JsonObject | { length: number } }
```

<a id="r029"></a>
### R029 — apiData

Sources: [src/app/api/departments/[id]/route.ts:28](../../src/app/api/departments/%5Bid%5D/route.ts#L28), [src/app/api/departments/route.ts:32](../../src/app/api/departments/route.ts#L32).

```ts
{ id: string; code: string; name: string; parentId: null | string; headEmployeeId: null | string; headEmployee: null | { id: string; code: string; fullName: string }; isActive: false | true; usage: { children: number; employees: number; staffPositions: number; mols: number }; createdAt: string; updatedAt: string }
```

<a id="r030"></a>
### R030 — apiData

Sources: [src/app/api/departments/[id]/route.ts:48](../../src/app/api/departments/%5Bid%5D/route.ts#L48), [src/app/api/groups/[id]/route.ts:37](../../src/app/api/groups/%5Bid%5D/route.ts#L37), [src/app/api/mols/[id]/route.ts:67](../../src/app/api/mols/%5Bid%5D/route.ts#L67), [src/app/api/notifications/smtp/test/route.ts:36](../../src/app/api/notifications/smtp/test/route.ts#L36), [src/app/api/personnel-actions/[id]/route.ts:16](../../src/app/api/personnel-actions/%5Bid%5D/route.ts#L16), [src/app/api/projects/[id]/route.ts:43](../../src/app/api/projects/%5Bid%5D/route.ts#L43), [src/app/api/staff-schedule/[id]/route.ts:57](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L57), [src/app/api/tasks/[id]/route.ts:41](../../src/app/api/tasks/%5Bid%5D/route.ts#L41), [src/app/api/vacations/[id]/route.ts:47](../../src/app/api/vacations/%5Bid%5D/route.ts#L47).

```ts
{ success: false | true }
```

<a id="r031"></a>
### R031 — apiData

Sources: [src/app/api/departments/route.ts:23](../../src/app/api/departments/route.ts#L23).

```ts
({ id: string; code: string; name: string; parentId: null | string; headEmployeeId: null | string; headEmployee: null | { id: string; code: string; fullName: string }; isActive: false | true; usage: { children: number; employees: number; staffPositions: number; mols: number }; createdAt: string; updatedAt: string })[]
```

<a id="r032"></a>
### R032 — apiData

Sources: [src/app/api/documents/[id]/archive/route.ts:23](../../src/app/api/documents/%5Bid%5D/archive/route.ts#L23), [src/app/api/documents/[id]/route.ts:22](../../src/app/api/documents/%5Bid%5D/route.ts#L22), [src/app/api/documents/[id]/route.ts:38](../../src/app/api/documents/%5Bid%5D/route.ts#L38), [src/app/api/documents/[id]/versions/route.ts:26](../../src/app/api/documents/%5Bid%5D/versions/route.ts#L26), [src/app/api/documents/generate/route.ts:18](../../src/app/api/documents/generate/route.ts#L18), [src/app/api/documents/route.ts:49](../../src/app/api/documents/route.ts#L49).

```ts
{ versions: ({ id: string; documentId: string; versionNumber: number; originalFilename: string; mimeType: string; extension: string; sizeBytes: string; sha256: string; comment: null | string; uploadedById: string; uploadedBy: { id: string; name: string; username: string }; createdAt: string /* ISO datetime */ })[]; asset: null | { id: string; name: string; inventoryNumber: string }; project: null | { id: string; name: string; code: string }; employee: null | { id: string; code: string; fullName: string }; createdBy: { id: string; name: string; username: string }; id: string; title: string; description: null | string; status: "DRAFT" | "APPROVED" | "ARCHIVED" | "IN_REVIEW" | "SIGNED"; lockVersion: number; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; category: "GENERAL" | "CONTRACT" | "ORDER" | "ACT" | "INVOICE" | "PERSONNEL" | "PROJECT" | "ASSET" | "OTHER"; currentVersion: number; assetId: null | string; createdById: string; archivedAt: null | string /* ISO datetime */ }
```

<a id="r033"></a>
### R033 — apiData

Sources: [src/app/api/documents/options/route.ts:13](../../src/app/api/documents/options/route.ts#L13).

```ts
{ projects: ({ id: string; name: string; code: string })[]; employees: ({ id: string; code: string; fullName: string })[]; assets: ({ id: string; name: string; inventoryNumber: string })[] }
```

<a id="r034"></a>
### R034 — apiList

Sources: [src/app/api/documents/route.ts:32](../../src/app/api/documents/route.ts#L32).

```ts
({ versions: ({ id: string; documentId: string; versionNumber: number; originalFilename: string; mimeType: string; extension: string; sizeBytes: string; sha256: string; comment: null | string; uploadedById: string; uploadedBy: { id: string; name: string; username: string }; createdAt: string /* ISO datetime */ })[]; asset: null | { id: string; name: string; inventoryNumber: string }; project: null | { id: string; name: string; code: string }; employee: null | { id: string; code: string; fullName: string }; createdBy: { id: string; name: string; username: string }; id: string; title: string; description: null | string; status: "DRAFT" | "APPROVED" | "ARCHIVED" | "IN_REVIEW" | "SIGNED"; lockVersion: number; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; category: "GENERAL" | "CONTRACT" | "ORDER" | "ACT" | "INVOICE" | "PERSONNEL" | "PROJECT" | "ASSET" | "OTHER"; currentVersion: number; assetId: null | string; createdById: string; archivedAt: null | string /* ISO datetime */ })[]
```

<a id="r035"></a>
### R035 — apiData

Sources: [src/app/api/employees/[id]/profile/route.ts:29](../../src/app/api/employees/%5Bid%5D/profile/route.ts#L29).

```ts
{ department: string; id: string; status: "ACTIVE" | "ON_VACATION" | "ON_SICK_LEAVE" | "DISMISSED"; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; code: string; departmentId: string; fullName: string; photo: null | string; contractType: "PRIMARY" | "INTERNAL" | "EXTERNAL"; contractSignedDate: null | string /* ISO datetime */; contractEndDate: null | string /* ISO datetime */; contractNumber: null | string; phone: null | string; email: null | string; birthDate: null | string /* ISO datetime */; education: null | string; qualification: null | string; managerId: null | string; staffScheduleId: null | string; employmentRate: string /* Decimal */ }
```

<a id="r036"></a>
### R036 — apiData

Sources: [src/app/api/employees/[id]/route.ts:50](../../src/app/api/employees/%5Bid%5D/route.ts#L50), [src/app/api/employees/route.ts:46](../../src/app/api/employees/route.ts#L46).

```ts
{ staffSchedule: null | { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; departmentId: string; position: string; rate: string /* Decimal */; salary: string /* Decimal */ }; department: string; id: string; status: "ACTIVE" | "ON_VACATION" | "ON_SICK_LEAVE" | "DISMISSED"; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; code: string; departmentId: string; fullName: string; photo: null | string; contractType: "PRIMARY" | "INTERNAL" | "EXTERNAL"; contractSignedDate: null | string /* ISO datetime */; contractEndDate: null | string /* ISO datetime */; contractNumber: null | string; phone: null | string; email: null | string; birthDate: null | string /* ISO datetime */; education: null | string; qualification: null | string; managerId: null | string; staffScheduleId: null | string; employmentRate: string /* Decimal */ }
```

<a id="r037"></a>
### R037 — apiData

Sources: [src/app/api/employees/[id]/route.ts:68](../../src/app/api/employees/%5Bid%5D/route.ts#L68).

```ts
{ success: true; archived: true; status: string }
```

<a id="r038"></a>
### R038 — apiList

Sources: [src/app/api/employees/route.ts:33](../../src/app/api/employees/route.ts#L33).

```ts
({ staffSchedule: null | { departmentRef: { isActive: false | true }; department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; departmentId: string; position: string; rate: string /* Decimal */; salary: string /* Decimal */ }; department: string; id: string; status: "ACTIVE" | "ON_VACATION" | "ON_SICK_LEAVE" | "DISMISSED"; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; code: string; departmentId: string; fullName: string; photo: null | string; contractType: "PRIMARY" | "INTERNAL" | "EXTERNAL"; contractSignedDate: null | string /* ISO datetime */; contractEndDate: null | string /* ISO datetime */; contractNumber: null | string; phone: null | string; email: null | string; birthDate: null | string /* ISO datetime */; education: null | string; qualification: null | string; managerId: null | string; staffScheduleId: null | string; employmentRate: string /* Decimal */ })[]
```

<a id="r039"></a>
### R039 — NextResponse.json

Sources: [src/app/api/export/route.ts:163](../../src/app/api/export/route.ts#L163), [src/app/api/finance/plans/route.ts:23](../../src/app/api/finance/plans/route.ts#L23), [src/app/api/finance/plans/route.ts:30](../../src/app/api/finance/plans/route.ts#L30), [src/app/api/finance/plans/route.ts:41](../../src/app/api/finance/plans/route.ts#L41), [src/app/api/finance/plans/route.ts:59](../../src/app/api/finance/plans/route.ts#L59), [src/app/api/finance/plans/route.ts:78](../../src/app/api/finance/plans/route.ts#L78), [src/app/api/finance/plans/route.ts:84](../../src/app/api/finance/plans/route.ts#L84), [src/app/api/finance/plans/route.ts:87](../../src/app/api/finance/plans/route.ts#L87), [src/app/api/finance/plans/route.ts:103](../../src/app/api/finance/plans/route.ts#L103), [src/app/api/finance/plans/route.ts:116](../../src/app/api/finance/plans/route.ts#L116), [src/app/api/finance/plans/route.ts:122](../../src/app/api/finance/plans/route.ts#L122), [src/app/api/finance/plans/route.ts:124](../../src/app/api/finance/plans/route.ts#L124), [src/app/api/projects/[id]/members/[memberId]/route.ts:21](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L21), [src/app/api/projects/[id]/members/[memberId]/route.ts:28](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L28), [src/app/api/projects/[id]/members/[memberId]/route.ts:50](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L50), [src/app/api/projects/[id]/members/[memberId]/route.ts:56](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L56), [src/app/api/projects/[id]/members/route.ts:18](../../src/app/api/projects/%5Bid%5D/members/route.ts#L18), [src/app/api/projects/[id]/members/route.ts:33](../../src/app/api/projects/%5Bid%5D/members/route.ts#L33), [src/app/api/projects/[id]/members/route.ts:39](../../src/app/api/projects/%5Bid%5D/members/route.ts#L39), [src/app/api/projects/[id]/members/route.ts:52](../../src/app/api/projects/%5Bid%5D/members/route.ts#L52), [src/app/api/projects/[id]/members/route.ts:59](../../src/app/api/projects/%5Bid%5D/members/route.ts#L59), [src/app/api/projects/[id]/members/route.ts:73](../../src/app/api/projects/%5Bid%5D/members/route.ts#L73), [src/app/api/projects/[id]/members/route.ts:79](../../src/app/api/projects/%5Bid%5D/members/route.ts#L79), [src/app/api/projects/[id]/payroll/route.ts:23](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L23), [src/app/api/projects/[id]/payroll/route.ts:30](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L30), [src/app/api/projects/[id]/payroll/route.ts:44](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L44), [src/app/api/projects/[id]/payroll/route.ts:50](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L50), [src/app/api/projects/[id]/payroll/route.ts:68](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L68), [src/app/api/projects/[id]/payroll/route.ts:75](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L75), [src/app/api/projects/[id]/payroll/route.ts:91](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L91), [src/app/api/projects/[id]/payroll/route.ts:96](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L96), [src/app/api/projects/[id]/payroll/route.ts:102](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L102), [src/app/api/projects/[id]/payroll/route.ts:115](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L115), [src/app/api/projects/[id]/payroll/route.ts:122](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L122), [src/app/api/projects/[id]/payroll/route.ts:137](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L137), [src/app/api/projects/[id]/payroll/route.ts:143](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L143), [src/app/api/reports/custom/route.ts:71](../../src/app/api/reports/custom/route.ts#L71), [src/app/api/reports/presets/route.ts:27](../../src/app/api/reports/presets/route.ts#L27), [src/app/api/reports/presets/route.ts:37](../../src/app/api/reports/presets/route.ts#L37).

```ts
{ error: string }
```

<a id="r040"></a>
### R040 — NextResponse.json

Sources: [src/app/api/finance/plans/route.ts:38](../../src/app/api/finance/plans/route.ts#L38).

```ts
{ year: number; rows: ({ employeeId: string; fullName: string; department: string; position: string; rate: string; salary: string; months: { [k: string]: { amount: string; projectId: string | null; projectCode: string; projectName: string; projectLabel: string; allocations: { projectId: string; projectCode: string; projectName: string; amount: string; }[]; }; } })[]; projects: ({ id: string; code: string; name: string; plannedBudget: string; actualBudget: string; remainingBudget: string })[] }
```

<a id="r041"></a>
### R041 — NextResponse.json

Sources: [src/app/api/finance/plans/route.ts:67](../../src/app/api/finance/plans/route.ts#L67).

```ts
{ success: true; cell: { amount: string; projectId: null | string; projectCode: string; projectName: string; projectLabel: string; allocations: ({ projectId: string; projectCode: string; projectName: string; amount: string })[] }; projects: ({ id: string; code: string; name: string; plannedBudget: string; actualBudget: string; remainingBudget: string })[] }
```

<a id="r042"></a>
### R042 — NextResponse.json

Sources: [src/app/api/finance/plans/route.ts:111](../../src/app/api/finance/plans/route.ts#L111), [src/app/api/projects/[id]/payroll/route.ts:130](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L130).

```ts
{ success: true }
```

<a id="r043"></a>
### R043 — apiData

Sources: [src/app/api/finance/salary/route.ts:16](../../src/app/api/finance/salary/route.ts#L16).

```ts
{ year: number; rows: ({ employeeId: string; fullName: string; department: string; position: string; rate: string; salary: string; months: { [k: string]: { amount: string; projectId: null; projectCode: string; projectName: string; projectLabel: string; details: { amount: string; projectCode: string; typeLabel: string; }[]; }; } })[]; projects: (never)[] }
```

<a id="r044"></a>
### R044 — apiData

Sources: [src/app/api/groups/[id]/route.ts:17](../../src/app/api/groups/%5Bid%5D/route.ts#L17).

```ts
{ _count: { assets: number }; id: string; description: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; code: string }
```

<a id="r045"></a>
### R045 — apiData

Sources: [src/app/api/groups/[id]/route.ts:26](../../src/app/api/groups/%5Bid%5D/route.ts#L26), [src/app/api/groups/route.ts:19](../../src/app/api/groups/route.ts#L19).

```ts
{ id: string; description: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; code: string }
```

<a id="r046"></a>
### R046 — apiData

Sources: [src/app/api/groups/route.ts:10](../../src/app/api/groups/route.ts#L10).

```ts
({ id: string; description: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; code: string })[]
```

<a id="r047"></a>
### R047 — apiData

Sources: [src/app/api/health/live/route.ts:6](../../src/app/api/health/live/route.ts#L6), [src/app/api/health/ready/route.ts:15](../../src/app/api/health/ready/route.ts#L15).

```ts
{ status: string; timestamp: string }
```

<a id="r048"></a>
### R048 — apiData

Sources: [src/app/api/mols/[id]/route.ts:27](../../src/app/api/mols/%5Bid%5D/route.ts#L27).

```ts
{ _count: { assets: number; holdings: number }; department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }
```

<a id="r049"></a>
### R049 — apiData

Sources: [src/app/api/mols/[id]/route.ts:47](../../src/app/api/mols/%5Bid%5D/route.ts#L47), [src/app/api/mols/route.ts:28](../../src/app/api/mols/route.ts#L28).

```ts
{ department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }
```

<a id="r050"></a>
### R050 — apiData

Sources: [src/app/api/mols/route.ts:15](../../src/app/api/mols/route.ts#L15).

```ts
({ department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string })[]
```

<a id="r051"></a>
### R051 — apiData

Sources: [src/app/api/notifications/[id]/route.ts:20](../../src/app/api/notifications/%5Bid%5D/route.ts#L20).

```ts
{ id: string; read: false | true }
```

<a id="r052"></a>
### R052 — apiData

Sources: [src/app/api/notifications/[id]/route.ts:32](../../src/app/api/notifications/%5Bid%5D/route.ts#L32).

```ts
{ id: string; deleted: true }
```

<a id="r053"></a>
### R053 — apiData

Sources: [src/app/api/notifications/generate-alerts/route.ts:9](../../src/app/api/notifications/generate-alerts/route.ts#L9).

```ts
{ ran: false } | { ran: true; generated: number; emailQueued: number; sources: Record<string, number> }
```

<a id="r054"></a>
### R054 — apiData

Sources: [src/app/api/notifications/preferences/route.ts:10](../../src/app/api/notifications/preferences/route.ts#L10), [src/app/api/notifications/preferences/route.ts:18](../../src/app/api/notifications/preferences/route.ts#L18).

```ts
({ eventType: "SYSTEM" | "APPROVAL_REQUESTED" | "APPROVAL_DECIDED" | "CONTRACT_EXPIRING" | "TASK_OVERDUE" | "ASSET_DISPOSAL_DUE" | "ASSET_MAINTENANCE_DUE" | "BUDGET_OVERRUN"; channel: "IN_APP" | "EMAIL"; enabled: false | true })[]
```

<a id="r055"></a>
### R055 — apiData

Sources: [src/app/api/notifications/read-all/route.ts:9](../../src/app/api/notifications/read-all/route.ts#L9).

```ts
{ updated: number }
```

<a id="r056"></a>
### R056 — apiList

Sources: [src/app/api/notifications/route.ts:19](../../src/app/api/notifications/route.ts#L19).

```ts
({ id: string; title: string; entityType: null | string; entityId: null | string; createdAt: string /* ISO datetime */; eventType: "SYSTEM" | "APPROVAL_REQUESTED" | "APPROVAL_DECIDED" | "CONTRACT_EXPIRING" | "TASK_OVERDUE" | "ASSET_DISPOSAL_DUE" | "ASSET_MAINTENANCE_DUE" | "BUDGET_OVERRUN"; body: string; targetUrl: null | string; readAt: null | string /* ISO datetime */ })[]
```

<a id="r057"></a>
### R057 — apiData

Sources: [src/app/api/notifications/smtp/process/route.ts:11](../../src/app/api/notifications/smtp/process/route.ts#L11).

```ts
{ sent: number; failed: number; skipped: number }
```

<a id="r058"></a>
### R058 — apiData

Sources: [src/app/api/notifications/smtp/route.ts:22](../../src/app/api/notifications/smtp/route.ts#L22).

```ts
null
```

<a id="r059"></a>
### R059 — apiData

Sources: [src/app/api/notifications/smtp/route.ts:25](../../src/app/api/notifications/smtp/route.ts#L25), [src/app/api/notifications/smtp/route.ts:45](../../src/app/api/notifications/smtp/route.ts#L45).

```ts
{ host: string; port: number; username: string; secure: false | true; fromEmail: string; password: string }
```

<a id="r060"></a>
### R060 — apiData

Sources: [src/app/api/notifications/unread-count/route.ts:11](../../src/app/api/notifications/unread-count/route.ts#L11).

```ts
{ count: number }
```

<a id="r061"></a>
### R061 — apiList

Sources: [src/app/api/operations/route.ts:14](../../src/app/api/operations/route.ts#L14).

```ts
({ asset: { group: { id: string; description: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; code: string }; id: string; status: "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED"; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; inventoryNumber: string; orderNumber: number; unitPrice: string /* Decimal */; unitOfMeasure: string; quantity: string /* Decimal */; totalCost: string /* Decimal */; initialCost: string /* Decimal */; usefulLifeMonths: number; molId: string; groupId: string; contractCode: null | string; internalFundingCode: null | string; isExistingAsset: false | true; recordingDate: string /* ISO datetime */; documentType: string; documentDetails: string; documentFiles: (string)[]; isArchived: false | true; plannedDisposalDate: null | string /* ISO datetime */; plannedDisposalReason: null | string; photos: (string)[]; notes: null | string; accountingForm: string }; fromMol: null | { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; toMol: null | { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; id: string; createdAt: string /* ISO datetime */; assetId: string; type: "RECEIPT" | "TRANSFER" | "DISPOSAL" | "STATUS_CHANGE"; date: string /* ISO datetime */; unitPrice: string /* Decimal */; quantity: string /* Decimal */; totalCost: string /* Decimal */; documentType: string; documentDetails: string; documentFiles: (string)[]; fromMolId: null | string; toMolId: null | string; reason: null | string; oldStatus: null | "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED"; newStatus: null | "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED" })[]
```

<a id="r062"></a>
### R062 — apiData

Sources: [src/app/api/payroll/period/route.ts:15](../../src/app/api/payroll/period/route.ts#L15).

```ts
{ id: string; status: "OPEN" | "CLOSED"; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; year: number; month: number; closedAt: null | string /* ISO datetime */; closedById: null | string }
```

<a id="r063"></a>
### R063 — apiData

Sources: [src/app/api/payroll/route.ts:13](../../src/app/api/payroll/route.ts#L13).

```ts
{ period: { closedBy: null | { id: string; name: string; username: string }; id: string; status: "OPEN" | "CLOSED"; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; year: number; month: number; closedAt: null | string /* ISO datetime */; closedById: null | string } | { year: number; month: number; status: "OPEN"; closedAt: null; closedBy: null }; rows: ({ adjustments: ({ id: string; type: "BONUS" | "ONE_TIME" | "DEDUCTION"; amount: number; description: string; project: null | { id: string; name: string; code: string }; createdAt: string /* ISO datetime */ })[]; plannedGross: number; gross: number; tax: number; contributions: number; payable: number; employerCost: number; variance: number; employeeId: string; code: string; fullName: string; department: string; position: string; rate: number; plannedBase: number; actualBase: number; allowance: number; bonus: number; oneTime: number; deduction: number })[]; departmentTotals: ({ department: string; planned: number; gross: number; payable: number; employerCost: number })[]; projectForecasts: ({ id: string; code: string; name: string; plannedBudget: number; actualBudget: number; monthlyPayroll: number; forecast: number; variance: number })[]; totals: { planned: number; gross: number; tax: number; contributions: number; payable: number; employerCost: number }; options: { employees: ({ id: string; code: string; fullName: string })[]; projects: ({ id: string; code: string; name: string })[] } }
```

<a id="r064"></a>
### R064 — apiData

Sources: [src/app/api/payroll/route.ts:22](../../src/app/api/payroll/route.ts#L22).

```ts
{ id: string; description: string; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: string; type: "BONUS" | "ONE_TIME" | "DEDUCTION"; year: number; month: number; amount: string /* Decimal */ }
```

<a id="r065"></a>
### R065 — apiList

Sources: [src/app/api/personnel-actions/route.ts:26](../../src/app/api/personnel-actions/route.ts#L26).

```ts
({ employee: { department: string; staffSchedule: null | { department: string; id: string; departmentId: string; departmentRef: { isActive: false | true }; position: string }; id: string; status: "ACTIVE" | "ON_VACATION" | "ON_SICK_LEAVE" | "DISMISSED"; departmentId: string; fullName: string; contractType: "PRIMARY" | "INTERNAL" | "EXTERNAL"; contractSignedDate: null | string /* ISO datetime */; contractEndDate: null | string /* ISO datetime */; contractNumber: null | string; staffScheduleId: null | string; employmentRate: string /* Decimal */ }; id: string; description: null | string; createdAt: string /* ISO datetime */; employeeId: string; type: "TRANSFER" | "HIRE" | "DISMISS" | "ARCHIVE" | "EXTEND" | "PROMOTE" | "EDIT"; date: string /* ISO datetime */; oldDepartment: null | string; newDepartment: null | string; oldPosition: null | string; newPosition: null | string; oldContractEndDate: null | string /* ISO datetime */; newContractEndDate: null | string /* ISO datetime */ })[]
```

<a id="r066"></a>
### R066 — apiData

Sources: [src/app/api/personnel-actions/route.ts:54](../../src/app/api/personnel-actions/route.ts#L54).

```ts
{ employee: { department: string; staffSchedule: null | { department: string; id: string; departmentId: string; departmentRef: { isActive: false | true }; position: string }; id: string; status: "ACTIVE" | "ON_VACATION" | "ON_SICK_LEAVE" | "DISMISSED"; departmentId: string; fullName: string; contractType: "PRIMARY" | "INTERNAL" | "EXTERNAL"; contractSignedDate: null | string /* ISO datetime */; contractEndDate: null | string /* ISO datetime */; contractNumber: null | string; staffScheduleId: null | string; employmentRate: string /* Decimal */ }; id: string; description: null | string; createdAt: string /* ISO datetime */; employeeId: string; type: "TRANSFER" | "HIRE" | "DISMISS" | "ARCHIVE" | "EXTEND" | "PROMOTE" | "EDIT"; date: string /* ISO datetime */; oldDepartment: null | string; newDepartment: null | string; oldPosition: null | string; newPosition: null | string; oldContractEndDate: null | string /* ISO datetime */; newContractEndDate: null | string /* ISO datetime */ }
```

<a id="r067"></a>
### R067 — apiData

Sources: [src/app/api/personnel-actions/sync/route.ts:10](../../src/app/api/personnel-actions/sync/route.ts#L10).

```ts
{ success: true; createdCount: number }
```

<a id="r068"></a>
### R068 — apiData

Sources: [src/app/api/procurement/[id]/contract/route.ts:15](../../src/app/api/procurement/%5Bid%5D/contract/route.ts#L15), [src/app/api/procurement/[id]/deliveries/route.ts:15](../../src/app/api/procurement/%5Bid%5D/deliveries/route.ts#L15), [src/app/api/procurement/[id]/route.ts:12](../../src/app/api/procurement/%5Bid%5D/route.ts#L12), [src/app/api/procurement/[id]/route.ts:24](../../src/app/api/procurement/%5Bid%5D/route.ts#L24), [src/app/api/procurement/[id]/submit/route.ts:15](../../src/app/api/procurement/%5Bid%5D/submit/route.ts#L15), [src/app/api/procurement/route.ts:34](../../src/app/api/procurement/route.ts#L34).

```ts
{ status: "DRAFT" | "APPROVED" | "REJECTED" | "CANCELLED" | "SUBMITTED" | "CONTRACTED" | "PARTIALLY_DELIVERED" | "DELIVERED" | "CAPITALIZED"; budgetLimit: number; totalPlanned: number; items: ({ quantity: number; unitPrice: number; deliveredQuantity: number; deliveryItems: ({ quantity: number; id: string; assetId: null | string })[]; group: null | { id: string; name: string; code: string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; requestId: string; groupId: null | string; unit: string })[]; contract: null | { amount: number; supplier: { id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; isActive: false | true; phone: null | string; email: null | string; taxId: null | string; address: null | string }; document: null | { id: string; title: string; status: "DRAFT" | "APPROVED" | "ARCHIVED" | "IN_REVIEW" | "SIGNED" }; number: string; id: string; documentId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; requestId: string; supplierId: string; signedAt: string /* ISO datetime */; deliveryDueAt: string /* ISO datetime */ }; deliveries: ({ items: ({ quantity: number; procurementItem: { unitPrice: number; id: string; name: string; unit: string }; asset: null | { id: string; name: string; inventoryNumber: string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; assetId: null | string; deliveryId: string; procurementItemId: string })[]; document: null | { id: string; title: string; status: "DRAFT" | "APPROVED" | "ARCHIVED" | "IN_REVIEW" | "SIGNED" }; number: string; id: string; documentId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; requestId: string; note: null | string; receivedAt: string /* ISO datetime */; contractId: string })[]; approvalRequest: null | { id: string; status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; currentStep: number }; project: null | { id: string; name: string; code: string }; document: null | { id: string; title: string; status: "DRAFT" | "APPROVED" | "ARCHIVED" | "IN_REVIEW" | "SIGNED" }; requestedBy: { id: string; name: string }; number: string; id: string; title: string; description: null | string; requestedById: string; documentId: null | string; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; neededBy: null | string /* ISO datetime */; approvalRequestId: null | string }
```

<a id="r069"></a>
### R069 — apiData

Sources: [src/app/api/procurement/delivery-items/[id]/capitalize/route.ts:16](../../src/app/api/procurement/delivery-items/%5Bid%5D/capitalize/route.ts#L16).

```ts
{ assetId: string; requestId: string }
```

<a id="r070"></a>
### R070 — apiData

Sources: [src/app/api/procurement/options/route.ts:9](../../src/app/api/procurement/options/route.ts#L9).

```ts
{ projects: ({ id: string; name: string; code: string })[]; suppliers: ({ id: string; name: string; taxId: null | string })[]; approvers: ({ id: string; name: string; username: string })[]; groups: ({ id: string; name: string; code: string })[]; mols: ({ id: string; code: string; departmentId: string; fullName: string; storageLocation: string })[]; documents: (never)[] | ({ id: string; title: string; status: "DRAFT" | "APPROVED" | "ARCHIVED" | "IN_REVIEW" | "SIGNED"; projectId: null | string; category: "GENERAL" | "CONTRACT" | "ORDER" | "ACT" | "INVOICE" | "PERSONNEL" | "PROJECT" | "ASSET" | "OTHER" })[] }
```

<a id="r071"></a>
### R071 — NextResponse.json

Sources: [src/app/api/procurement/route.ts:16](../../src/app/api/procurement/route.ts#L16).

```ts
{ data: ({ status: "DRAFT" | "APPROVED" | "REJECTED" | "CANCELLED" | "SUBMITTED" | "CONTRACTED" | "PARTIALLY_DELIVERED" | "DELIVERED" | "CAPITALIZED"; budgetLimit: number; totalPlanned: number; items: ({ quantity: number; unitPrice: number; deliveredQuantity: number; deliveryItems: ({ quantity: number; id: string; assetId: null | string })[]; group: null | { id: string; name: string; code: string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; requestId: string; groupId: null | string; unit: string })[]; contract: null | { amount: number; supplier: { id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; isActive: false | true; phone: null | string; email: null | string; taxId: null | string; address: null | string }; document: null | { id: string; title: string; status: "DRAFT" | "APPROVED" | "ARCHIVED" | "IN_REVIEW" | "SIGNED" }; number: string; id: string; documentId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; requestId: string; supplierId: string; signedAt: string /* ISO datetime */; deliveryDueAt: string /* ISO datetime */ }; deliveries: ({ items: ({ quantity: number; procurementItem: { unitPrice: number; id: string; name: string; unit: string }; asset: null | { id: string; name: string; inventoryNumber: string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; assetId: null | string; deliveryId: string; procurementItemId: string })[]; document: null | { id: string; title: string; status: "DRAFT" | "APPROVED" | "ARCHIVED" | "IN_REVIEW" | "SIGNED" }; number: string; id: string; documentId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; requestId: string; note: null | string; receivedAt: string /* ISO datetime */; contractId: string })[]; approvalRequest: null | { id: string; status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; currentStep: number }; project: null | { id: string; name: string; code: string }; document: null | { id: string; title: string; status: "DRAFT" | "APPROVED" | "ARCHIVED" | "IN_REVIEW" | "SIGNED" }; requestedBy: { id: string; name: string }; number: string; id: string; title: string; description: null | string; requestedById: string; documentId: null | string; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; neededBy: null | string /* ISO datetime */; approvalRequestId: null | string })[]; pagination: { page: number; pageSize: number; total: number; totalPages: number }; summary: { active: number; awaiting: number; overdue: number; budget: number } }
```

<a id="r072"></a>
### R072 — apiData

Sources: [src/app/api/procurement/suppliers/route.ts:14](../../src/app/api/procurement/suppliers/route.ts#L14).

```ts
{ id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; isActive: false | true; phone: null | string; email: null | string; taxId: null | string; address: null | string }
```

<a id="r073"></a>
### R073 — NextResponse.json

Sources: [src/app/api/projects/[id]/members/[memberId]/route.ts:40](../../src/app/api/projects/%5Bid%5D/members/%5BmemberId%5D/route.ts#L40), [src/app/api/projects/[id]/members/route.ts:66](../../src/app/api/projects/%5Bid%5D/members/route.ts#L66).

```ts
{ success: true; member: { id: string; projectId: string; employeeId: string; department: string; position: string; rate: string; salary: string; isArchived: false | true; archivedAt: null | string /* ISO datetime */; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employee: { id: string; code: string; fullName: string; department: string; employmentRate: string; status: string; staffSchedule: null | { id: string; position: string; department: string; salary: string } } } }
```

<a id="r074"></a>
### R074 — NextResponse.json

Sources: [src/app/api/projects/[id]/members/route.ts:26](../../src/app/api/projects/%5Bid%5D/members/route.ts#L26).

```ts
{ members: ({ id: string; projectId: string; employeeId: string; department: string; position: string; rate: string; salary: string; isArchived: false | true; archivedAt: null | string /* ISO datetime */; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employee: { id: string; code: string; fullName: string; department: string; employmentRate: string; status: string; staffSchedule: null | { id: string; position: string; department: string; salary: string } } })[]; availableEmployees: ({ id: string; code: string; fullName: string; department: string; position: string; rate: string; salary: string })[] }
```

<a id="r075"></a>
### R075 — NextResponse.json

Sources: [src/app/api/projects/[id]/payroll/route.ts:37](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L37).

```ts
{ year: number; project: { id: string; code: string; name: string }; rows: ({ employeeId: string; fullName: string; department: string; position: string; rate: string; salary: string; months: { [k: string]: { amount: string; projectId: string | null; projectCode: string; projectName: string; projectLabel?: string; details: Array<{ type: "OKLAD" | "NADBAVKA"; typeLabel: string; amount: string; }>; }; } })[]; summary: { totalRate: string; totalSalary: string; monthTotals: { [k: string]: string; } } }
```

<a id="r076"></a>
### R076 — NextResponse.json

Sources: [src/app/api/projects/[id]/payroll/route.ts:83](../../src/app/api/projects/%5Bid%5D/payroll/route.ts#L83).

```ts
{ success: true; cell: { amount: string; projectId: null | string; projectCode: string; projectName: string; projectLabel?: undefined | string; details: ({ type: "OKLAD" | "NADBAVKA"; typeLabel: string; amount: string })[] } }
```

<a id="r077"></a>
### R077 — apiData

Sources: [src/app/api/projects/[id]/route.ts:15](../../src/app/api/projects/%5Bid%5D/route.ts#L15).

```ts
{ _count: { assets: number; tasksList: number }; assets: ({ mol: { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; group: { id: string; description: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; code: string }; holdings: ({ mol: { department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: null | string; code: string; departmentId: string; fullName: string; storageLocation: string; photo: null | string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; assetId: string; quantity: string /* Decimal */; molId: string })[]; id: string; status: "IN_STOCK" | "IN_USE" | "UNDER_REPAIR" | "PLANNED_FOR_DISPOSAL" | "PARTIALLY_DISPOSED" | "FULLY_DISPOSED"; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; inventoryNumber: string; orderNumber: number; unitPrice: string /* Decimal */; unitOfMeasure: string; quantity: string /* Decimal */; totalCost: string /* Decimal */; initialCost: string /* Decimal */; usefulLifeMonths: number; molId: string; groupId: string; contractCode: null | string; internalFundingCode: null | string; isExistingAsset: false | true; recordingDate: string /* ISO datetime */; documentType: string; documentDetails: string; documentFiles: (string)[]; isArchived: false | true; plannedDisposalDate: null | string /* ISO datetime */; plannedDisposalReason: null | string; photos: (string)[]; notes: null | string; accountingForm: string })[]; tasksList: ({ children: ({ children: ({ id: string; description: null | string; status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED" | "DELAYED"; projectId: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; startDate: null | string /* ISO datetime */; endDate: null | string /* ISO datetime */; parentId: null | string; level: number; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; risk: "LOW" | "MEDIUM" | "HIGH"; isMilestone: false | true; duration: null | number; progress: number; responsible: null | string })[]; id: string; description: null | string; status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED" | "DELAYED"; projectId: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; startDate: null | string /* ISO datetime */; endDate: null | string /* ISO datetime */; parentId: null | string; level: number; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; risk: "LOW" | "MEDIUM" | "HIGH"; isMilestone: false | true; duration: null | number; progress: number; responsible: null | string })[]; id: string; description: null | string; status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED" | "DELAYED"; projectId: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; startDate: null | string /* ISO datetime */; endDate: null | string /* ISO datetime */; parentId: null | string; level: number; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; risk: "LOW" | "MEDIUM" | "HIGH"; isMilestone: false | true; duration: null | number; progress: number; responsible: null | string })[]; id: string; description: null | string; status: "ACTIVE" | "COMPLETED" | "ARCHIVED"; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; code: string; goals: null | string; tasks: null | string; results: null | string; startDate: null | string /* ISO datetime */; endDate: null | string /* ISO datetime */; plannedBudget: string /* Decimal */; actualBudget: string /* Decimal */; plannedRevenue: string /* Decimal */; actualRevenue: string /* Decimal */ }
```

<a id="r078"></a>
### R078 — apiData

Sources: [src/app/api/projects/[id]/route.ts:28](../../src/app/api/projects/%5Bid%5D/route.ts#L28), [src/app/api/projects/route.ts:31](../../src/app/api/projects/route.ts#L31).

```ts
{ id: string; description: null | string; status: "ACTIVE" | "COMPLETED" | "ARCHIVED"; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; code: string; goals: null | string; tasks: null | string; results: null | string; startDate: null | string /* ISO datetime */; endDate: null | string /* ISO datetime */; plannedBudget: string /* Decimal */; actualBudget: string /* Decimal */; plannedRevenue: string /* Decimal */; actualRevenue: string /* Decimal */ }
```

<a id="r079"></a>
### R079 — apiData

Sources: [src/app/api/projects/[id]/tasks/route.ts:14](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L14).

```ts
({ children: ({ children: ({ assignees: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null })[]; checklist: ({ id: string; title: string; createdAt: Date; updatedAt: Date; order: number; taskId: string; completed: boolean })[]; comments: ({ author: { id: string; name: string; }; id: string; createdAt: Date; updatedAt: Date; body: string; taskId: string; authorId: string })[]; predecessors: ({ predecessor: { id: string; name: string; }; id: string; createdAt: Date; predecessorId: string; successorId: string; lagDays: number })[]; id: string; description: null | string; status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED" | "DELAYED"; projectId: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; startDate: null | string /* ISO datetime */; endDate: null | string /* ISO datetime */; parentId: null | string; level: number; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; risk: "LOW" | "MEDIUM" | "HIGH"; isMilestone: false | true; duration: null | number; progress: number; responsible: null | string })[]; assignees: ({ projectMember: null | { id: string }; employee: { id: string; fullName: string }; id: string; createdAt: string /* ISO datetime */; employeeId: string; taskId: string; projectMemberId: null | string })[]; checklist: ({ id: string; title: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; order: number; taskId: string; completed: false | true })[]; comments: ({ author: { id: string; name: string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; body: string; taskId: string; authorId: string })[]; predecessors: ({ predecessor: { id: string; name: string }; id: string; createdAt: string /* ISO datetime */; predecessorId: string; successorId: string; lagDays: number })[]; id: string; description: null | string; status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED" | "DELAYED"; projectId: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; startDate: null | string /* ISO datetime */; endDate: null | string /* ISO datetime */; parentId: null | string; level: number; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; risk: "LOW" | "MEDIUM" | "HIGH"; isMilestone: false | true; duration: null | number; progress: number; responsible: null | string })[]; assignees: { length: number; toString: (() => string) & (() => string); toLocaleString: { (): string; (locales: string | string[], options?: Intl.NumberFormatOptions & Intl.DateTimeFormatOptions): string; } & { (): string; (locales: string | string[], options?: Intl.NumberFormatOptions & Intl.DateTimeFormatOptions): string; }; pop: (() => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) | undefined) & (() => { employeeId: string; fullName: string; projectMemberId: string | null; } | undefined); push: ((...items: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => number) & ((...items: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => number); concat: { (...items: ConcatArray<{ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }>[]): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]; (...items: (({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) | ConcatArray<{ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }>)[]): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]; } & { (...items: ConcatArray<{ employeeId: string; fullName: string; projectMemberId: string | null; }>[]): { employeeId: string; fullName: string; projectMemberId: string | null; }[]; (...items: ({ employeeId: string; fullName: string; projectMemberId: string | null; } | ConcatArray<{ employeeId: string; fullName: string; projectMemberId: string | null; }>)[]): { employeeId: string; fullName: string; projectMemberId: string | null; }[]; }; join: ((separator?: string) => string) & ((separator?: string) => string); reverse: (() => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) & (() => { employeeId: string; fullName: string; projectMemberId: string | null; }[]); shift: (() => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) | undefined) & (() => { employeeId: string; fullName: string; projectMemberId: string | null; } | undefined); slice: ((start?: number, end?: number) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) & ((start?: number, end?: number) => { employeeId: string; fullName: string; projectMemberId: string | null; }[]); sort: ((compareFn?: ((a: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, b: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) => number) | undefined) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[] & { employeeId: string; fullName: string; projectMemberId: string | null; }[]) & ((compareFn?: ((a: { employeeId: string; fullName: string; projectMemberId: string | null; }, b: { employeeId: string; fullName: string; projectMemberId: string | null; }) => number) | undefined) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[] & { employeeId: string; fullName: string; projectMemberId: string | null; }[]); splice: { (start: number, deleteCount?: number): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]; (start: number, deleteCount: number, ...items: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]; } & { (start: number, deleteCount?: number): { employeeId: string; fullName: string; projectMemberId: string | null; }[]; (start: number, deleteCount: number, ...items: { employeeId: string; fullName: string; projectMemberId: string | null; }[]): { employeeId: string; fullName: string; projectMemberId: string | null; }[]; }; unshift: ((...items: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => number) & ((...items: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => number); indexOf: ((searchElement: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, fromIndex?: number) => number) & ((searchElement: { employeeId: string; fullName: string; projectMemberId: string | null; }, fromIndex?: number) => number); lastIndexOf: ((searchElement: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, fromIndex?: number) => number) & ((searchElement: { employeeId: string; fullName: string; projectMemberId: string | null; }, fromIndex?: number) => number); every: { <S extends { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }>(predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => value is S, thisArg?: any): this is S[]; (predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => unknown, thisArg?: any): boolean; } & { <S extends { employeeId: string; fullName: string; projectMemberId: string | null; }>(predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => value is S, thisArg?: any): this is S[]; (predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => unknown, thisArg?: any): boolean; }; some: ((predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => unknown, thisArg?: any) => boolean) & ((predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => unknown, thisArg?: any) => boolean); forEach: ((callbackfn: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => void, thisArg?: any) => void) & ((callbackfn: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => void, thisArg?: any) => void); map: (<U>(callbackfn: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => U, thisArg?: any) => U[]) & (<U>(callbackfn: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => U, thisArg?: any) => U[]); filter: { <S extends { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }>(predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => value is S, thisArg?: any): S[]; (predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => unknown, thisArg?: any): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]; } & { <S extends { employeeId: string; fullName: string; projectMemberId: string | null; }>(predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => value is S, thisArg?: any): S[]; (predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => unknown, thisArg?: any): { employeeId: string; fullName: string; projectMemberId: string | null; }[]; }; reduce: { (callbackfn: (previousValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentIndex: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }): { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }; (callbackfn: (previousValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentIndex: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, initialValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }): { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }; <U>(callbackfn: (previousValue: U, currentValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentIndex: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => U, initialValue: U): U; } & { (callbackfn: (previousValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentIndex: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => { employeeId: string; fullName: string; projectMemberId: string | null; }): { employeeId: string; fullName: string; projectMemberId: string | null; }; (callbackfn: (previousValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentIndex: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => { employeeId: string; fullName: string; projectMemberId: string | null; }, initialValue: { employeeId: string; fullName: string; projectMemberId: string | null; }): { employeeId: string; fullName: string; projectMemberId: string | null; }; <U>(callbackfn: (previousValue: U, currentValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentIndex: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => U, initialValue: U): U; }; reduceRight: { (callbackfn: (previousValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentIndex: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }): { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }; (callbackfn: (previousValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentIndex: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, initialValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }): { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }; <U>(callbackfn: (previousValue: U, currentValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentIndex: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => U, initialValue: U): U; } & { (callbackfn: (previousValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentIndex: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => { employeeId: string; fullName: string; projectMemberId: string | null; }): { employeeId: string; fullName: string; projectMemberId: string | null; }; (callbackfn: (previousValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentIndex: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => { employeeId: string; fullName: string; projectMemberId: string | null; }, initialValue: { employeeId: string; fullName: string; projectMemberId: string | null; }): { employeeId: string; fullName: string; projectMemberId: string | null; }; <U>(callbackfn: (previousValue: U, currentValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentIndex: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => U, initialValue: U): U; }; find: { <S extends { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }>(predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, obj: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => value is S, thisArg?: any): S | undefined; (predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, obj: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => unknown, thisArg?: any): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) | undefined; } & { <S extends { employeeId: string; fullName: string; projectMemberId: string | null; }>(predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, obj: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => value is S, thisArg?: any): S | undefined; (predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, obj: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => unknown, thisArg?: any): { employeeId: string; fullName: string; projectMemberId: string | null; } | undefined; }; findIndex: ((predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, obj: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => unknown, thisArg?: any) => number) & ((predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, obj: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => unknown, thisArg?: any) => number); fill: ((value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, start?: number, end?: number) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[] & { employeeId: string; fullName: string; projectMemberId: string | null; }[]) & ((value: { employeeId: string; fullName: string; projectMemberId: string | null; }, start?: number, end?: number) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[] & { employeeId: string; fullName: string; projectMemberId: string | null; }[]); copyWithin: ((target: number, start: number, end?: number) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[] & { employeeId: string; fullName: string; projectMemberId: string | null; }[]) & ((target: number, start: number, end?: number) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[] & { employeeId: string; fullName: string; projectMemberId: string | null; }[]); entries: (() => ArrayIterator<[number, { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }]>) & (() => ArrayIterator<[number, { employeeId: string; fullName: string; projectMemberId: string | null; }]>); keys: (() => ArrayIterator<number>) & (() => ArrayIterator<number>); values: (() => ArrayIterator<{ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }>) & (() => ArrayIterator<{ employeeId: string; fullName: string; projectMemberId: string | null; }>); includes: ((searchElement: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, fromIndex?: number) => boolean) & ((searchElement: { employeeId: string; fullName: string; projectMemberId: string | null; }, fromIndex?: number) => boolean); flatMap: (<U, This = undefined>(callback: (this: This, value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => U | readonly U[], thisArg?: This | undefined) => U[]) & (<U, This = undefined>(callback: (this: This, value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => U | readonly U[], thisArg?: This | undefined) => U[]); flat: (<A, D extends number = 1>(this: A, depth?: D | undefined) => FlatArray<A, D>[]) & (<A, D extends number = 1>(this: A, depth?: D | undefined) => FlatArray<A, D>[]); at: ((index: number) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) | undefined) & ((index: number) => { employeeId: string; fullName: string; projectMemberId: string | null; } | undefined); findLast: { <S extends { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }>(predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => value is S, thisArg?: any): S | undefined; (predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => unknown, thisArg?: any): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) | undefined; } & { <S extends { employeeId: string; fullName: string; projectMemberId: string | null; }>(predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => value is S, thisArg?: any): S | undefined; (predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => unknown, thisArg?: any): { employeeId: string; fullName: string; projectMemberId: string | null; } | undefined; }; findLastIndex: ((predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => unknown, thisArg?: any) => number) & ((predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => unknown, thisArg?: any) => number); toReversed: (() => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) & (() => { employeeId: string; fullName: string; projectMemberId: string | null; }[]); toSorted: ((compareFn?: ((a: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, b: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) => number) | undefined) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) & ((compareFn?: ((a: { employeeId: string; fullName: string; projectMemberId: string | null; }, b: { employeeId: string; fullName: string; projectMemberId: string | null; }) => number) | undefined) => { employeeId: string; fullName: string; projectMemberId: string | null; }[]); toSpliced: { (start: number, deleteCount: number, ...items: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]; (start: number, deleteCount?: number): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]; } & { (start: number, deleteCount: number, ...items: { employeeId: string; fullName: string; projectMemberId: string | null; }[]): { employeeId: string; fullName: string; projectMemberId: string | null; }[]; (start: number, deleteCount?: number): { employeeId: string; fullName: string; projectMemberId: string | null; }[]; }; with: ((index: number, value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) & ((index: number, value: { employeeId: string; fullName: string; projectMemberId: string | null; }) => { employeeId: string; fullName: string; projectMemberId: string | null; }[]) }; checklist: ({ id: string; title: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; order: number; taskId: string; completed: false | true })[]; comments: ({ author: { id: string; name: string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; body: string; taskId: string; authorId: string })[]; predecessors: ({ predecessor: { id: string; name: string }; id: string; createdAt: string /* ISO datetime */; predecessorId: string; successorId: string; lagDays: number })[]; id: string; description: null | string; status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED" | "DELAYED"; projectId: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; startDate: null | string /* ISO datetime */; endDate: null | string /* ISO datetime */; parentId: null | string; level: number; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; risk: "LOW" | "MEDIUM" | "HIGH"; isMilestone: false | true; duration: null | number; progress: number; responsible: null | string })[]
```

<a id="r080"></a>
### R080 — apiData

Sources: [src/app/api/projects/[id]/tasks/route.ts:27](../../src/app/api/projects/%5Bid%5D/tasks/route.ts#L27), [src/app/api/tasks/[id]/route.ts:25](../../src/app/api/tasks/%5Bid%5D/route.ts#L25).

```ts
{ assignees: { length: number; toString: (() => string) & (() => string); toLocaleString: { (): string; (locales: string | string[], options?: Intl.NumberFormatOptions & Intl.DateTimeFormatOptions): string; } & { (): string; (locales: string | string[], options?: Intl.NumberFormatOptions & Intl.DateTimeFormatOptions): string; }; pop: (() => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) | undefined) & (() => { employeeId: string; fullName: string; projectMemberId: string | null; } | undefined); push: ((...items: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => number) & ((...items: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => number); concat: { (...items: ConcatArray<{ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }>[]): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]; (...items: (({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) | ConcatArray<{ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }>)[]): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]; } & { (...items: ConcatArray<{ employeeId: string; fullName: string; projectMemberId: string | null; }>[]): { employeeId: string; fullName: string; projectMemberId: string | null; }[]; (...items: ({ employeeId: string; fullName: string; projectMemberId: string | null; } | ConcatArray<{ employeeId: string; fullName: string; projectMemberId: string | null; }>)[]): { employeeId: string; fullName: string; projectMemberId: string | null; }[]; }; join: ((separator?: string) => string) & ((separator?: string) => string); reverse: (() => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) & (() => { employeeId: string; fullName: string; projectMemberId: string | null; }[]); shift: (() => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) | undefined) & (() => { employeeId: string; fullName: string; projectMemberId: string | null; } | undefined); slice: ((start?: number, end?: number) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) & ((start?: number, end?: number) => { employeeId: string; fullName: string; projectMemberId: string | null; }[]); sort: ((compareFn?: ((a: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, b: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) => number) | undefined) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[] & { employeeId: string; fullName: string; projectMemberId: string | null; }[]) & ((compareFn?: ((a: { employeeId: string; fullName: string; projectMemberId: string | null; }, b: { employeeId: string; fullName: string; projectMemberId: string | null; }) => number) | undefined) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[] & { employeeId: string; fullName: string; projectMemberId: string | null; }[]); splice: { (start: number, deleteCount?: number): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]; (start: number, deleteCount: number, ...items: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]; } & { (start: number, deleteCount?: number): { employeeId: string; fullName: string; projectMemberId: string | null; }[]; (start: number, deleteCount: number, ...items: { employeeId: string; fullName: string; projectMemberId: string | null; }[]): { employeeId: string; fullName: string; projectMemberId: string | null; }[]; }; unshift: ((...items: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => number) & ((...items: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => number); indexOf: ((searchElement: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, fromIndex?: number) => number) & ((searchElement: { employeeId: string; fullName: string; projectMemberId: string | null; }, fromIndex?: number) => number); lastIndexOf: ((searchElement: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, fromIndex?: number) => number) & ((searchElement: { employeeId: string; fullName: string; projectMemberId: string | null; }, fromIndex?: number) => number); every: { <S extends { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }>(predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => value is S, thisArg?: any): this is S[]; (predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => unknown, thisArg?: any): boolean; } & { <S extends { employeeId: string; fullName: string; projectMemberId: string | null; }>(predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => value is S, thisArg?: any): this is S[]; (predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => unknown, thisArg?: any): boolean; }; some: ((predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => unknown, thisArg?: any) => boolean) & ((predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => unknown, thisArg?: any) => boolean); forEach: ((callbackfn: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => void, thisArg?: any) => void) & ((callbackfn: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => void, thisArg?: any) => void); map: (<U>(callbackfn: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => U, thisArg?: any) => U[]) & (<U>(callbackfn: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => U, thisArg?: any) => U[]); filter: { <S extends { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }>(predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => value is S, thisArg?: any): S[]; (predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => unknown, thisArg?: any): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]; } & { <S extends { employeeId: string; fullName: string; projectMemberId: string | null; }>(predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => value is S, thisArg?: any): S[]; (predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => unknown, thisArg?: any): { employeeId: string; fullName: string; projectMemberId: string | null; }[]; }; reduce: { (callbackfn: (previousValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentIndex: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }): { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }; (callbackfn: (previousValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentIndex: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, initialValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }): { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }; <U>(callbackfn: (previousValue: U, currentValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentIndex: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => U, initialValue: U): U; } & { (callbackfn: (previousValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentIndex: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => { employeeId: string; fullName: string; projectMemberId: string | null; }): { employeeId: string; fullName: string; projectMemberId: string | null; }; (callbackfn: (previousValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentIndex: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => { employeeId: string; fullName: string; projectMemberId: string | null; }, initialValue: { employeeId: string; fullName: string; projectMemberId: string | null; }): { employeeId: string; fullName: string; projectMemberId: string | null; }; <U>(callbackfn: (previousValue: U, currentValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentIndex: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => U, initialValue: U): U; }; reduceRight: { (callbackfn: (previousValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentIndex: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }): { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }; (callbackfn: (previousValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentIndex: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, initialValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }): { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }; <U>(callbackfn: (previousValue: U, currentValue: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, currentIndex: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => U, initialValue: U): U; } & { (callbackfn: (previousValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentIndex: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => { employeeId: string; fullName: string; projectMemberId: string | null; }): { employeeId: string; fullName: string; projectMemberId: string | null; }; (callbackfn: (previousValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentIndex: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => { employeeId: string; fullName: string; projectMemberId: string | null; }, initialValue: { employeeId: string; fullName: string; projectMemberId: string | null; }): { employeeId: string; fullName: string; projectMemberId: string | null; }; <U>(callbackfn: (previousValue: U, currentValue: { employeeId: string; fullName: string; projectMemberId: string | null; }, currentIndex: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => U, initialValue: U): U; }; find: { <S extends { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }>(predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, obj: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => value is S, thisArg?: any): S | undefined; (predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, obj: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => unknown, thisArg?: any): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) | undefined; } & { <S extends { employeeId: string; fullName: string; projectMemberId: string | null; }>(predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, obj: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => value is S, thisArg?: any): S | undefined; (predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, obj: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => unknown, thisArg?: any): { employeeId: string; fullName: string; projectMemberId: string | null; } | undefined; }; findIndex: ((predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, obj: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => unknown, thisArg?: any) => number) & ((predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, obj: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => unknown, thisArg?: any) => number); fill: ((value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, start?: number, end?: number) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[] & { employeeId: string; fullName: string; projectMemberId: string | null; }[]) & ((value: { employeeId: string; fullName: string; projectMemberId: string | null; }, start?: number, end?: number) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[] & { employeeId: string; fullName: string; projectMemberId: string | null; }[]); copyWithin: ((target: number, start: number, end?: number) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[] & { employeeId: string; fullName: string; projectMemberId: string | null; }[]) & ((target: number, start: number, end?: number) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[] & { employeeId: string; fullName: string; projectMemberId: string | null; }[]); entries: (() => ArrayIterator<[number, { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }]>) & (() => ArrayIterator<[number, { employeeId: string; fullName: string; projectMemberId: string | null; }]>); keys: (() => ArrayIterator<number>) & (() => ArrayIterator<number>); values: (() => ArrayIterator<{ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }>) & (() => ArrayIterator<{ employeeId: string; fullName: string; projectMemberId: string | null; }>); includes: ((searchElement: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, fromIndex?: number) => boolean) & ((searchElement: { employeeId: string; fullName: string; projectMemberId: string | null; }, fromIndex?: number) => boolean); flatMap: (<U, This = undefined>(callback: (this: This, value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => U | readonly U[], thisArg?: This | undefined) => U[]) & (<U, This = undefined>(callback: (this: This, value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => U | readonly U[], thisArg?: This | undefined) => U[]); flat: (<A, D extends number = 1>(this: A, depth?: D | undefined) => FlatArray<A, D>[]) & (<A, D extends number = 1>(this: A, depth?: D | undefined) => FlatArray<A, D>[]); at: ((index: number) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) | undefined) & ((index: number) => { employeeId: string; fullName: string; projectMemberId: string | null; } | undefined); findLast: { <S extends { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }>(predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => value is S, thisArg?: any): S | undefined; (predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => unknown, thisArg?: any): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) | undefined; } & { <S extends { employeeId: string; fullName: string; projectMemberId: string | null; }>(predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => value is S, thisArg?: any): S | undefined; (predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => unknown, thisArg?: any): { employeeId: string; fullName: string; projectMemberId: string | null; } | undefined; }; findLastIndex: ((predicate: (value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, index: number, array: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) => unknown, thisArg?: any) => number) & ((predicate: (value: { employeeId: string; fullName: string; projectMemberId: string | null; }, index: number, array: { employeeId: string; fullName: string; projectMemberId: string | null; }[]) => unknown, thisArg?: any) => number); toReversed: (() => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) & (() => { employeeId: string; fullName: string; projectMemberId: string | null; }[]); toSorted: ((compareFn?: ((a: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }, b: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) => number) | undefined) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) & ((compareFn?: ((a: { employeeId: string; fullName: string; projectMemberId: string | null; }, b: { employeeId: string; fullName: string; projectMemberId: string | null; }) => number) | undefined) => { employeeId: string; fullName: string; projectMemberId: string | null; }[]); toSpliced: { (start: number, deleteCount: number, ...items: ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]; (start: number, deleteCount?: number): ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]; } & { (start: number, deleteCount: number, ...items: { employeeId: string; fullName: string; projectMemberId: string | null; }[]): { employeeId: string; fullName: string; projectMemberId: string | null; }[]; (start: number, deleteCount?: number): { employeeId: string; fullName: string; projectMemberId: string | null; }[]; }; with: ((index: number, value: { projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; }) => ({ projectMember: { id: string; } | null; employee: { id: string; fullName: string; }; } & { id: string; createdAt: Date; employeeId: string; taskId: string; projectMemberId: string | null; })[]) & ((index: number, value: { employeeId: string; fullName: string; projectMemberId: string | null; }) => { employeeId: string; fullName: string; projectMemberId: string | null; }[]) }; checklist: ({ id: string; title: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; order: number; taskId: string; completed: false | true })[]; comments: ({ author: { id: string; name: string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; body: string; taskId: string; authorId: string })[]; predecessors: ({ predecessor: { id: string; name: string }; id: string; createdAt: string /* ISO datetime */; predecessorId: string; successorId: string; lagDays: number })[]; id: string; description: null | string; status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED" | "DELAYED"; projectId: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; startDate: null | string /* ISO datetime */; endDate: null | string /* ISO datetime */; parentId: null | string; level: number; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; risk: "LOW" | "MEDIUM" | "HIGH"; isMilestone: false | true; duration: null | number; progress: number; responsible: null | string }
```

<a id="r081"></a>
### R081 — apiList

Sources: [src/app/api/projects/route.ts:22](../../src/app/api/projects/route.ts#L22).

```ts
({ _count: { assets: number; tasksList: number }; id: string; description: null | string; status: "ACTIVE" | "COMPLETED" | "ARCHIVED"; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; code: string; goals: null | string; tasks: null | string; results: null | string; startDate: null | string /* ISO datetime */; endDate: null | string /* ISO datetime */; plannedBudget: string /* Decimal */; actualBudget: string /* Decimal */; plannedRevenue: string /* Decimal */; actualRevenue: string /* Decimal */ })[]
```

<a id="r082"></a>
### R082 — NextResponse.json

Sources: [src/app/api/reports/custom/route.ts:29](../../src/app/api/reports/custom/route.ts#L29), [src/app/api/reports/custom/route.ts:38](../../src/app/api/reports/custom/route.ts#L38), [src/app/api/reports/custom/route.ts:52](../../src/app/api/reports/custom/route.ts#L52).

```ts
{ error: { code: string; message: string } }
```

<a id="r083"></a>
### R083 — NextResponse.json

Sources: [src/app/api/reports/custom/route.ts:69](../../src/app/api/reports/custom/route.ts#L69).

```ts
(Record<string, any>)[]
```

<a id="r084"></a>
### R084 — NextResponse.json

Sources: [src/app/api/reports/depreciation/route.ts:31](../../src/app/api/reports/depreciation/route.ts#L31).

```ts
{ assets: ({ id: string; name: string; inventoryNumber: string; initialCost: number; depreciation: number; residualValue: number; mol: string; department: string })[]; movements: ({ id: string; date: string /* ISO datetime */; type: "RECEIPT" | "TRANSFER" | "DISPOSAL" | "STATUS_CHANGE"; assetName: string; inventoryNumber: string; fromMol: string; toMol: string; quantity: number; reason: string })[] }
```

<a id="r085"></a>
### R085 — NextResponse.json

Sources: [src/app/api/reports/presets/route.ts:12](../../src/app/api/reports/presets/route.ts#L12).

```ts
({ id: string; createdAt: string /* ISO datetime */; name: string; createdById: string; filters: null | string | number | false | true | import("/Users/mac/Desktop/organization-erp/node_modules/@prisma/client/runtime/library").JsonObject | { length: number }; metrics: (string)[]; groupBy: null | string })[]
```

<a id="r086"></a>
### R086 — NextResponse.json

Sources: [src/app/api/reports/presets/route.ts:25](../../src/app/api/reports/presets/route.ts#L25).

```ts
{ id: string; createdAt: string /* ISO datetime */; name: string; createdById: string; filters: null | string | number | false | true | import("/Users/mac/Desktop/organization-erp/node_modules/@prisma/client/runtime/library").JsonObject | { length: number }; metrics: (string)[]; groupBy: null | string }
```

<a id="r087"></a>
### R087 — NextResponse.json

Sources: [src/app/api/reports/profitability/route.ts:33](../../src/app/api/reports/profitability/route.ts#L33).

```ts
({ id: string; code: string; name: string; plannedRevenue: number; actualRevenue: number; payrollCost: number; procurementCost: number; totalCost: number; profit: number; profitabilityRate: number })[]
```

<a id="r088"></a>
### R088 — NextResponse.json

Sources: [src/app/api/reports/turnover/route.ts:33](../../src/app/api/reports/turnover/route.ts#L33).

```ts
{ activeAtStart: number; activeAtEnd: number; dismissedCount: number; hiredCount: number; averageHeadcount: number; turnoverRate: number }
```

<a id="r089"></a>
### R089 — NextResponse.json

Sources: [src/app/api/reports/vacations/route.ts:31](../../src/app/api/reports/vacations/route.ts#L31).

```ts
({ id: string; employeeName: string; department: string; startDate: string /* ISO datetime */; endDate: string /* ISO datetime */; type: "VACATION" | "SICK_LEAVE" | "BUSINESS_TRIP" | "UNPAID_LEAVE"; durationDays: number })[]
```

<a id="r090"></a>
### R090 — apiData

Sources: [src/app/api/search/route.ts:13](../../src/app/api/search/route.ts#L13).

```ts
({ id: string; type: "asset" | "project" | "task" | "employee" | "document"; title: string; subtitle: string; href: string })[]
```

<a id="r091"></a>
### R091 — apiData

Sources: [src/app/api/staff-schedule/[id]/route.ts:37](../../src/app/api/staff-schedule/%5Bid%5D/route.ts#L37), [src/app/api/staff-schedule/route.ts:33](../../src/app/api/staff-schedule/route.ts#L33).

```ts
{ department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; departmentId: string; position: string; rate: string /* Decimal */; salary: string /* Decimal */ }
```

<a id="r092"></a>
### R092 — apiData

Sources: [src/app/api/staff-schedule/route.ts:20](../../src/app/api/staff-schedule/route.ts#L20).

```ts
({ occupiedRate: number; freeRate: number; departmentRef: { isActive: false | true }; employees: ({ department: string; id: string; status: "ACTIVE" | "ON_VACATION" | "ON_SICK_LEAVE" | "DISMISSED"; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; code: string; departmentId: string; fullName: string; photo: null | string; contractType: "PRIMARY" | "INTERNAL" | "EXTERNAL"; contractSignedDate: null | string /* ISO datetime */; contractEndDate: null | string /* ISO datetime */; contractNumber: null | string; phone: null | string; email: null | string; birthDate: null | string /* ISO datetime */; education: null | string; qualification: null | string; managerId: null | string; staffScheduleId: null | string; employmentRate: string /* Decimal */ })[]; department: string; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; departmentId: string; position: string; rate: string /* Decimal */; salary: string /* Decimal */ })[]
```

<a id="r093"></a>
### R093 — apiData

Sources: [src/app/api/tasks/[id]/comments/route.ts:23](../../src/app/api/tasks/%5Bid%5D/comments/route.ts#L23).

```ts
{ author: { id: string; name: string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; body: string; taskId: string; authorId: string }
```

<a id="r094"></a>
### R094 — apiData

Sources: [src/app/api/time-entries/[id]/route.ts:18](../../src/app/api/time-entries/%5Bid%5D/route.ts#L18), [src/app/api/time-entries/route.ts:31](../../src/app/api/time-entries/route.ts#L31).

```ts
{ id: string; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: string; type: "VACATION" | "SICK_LEAVE" | "BUSINESS_TRIP" | "REGULAR" | "OVERTIME"; note: null | string; taskId: null | string; workDate: string /* ISO datetime */; hours: string /* Decimal */ }
```

<a id="r095"></a>
### R095 — apiData

Sources: [src/app/api/time-entries/route.ts:22](../../src/app/api/time-entries/route.ts#L22).

```ts
{ employees: ({ department: string; id: string; code: string; fullName: string })[]; projects: ({ id: string; name: string; code: string; tasksList: ({ id: string; name: string })[] })[]; year: number; month: number; normativeHours: number; entries: ({ project: null | { id: string; name: string; code: string }; task: null | { id: string; name: string }; employee: { department: string; staffSchedule: null | { position: string; salary: string /* Decimal */ }; id: string; code: string; fullName: string; employmentRate: string /* Decimal */ }; id: string; projectId: null | string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: string; type: "VACATION" | "SICK_LEAVE" | "BUSINESS_TRIP" | "REGULAR" | "OVERTIME"; note: null | string; taskId: null | string; workDate: string /* ISO datetime */; hours: string /* Decimal */ })[]; timesheets: ({ employee: { id: string; fullName: string; code: string; department: string; departmentId: string }; submittedBy: null | { id: string; name: string }; decidedBy: null | { id: string; name: string }; id: string; status: "DRAFT" | "APPROVED" | "SUBMITTED" | "RETURNED"; submittedAt: null | string /* ISO datetime */; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: string; decidedAt: null | string /* ISO datetime */; year: number; month: number; zeroHoursConfirmed: false | true; submittedById: null | string; decidedById: null | string; decisionReason: null | string } | { id: string; employeeId: string; year: number; month: number; status: "DRAFT"; zeroHoursConfirmed: false | true; submittedById: null; submittedBy: null; submittedAt: null; decidedById: null; decidedBy: null; decidedAt: null; decisionReason: null; employee: { id: string; fullName: string; code: string; department: string; departmentId: string } })[]; period: { status: "OPEN" | "CLOSED" }; summaries: ({ employeeId: string; employeeName: string; department: string; rate: number; baseSalary: number; regularHours: number; vacationHours: number; sickHours: number; tripHours: number; overtimeHours: number; calculatedSalary: number; projectCost: number; projectHours: number; projectOvertimeHours: number })[] }
```

<a id="r096"></a>
### R096 — apiData

Sources: [src/app/api/timekeeping/timesheets/[id]/decision/route.ts:18](../../src/app/api/timekeeping/timesheets/%5Bid%5D/decision/route.ts#L18), [src/app/api/timekeeping/timesheets/route.ts:14](../../src/app/api/timekeeping/timesheets/route.ts#L14).

```ts
{ id: string; status: "DRAFT" | "APPROVED" | "SUBMITTED" | "RETURNED"; submittedAt: null | string /* ISO datetime */; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; employeeId: string; decidedAt: null | string /* ISO datetime */; year: number; month: number; zeroHoursConfirmed: false | true; submittedById: null | string; decidedById: null | string; decisionReason: null | string }
```

<a id="r097"></a>
### R097 — apiData

Sources: [src/app/api/users/[id]/route.ts:28](../../src/app/api/users/%5Bid%5D/route.ts#L28), [src/app/api/users/route.ts:26](../../src/app/api/users/route.ts#L26).

```ts
{ employee: null | { id: string; code: string; fullName: string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; username: string; role: "ADMIN" | "EDITOR" | "VIEWER"; isActive: false | true; mustChangePassword: false | true; lockedUntil: null | string /* ISO datetime */; lastLoginAt: null | string /* ISO datetime */; employeeId: null | string; roleAssignments: ({ id: string; role: "ADMIN" | "HR" | "ACCOUNTANT" | "PROJECT_MANAGER" | "ASSET_CUSTODIAN" | "DEPARTMENT_HEAD" | "AUDITOR" | "EMPLOYEE"; departmentScopeMode: "NONE" | "ALL" | "ASSIGNED" | "SELF"; projectScopeMode: "NONE" | "ALL" | "ASSIGNED" | "SELF"; departmentScopes: ({ departmentId: string })[]; projectScopes: ({ projectId: string })[] })[] }
```

<a id="r098"></a>
### R098 — apiList

Sources: [src/app/api/users/route.ts:15](../../src/app/api/users/route.ts#L15).

```ts
({ employee: null | { id: string; code: string; fullName: string }; id: string; createdAt: string /* ISO datetime */; updatedAt: string /* ISO datetime */; name: string; username: string; role: "ADMIN" | "EDITOR" | "VIEWER"; isActive: false | true; mustChangePassword: false | true; lockedUntil: null | string /* ISO datetime */; lastLoginAt: null | string /* ISO datetime */; employeeId: null | string; roleAssignments: ({ id: string; role: "ADMIN" | "HR" | "ACCOUNTANT" | "PROJECT_MANAGER" | "ASSET_CUSTODIAN" | "DEPARTMENT_HEAD" | "AUDITOR" | "EMPLOYEE"; departmentScopeMode: "NONE" | "ALL" | "ASSIGNED" | "SELF"; projectScopeMode: "NONE" | "ALL" | "ASSIGNED" | "SELF"; departmentScopes: ({ departmentId: string })[]; projectScopes: ({ projectId: string })[] })[] })[]
```

<a id="r099"></a>
### R099 — apiData

Sources: [src/app/api/vacations/[id]/route.ts:31](../../src/app/api/vacations/%5Bid%5D/route.ts#L31), [src/app/api/vacations/route.ts:29](../../src/app/api/vacations/route.ts#L29).

```ts
{ employee: { department: string; id: string; fullName: string }; id: string; createdAt: string /* ISO datetime */; employeeId: string; startDate: string /* ISO datetime */; endDate: string /* ISO datetime */; type: "VACATION" | "SICK_LEAVE" | "BUSINESS_TRIP" | "UNPAID_LEAVE" }
```

<a id="r100"></a>
### R100 — apiData

Sources: [src/app/api/vacations/route.ts:16](../../src/app/api/vacations/route.ts#L16).

```ts
({ employee: { department: string; id: string; fullName: string }; id: string; createdAt: string /* ISO datetime */; employeeId: string; startDate: string /* ISO datetime */; endDate: string /* ISO datetime */; type: "VACATION" | "SICK_LEAVE" | "BUSINESS_TRIP" | "UNPAID_LEAVE" })[]
```

## Зафиксированные неоднородности и места для решения при переносе

- Envelope нельзя унифицировать скрыто: API-data/list, procurement list summary, inventory detail pagination ВНУТРИ data, time-entry объединённый month+options, raw finance/member/project-payroll/report JSON, 204 saved-view/preset deletes, binary responses и NextAuth cookies/redirects.
- В HTTP сейчас отсутствует формальное runtime response schema. Реальные сериализаторы важны: Decimal/date/null как Prisma JSON; finance/member toFixed strings; document version sizeBytes string и storageKey отсутствует; procurement numeric amounts и effective status, payroll numbers. Response type snapshot задаёт поля, source return/serializer задаёт фактические values.
- Approval cancel возвращает current record до mutation; linked document меняется отдельно от shape response. Approval notification publish после commit и failure подавляется: audit/domain атомарны, delivery intent с domain mutation сейчас не атомарен.
- Procurement submit/capitalize являются составными сценариями из разных транзакций. У phase migration должен быть один owner целого сценария; текущее partially committed поведение нельзя назвать единым UoW.
- Resource scopes неодинаковы: timekeeping привилегированные roles используют global bypass; submit ADMIN/HR отличается от scoped decision fallback; payroll project forecasts/options и procurement reference lists global; project member availableEmployees global; assets.update/create новый project link отдельно не scoped. Это текущие predicates/permission kind, не автоматически доказанные уязвимости.
- DELETE employee означает dismiss/archive; DELETE member отсутствует — PATCH isArchived; DELETE project/group/mol/position/preset/notification/adjustment может физически удалять. Повторный add-member реактивирует имеющуюся запись.
- Finance/member/project payroll validateRequest→400 string error; generic malformed JSON у них→500. Report custom/preset ловит DB/render errors как Invalid JSON 400. SMTP validation→400 BAD_REQUEST без fieldErrors; NextAuth свои HTML/string errors и 401 JSON url.
- SMTP GET возвращает password пустой строкой, но POST settings/test требуют min(1); fallback existing password в test недостижим. Personnel-actions sync требует scoped permission, но route не передаёт access helper и sync global.
- Некоторые даты проверяются лишь nonempty/regex/lexicographic order, другие coerce.date/string.date и service Date validation. Query parseInt finance/project-payroll принимает числовой префикс. Time-entry delete malformed JSON silently default {}. Эти отличия явно сохранены.
- Health GET ready публично выполняет SQL SELECT 1 и storage.healthCheck; любой сбой даёт DATABASE_UNAVAILABLE 503, включая недоступность storage; GET documents/download и reports/export пишут audit. Экспорт stream может упасть после начала 200. Range/304 и upload multipart для documents не реализованы.
- Здесь не утверждается успешное runtime выполнение, защищённость concurrent cases или эквивалентность future Python implementation. Контрактные fixtures/baseline/API↔UI inventory покрывают эти утверждения отдельными документами этапа 00.
