import { getDb } from '../src/lib/prisma'
import { getDocumentStorage } from '../src/features/documents/infrastructure/document-storage'

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
    departmentSnapshotMismatch,
    documentCurrentVersionMismatch,
    unsafeDocumentMetadata,
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
    db.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT employee."id"
        FROM "employees" employee
        JOIN "departments" department ON department."id" = employee."departmentId"
        WHERE employee."department" <> department."name"
        UNION ALL
        SELECT position."id"
        FROM "staff_schedule" position
        JOIN "departments" department ON department."id" = position."departmentId"
        WHERE position."department" <> department."name"
        UNION ALL
        SELECT mol."id"
        FROM "mols" mol
        JOIN "departments" department ON department."id" = mol."departmentId"
        WHERE mol."department" <> department."name"
      ) mismatches
    `,
    db.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "documents" document
      LEFT JOIN "document_versions" version
        ON version."documentId" = document."id"
       AND version."versionNumber" = document."currentVersion"
      WHERE version."id" IS NULL
    `,
    db.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "document_versions"
      WHERE "storageKey" !~ '^[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f-]{36}$'
         OR "sha256" !~ '^[0-9a-f]{64}$'
         OR "sizeBytes" <= 0
    `,
  ])
  const versions = await db.documentVersion.findMany({
    select: { storageKey: true, sizeBytes: true, sha256: true },
  })
  const storage = getDocumentStorage()
  let missingOrCorruptDocumentFiles = 0
  for (const version of versions) {
    if (!await storage.verify(version.storageKey, version)) {
      missingOrCorruptDocumentFiles += 1
    }
  }
  const result = {
    holdingMismatch: Number(holdingMismatch[0]?.count || 0),
    negativeAssets: Number(negativeAssets[0]?.count || 0),
    negativeHoldings: Number(negativeHoldings[0]?.count || 0),
    orphanHoldings: Number(orphanHoldings[0]?.count || 0),
    secretAuditRows: Number(secretAuditRows[0]?.count || 0),
    departmentCycles: Number(departmentCycles[0]?.count || 0),
    duplicateDepartmentCodes: Number(duplicateDepartmentCodes[0]?.count || 0),
    duplicateDepartmentNames: Number(duplicateDepartmentNames[0]?.count || 0),
    departmentSnapshotMismatch: Number(departmentSnapshotMismatch[0]?.count || 0),
    documentCurrentVersionMismatch: Number(documentCurrentVersionMismatch[0]?.count || 0),
    unsafeDocumentMetadata: Number(unsafeDocumentMetadata[0]?.count || 0),
    missingOrCorruptDocumentFiles,
  }
  console.info(JSON.stringify(result, null, 2))
  await db.$disconnect()
  if (Object.values(result).some((count) => count !== 0)) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
