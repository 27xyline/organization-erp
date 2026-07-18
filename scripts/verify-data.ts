import { getDb } from '../src/lib/prisma'

interface CountRow { count: bigint }

async function main() {
  const db = getDb()
  const [
    holdingMismatch,
    negativeAssets,
    negativeHoldings,
    orphanHoldings,
    secretAuditRows,
    departmentCycles,
    duplicateDepartmentCodes,
    duplicateDepartmentNames,
  ] = await Promise.all([
    db.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "assets" asset
      LEFT JOIN (
        SELECT "assetId", COALESCE(SUM("quantity"), 0) AS quantity
        FROM "asset_holdings"
        GROUP BY "assetId"
      ) holding ON holding."assetId" = asset."id"
      WHERE COALESCE(holding.quantity, 0) <> asset."quantity"
    `,
    db.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count FROM "assets"
      WHERE "quantity" < 0 OR "unitPrice" < 0 OR "totalCost" < 0
    `,
    db.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count FROM "asset_holdings" WHERE "quantity" < 0
    `,
    db.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "asset_holdings" holding
      LEFT JOIN "assets" asset ON asset."id" = holding."assetId"
      LEFT JOIN "mols" mol ON mol."id" = holding."molId"
      WHERE asset."id" IS NULL OR mol."id" IS NULL
    `,
    db.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count FROM "audit_logs"
      WHERE COALESCE("details"::text, '') ~* '(passwordHash|temporaryPassword|NEXTAUTH_SECRET)'
    `,
    db.$queryRaw<CountRow[]>`
      WITH RECURSIVE hierarchy AS (
        SELECT "id" AS "originId", "parentId", ARRAY["id"] AS path, false AS cycle
        FROM "departments"
        UNION ALL
        SELECT hierarchy."originId", parent."parentId",
               hierarchy.path || parent."id",
               parent."id" = ANY(hierarchy.path)
        FROM hierarchy
        JOIN "departments" parent ON parent."id" = hierarchy."parentId"
        WHERE NOT hierarchy.cycle
      )
      SELECT COUNT(DISTINCT "originId")::bigint AS count
      FROM hierarchy
      WHERE cycle
    `,
    db.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT LOWER("code")
        FROM "departments"
        GROUP BY LOWER("code")
        HAVING COUNT(*) > 1
      ) duplicates
    `,
    db.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT LOWER("name")
        FROM "departments"
        GROUP BY LOWER("name")
        HAVING COUNT(*) > 1
      ) duplicates
    `,
  ])
  const result = {
    holdingMismatch: Number(holdingMismatch[0]?.count || 0),
    negativeAssets: Number(negativeAssets[0]?.count || 0),
    negativeHoldings: Number(negativeHoldings[0]?.count || 0),
    orphanHoldings: Number(orphanHoldings[0]?.count || 0),
    secretAuditRows: Number(secretAuditRows[0]?.count || 0),
    departmentCycles: Number(departmentCycles[0]?.count || 0),
    duplicateDepartmentCodes: Number(duplicateDepartmentCodes[0]?.count || 0),
    duplicateDepartmentNames: Number(duplicateDepartmentNames[0]?.count || 0),
  }
  console.info(JSON.stringify(result, null, 2))
  await db.$disconnect()
  if (Object.values(result).some((count) => count !== 0)) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
