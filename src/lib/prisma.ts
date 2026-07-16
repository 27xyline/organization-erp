import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let client: PrismaClient | undefined

export function getDb(): PrismaClient {
  client ??= globalForPrisma.prisma ?? new PrismaClient()

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client
  }

  return client
}

// Compatibility proxy for existing modules. Accessing a Prisma property creates
// the client lazily, so importing this module remains safe during `next build`.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const db = getDb()
    const value = Reflect.get(db, property, db)
    return typeof value === 'function' ? value.bind(db) : value
  },
})
