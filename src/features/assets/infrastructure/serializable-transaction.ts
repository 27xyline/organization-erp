import { Prisma } from '@prisma/client'
import { getDb } from '@/lib/prisma'
import { AssetServiceError } from '../domain/errors'

export async function serializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { timeout?: number } = {},
): Promise<T> {
  const db = getDb()
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        ...(options.timeout ? { timeout: options.timeout } : {}),
      })
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
      if (!retryable || attempt === 3) {
        if (retryable) throw new AssetServiceError('CONCURRENT_UPDATE')
        throw error
      }
    }
  }
  throw new AssetServiceError('CONCURRENT_UPDATE')
}
