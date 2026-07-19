import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let client: any | undefined

export function getDb(): PrismaClient {
  if (!client) {
    const rawClient = globalForPrisma.prisma ?? new PrismaClient()
    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = rawClient
    }

    client = rawClient.$extends({
      query: {
        auditLog: {
          update() {
            throw new Error('AuditLog entries are immutable and cannot be updated.')
          },
          updateMany() {
            throw new Error('AuditLog entries are immutable and cannot be updated.')
          },
          delete() {
            throw new Error('AuditLog entries are immutable and cannot be deleted.')
          },
          deleteMany() {
            throw new Error('AuditLog entries are immutable and cannot be deleted.')
          },
          upsert() {
            throw new Error('AuditLog entries are immutable and cannot be modified.')
          },
        },
      },
    })
  }

  return client as unknown as PrismaClient
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
