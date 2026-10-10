import { PrismaClient } from '@prisma/client'
import { hash } from '@node-rs/argon2'

export const E2E_ADMIN = { username: 'e2e-admin', password: 'E2e-Admin-Password-2026!' }
export const E2E_VIEWER = { username: 'e2e-viewer', password: 'E2e-Viewer-Password-2026!' }
export const E2E_FORCED = { username: 'e2e-forced', password: 'E2e-Forced-Password-2026!' }
export const E2E_CUSTODIAN = { username: 'e2e-custodian', password: 'E2e-Custodian-Password-2026!' }

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for E2E tests')
  const db = new PrismaClient()
  try {
    for (const fixture of [
      { ...E2E_ADMIN, name: 'E2E Admin', role: 'ADMIN' as const, appRole: 'ADMIN' as const, mustChangePassword: false },
      { ...E2E_VIEWER, name: 'E2E Viewer', role: 'VIEWER' as const, appRole: 'AUDITOR' as const, mustChangePassword: false },
      { ...E2E_FORCED, name: 'E2E Forced Change', role: 'VIEWER' as const, appRole: 'AUDITOR' as const, mustChangePassword: true },
      { ...E2E_CUSTODIAN, name: 'E2E Scoped Custodian', role: 'VIEWER' as const, appRole: 'ASSET_CUSTODIAN' as const, mustChangePassword: false },
    ]) {
      const user = await db.user.upsert({
        where: { username: fixture.username },
        update: {
          passwordHash: await hash(fixture.password), role: fixture.role,
          isActive: true, mustChangePassword: fixture.mustChangePassword, failedLoginAttempts: 0, lockedUntil: null,
        },
        create: {
          username: fixture.username, name: fixture.name,
          passwordHash: await hash(fixture.password), role: fixture.role, mustChangePassword: fixture.mustChangePassword,
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
    const outsideDepartment = await db.department.upsert({
      where: { name: 'E2E Outside Scope' },
      update: { isActive: true },
      create: { code: 'DEP-E2E-OUT', name: 'E2E Outside Scope' },
    })
    const custodian = await db.user.findUniqueOrThrow({ where: { username: E2E_CUSTODIAN.username } })
    const custodianAssignment = await db.userRoleAssignment.upsert({
      where: { userId_role: { userId: custodian.id, role: 'ASSET_CUSTODIAN' } },
      update: { departmentScopeMode: 'ASSIGNED', projectScopeMode: 'NONE' },
      create: {
        userId: custodian.id,
        role: 'ASSET_CUSTODIAN',
        departmentScopeMode: 'ASSIGNED',
        projectScopeMode: 'NONE',
      },
    })
    await db.userDepartmentScope.deleteMany({ where: { roleAssignmentId: custodianAssignment.id } })
    await db.userDepartmentScope.create({
      data: { roleAssignmentId: custodianAssignment.id, departmentId: qaDepartment.id },
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
        where: { code: 'E2E-MOL-OUTSIDE' },
        update: { departmentId: outsideDepartment.id, department: outsideDepartment.name },
        create: {
          code: 'E2E-MOL-OUTSIDE', fullName: 'E2E Вне области доступа',
          departmentId: outsideDepartment.id, department: outsideDepartment.name, storageLocation: 'Склад 3',
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
