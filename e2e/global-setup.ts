import { PrismaClient } from '@prisma/client'
import { hash } from '@node-rs/argon2'

export const E2E_ADMIN = { username: 'e2e-admin', password: 'E2e-Admin-Password-2026!' }
export const E2E_VIEWER = { username: 'e2e-viewer', password: 'E2e-Viewer-Password-2026!' }

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for E2E tests')
  const db = new PrismaClient()
  try {
    for (const fixture of [
      { ...E2E_ADMIN, name: 'E2E Admin', role: 'ADMIN' as const, appRole: 'ADMIN' as const },
      { ...E2E_VIEWER, name: 'E2E Viewer', role: 'VIEWER' as const, appRole: 'AUDITOR' as const },
    ]) {
      const user = await db.user.upsert({
        where: { username: fixture.username },
        update: {
          passwordHash: await hash(fixture.password), role: fixture.role,
          isActive: true, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null,
        },
        create: {
          username: fixture.username, name: fixture.name,
          passwordHash: await hash(fixture.password), role: fixture.role, mustChangePassword: false,
        },
      })
      await db.$transaction([
        db.userRoleAssignment.deleteMany({
          where: { userId: user.id, role: { not: fixture.appRole } },
        }),
        db.userRoleAssignment.upsert({
          where: { userId_role: { userId: user.id, role: fixture.appRole } },
          update: { departmentScopeMode: 'ALL', projectScopeMode: 'ALL' },
          create: {
            userId: user.id,
            role: fixture.appRole,
            departmentScopeMode: 'ALL',
            projectScopeMode: 'ALL',
          },
        }),
      ])
    }
    const qaDepartment = await db.department.upsert({
      where: { name: 'QA' },
      update: { isActive: true },
      create: { code: 'DEP-QA', name: 'QA' },
    })
    await Promise.all([
      db.mol.upsert({
        where: { code: 'E2E-MOL-1' },
        update: { departmentId: qaDepartment.id, department: qaDepartment.name },
        create: {
          code: 'E2E-MOL-1', fullName: 'E2E Отправитель',
          departmentId: qaDepartment.id, department: qaDepartment.name, storageLocation: 'Склад 1',
        },
      }),
      db.mol.upsert({
        where: { code: 'E2E-MOL-2' },
        update: { departmentId: qaDepartment.id, department: qaDepartment.name },
        create: {
          code: 'E2E-MOL-2', fullName: 'E2E Получатель',
          departmentId: qaDepartment.id, department: qaDepartment.name, storageLocation: 'Склад 2',
        },
      }),
      db.assetGroup.upsert({ where: { code: 'E2E' }, update: {}, create: { code: 'E2E', name: 'E2E группа' } }),
    ])
  } finally {
    await db.$disconnect()
  }
}
