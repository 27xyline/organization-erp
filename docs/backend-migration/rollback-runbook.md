# Stage 14C: rollback rehearsal

Статус: **restore disposable DB + document volume выполнен; legacy Prisma read smoke прошёл. BFF/runtime обратно на TypeScript не переключался**, поэтому route rollback и production rollback не доказаны.

Все действия относятся только к `org-erp-stage14c-rehearsal-20261024`, disposable базам `erp_stage14c_e2e` и `erp_stage14c_rollback` и их документам. Нельзя использовать `project1`, другие Compose проекты или production. Одна только смена env-флага не является rollback.

## Фактический restore rehearsal

Backup снимался после первого Stage14C сценария и до заключительного полного cross-module прогона. Это синтетический rehearsal snapshot, а не backup текущей production-среды.

| Gate | Фактический результат |
|---|---|
| DB backup | `rollback-stage14c.dump`, custom format; SHA-256 `1fb0850feae4aa2e242965a9ecc70ca3322dab5e6930f783236759ecbcac74fe` |
| DB restore | Восстановлен в новую `erp_stage14c_rollback`; `pg_restore --exit-on-error --no-owner` завершился успешно; 54 public tables |
| Document copy | 70 файлов; каждый относительный путь, размер и SHA-256 совпал с post-flow manifest |
| Legacy TS compatibility | `@prisma/client` выполнил read-only counts: User 13, Employee 42, Project 28, Task 199, ProcurementRequest 37, Asset 123, Document 63, DocumentVersion 70, Timesheet 80, PayrollPeriod 8 |
| Routing rollback | Не выполнялся; restored copy не подключалась к web runtime |
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

## Процедура полноценного routing rollback

Перед переключением назад требуется отдельный разрешённый rehearsal, который ещё не проведён:

1. Включить maintenance fence, проверить 503 на unsafe route и дождаться активных запросов.
2. Остановить Python и TypeScript notification processors; подтвердить отсутствие worker claims и выбрать одного владельца.
3. Выбрать согласованный источник истины: текущая совместимая схема либо восстановленная пара DB+documents. Не подключать старый Prisma migration job к схеме Alembic.
4. Переключить BFF на legacy TypeScript runtime только после реальной проверки нужных колонок/constraints на копии.
5. Выполнить login и scoped read/write smoke. Удалить Python session cookie и потребовать повторный вход через NextAuth.
6. Сверить DB relations/counts и document hashes, audit/outbox и отсутствие повторной отправки внешних эффектов.
7. Снимать maintenance только после успешного smoke. Зафиксировать время backup, revisions, image/code revision, fingerprints и все потери/повторы.

Production переключение/rollback требует отдельного поручения и своего проверенного backup. Текущая репетиция подтверждает restore копии и чтение legacy моделей, но не утверждает, что любое более позднее состояние можно автоматически вернуть на TypeScript.
