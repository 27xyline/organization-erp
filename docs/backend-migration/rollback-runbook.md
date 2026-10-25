# Stage 14C: rollback rehearsal

Статус: **restore disposable DB + document volume и изолированная репетиция TypeScript route rollback выполнены**. Production cutover/rollback не выполнялся.

Все действия относятся только к `org-erp-stage14c-rehearsal-20261024`, disposable базам `erp_stage14c_e2e` и `erp_stage14c_rollback` и их документам. Нельзя использовать `project1`, другие Compose проекты или production. Одна только смена env-флага не является rollback.

## Фактический restore rehearsal

Backup снимался после первого Stage14C сценария и до заключительного полного cross-module прогона. Это синтетический rehearsal snapshot, а не backup текущей production-среды.

| Gate | Фактический результат |
|---|---|
| DB backup | `rollback-stage14c.dump`, custom format; SHA-256 `1fb0850feae4aa2e242965a9ecc70ca3322dab5e6930f783236759ecbcac74fe` |
| DB restore | Восстановлен в новую `erp_stage14c_rollback`; `pg_restore --exit-on-error --no-owner` завершился успешно; 54 public tables |
| Document copy | 70 файлов; каждый относительный путь, размер и SHA-256 совпал с post-flow manifest |
| Legacy TS compatibility | `@prisma/client` выполнил read-only counts: User 13, Employee 42, Project 28, Task 199, ProcurementRequest 37, Asset 123, Document 63, DocumentVersion 70, Timesheet 80, PayrollPeriod 8 |
| Routing rollback | Snapshot legacy TypeScript runtime `d29003d8adb9` собран через `next build --webpack` и временно обслуживал app entrypoint `127.0.0.1:3302`; он был подключён только к `erp_stage14c_rollback` и `rollback-documents` |
| Legacy auth and CRUD smoke | NextAuth login прошёл; ADMIN прочитал подразделения, создал и удалил тестовое подразделение; после cleanup тестовая строка отсутствовала |
| Scoped read/write smoke | ASSET_CUSTODIAN видел актив в своём scope и не видел внешний; POST актива с внешним MOL вернул 403, запись не появилась |
| Legacy documents smoke | TS API прочитал список и скачал документ из rollback-копии; получено 45 байт |
| Notifications | В исходной rehearsal DB после E2E `notification_outbox` и active claims пусты; внешний SMTP не использовался |
| Sessions | Python `erp_session` несовместима с NextAuth cookie; при фактическом возврате legacy runtime потребуется новый login |

Backup и файловые артефакты, включая manifest/count snapshots, лежат вне репозитория в `/private/tmp/organization-erp-stage14c-20261024/`. Пароли в отчёты и команды не копировать.

## Проверенный порядок восстановления копии

```sh
# Передавать dump в disposable PostgreSQL и восстанавливать только в новую копию:
docker exec <postgres-container> createdb -U <db-user> -O <db-user> erp_stage14c_rollback
docker exec <postgres-container> pg_restore --exit-on-error --no-owner \
  -U <db-user> -d erp_stage14c_rollback /tmp/rollback-stage14c.dump

# Проверить legacy read compatibility только чтением через Prisma Client:
DATABASE_URL='<disposable URL>/erp_stage14c_rollback' node <read-only-prisma-count-script>
```

В репетиции эта последовательность выполнена с реальным dump. Не восстанавливать поверх `erp_stage14c_e2e` и не удалять исходную rehearsal DB до явного решения о сохранении.

## Фактическая route rollback rehearsal

Для репетиции использован исходный TS snapshot `d29003d8adb9` (родитель Stage 01 commit `a1e5ba0`), собранный локальным Next.js 16.3.4 через Webpack. На освобождённом app entrypoint `127.0.0.1:3302` временно работал только этот TS runtime; текущие Compose app/backend/worker в этот момент не обслуживали rollback DB. Runtime получил URL только к `erp_stage14c_rollback` и путь только к восстановленной копии `rollback-documents`. Свежие API contexts вошли через NextAuth; Python session cookies не переносились.

Проверены ADMIN read/create/delete через `/api/departments`, список и download через `/api/documents`, а также scoped read/write через `/api/assets`: in-scope asset доступен, out-of-scope asset скрыт, создание для внешнего MOL запрещено с 403. Созданное тестовое подразделение удалено; отказанная asset запись отсутствует. Сетевые SMTP и notification worker не подключались. Smoke затрагивал только восстановленную копию, не исходную `erp_stage14c_e2e` и не production.

## Порядок для реального окна routing rollback

Перед production переключением по-прежнему требуется отдельное поручение и backup. Runbook не обещает универсальный rollback одним env-флагом:

1. Включить maintenance fence, проверить 503 на unsafe route и дождаться активных запросов.
2. Остановить Python и TypeScript notification processors; подтвердить отсутствие worker claims и выбрать одного владельца.
3. Выбрать согласованный источник истины: текущая совместимая схема либо восстановленная пара DB+documents. Не подключать старый Prisma migration job к схеме Alembic.
4. Переключить BFF на legacy TypeScript runtime только после реальной проверки нужных колонок/constraints на копии.
5. Выполнить login и scoped read/write smoke. Удалить Python session cookie и потребовать повторный вход через NextAuth.
6. Сверить DB relations/counts и document hashes, audit/outbox и отсутствие повторной отправки внешних эффектов.
7. Снимать maintenance только после успешного smoke. Зафиксировать время backup, revisions, image/code revision, fingerprints и все потери/повторы.

Production переключение/rollback требует отдельного поручения и своего проверенного backup. Текущая репетиция подтверждает restore копии и чтение legacy моделей, но не утверждает, что любое более позднее состояние можно автоматически вернуть на TypeScript.
