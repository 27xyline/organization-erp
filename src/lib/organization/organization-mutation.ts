import { Prisma, type PrismaClient } from '@prisma/client'

export const ORGANIZATION_ADVISORY_LOCK_KEY = 904202607

type OrganizationLockClient = Pick<Prisma.TransactionClient, '$queryRaw'>

export async function acquireOrganizationMutationLock(db: OrganizationLockClient) {
  // PostgreSQL exposes pg_advisory_xact_lock as void. Cast it to text so
  // Prisma can deserialize the result while the lock remains transaction-scoped.
  await db.$queryRaw<Array<{ lock: string }>>`
    SELECT pg_advisory_xact_lock(${ORGANIZATION_ADVISORY_LOCK_KEY})::text AS "lock"
  `
}

export function withOrganizationMutation<T>(
  db: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(async (tx) => {
    // Keep this before the operation callback: every organization mutation
    // must serialize before reading departments, positions, capacity, or heads.
    await acquireOrganizationMutationLock(tx)
    return operation(tx)
  })
}
