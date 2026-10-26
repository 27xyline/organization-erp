import { PrismaClient } from '@prisma/client'
import { hash } from '@node-rs/argon2'

export const E2E_ADMIN = { username: 'e2e-admin', password: 'E2e-Admin-Password-2026!' }
export const E2E_VIEWER = { username: 'e2e-viewer', password: 'E2e-Viewer-Password-2026!' }
export const E2E_FORCED = { username: 'e2e-forced', password: 'E2e-Forced-Password-2026!' }
export const E2E_CUSTODIAN = { username: 'e2e-custodian', password: 'E2e-Custodian-Password-2026!' }
export const E2E_HR = { username: 'e2e-hr', password: 'E2e-HR-Password-2026!' }
export const E2E_EMPLOYEE = { username: 'e2e-employee', password: 'E2e-Employee-Password-2026!' }

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for E2E tests')
  const db = new PrismaClient()
  try {
    for (const fixture of [
      { ...E2E_ADMIN, name: 'E2E Admin', role: 'ADMIN' as const, appRole: 'ADMIN' as const, mustChangePassword: false },
      { ...E2E_VIEWER, name: 'E2E Viewer', role: 'VIEWER' as const, appRole: 'AUDITOR' as const, mustChangePassword: false },
      { ...E2E_FORCED, name: 'E2E Forced Change', role: 'VIEWER' as const, appRole: 'AUDITOR' as const, mustChangePassword: true },
      { ...E2E_CUSTODIAN, name: 'E2E Scoped Custodian', role: 'VIEWER' as const, appRole: 'ASSET_CUSTODIAN' as const, mustChangePassword: false },
      { ...E2E_HR, name: 'E2E Scoped HR', role: 'VIEWER' as const, appRole: 'HR' as const, mustChangePassword: false },
      { ...E2E_EMPLOYEE, name: 'E2E Employee', role: 'VIEWER' as const, appRole: 'EMPLOYEE' as const, mustChangePassword: false },
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
    const hr = await db.user.findUniqueOrThrow({ where: { username: E2E_HR.username } })
    const hrAssignment = await db.userRoleAssignment.upsert({
      where: { userId_role: { userId: hr.id, role: 'HR' } },
      update: { departmentScopeMode: 'ASSIGNED', projectScopeMode: 'NONE' },
      create: {
        userId: hr.id, role: 'HR', departmentScopeMode: 'ASSIGNED', projectScopeMode: 'NONE',
      },
    })
    await db.userDepartmentScope.deleteMany({ where: { roleAssignmentId: hrAssignment.id } })
    await db.userDepartmentScope.create({
      data: { roleAssignmentId: hrAssignment.id, departmentId: qaDepartment.id },
    })
    const employeePosition = await db.staffSchedule.upsert({
      where: { id: 'e2e-employee-position' },
      update: { department: qaDepartment.name, departmentId: qaDepartment.id },
      create: {
        id: 'e2e-employee-position', position: 'E2E employee position', department: qaDepartment.name,
        departmentId: qaDepartment.id, rate: 1, salary: 100_000,
      },
    })
    const employee = await db.employee.upsert({
      where: { code: 'E2E-EMPLOYEE-SCOPE' },
      update: { department: qaDepartment.name, departmentId: qaDepartment.id, staffScheduleId: employeePosition.id },
      create: {
        code: 'E2E-EMPLOYEE-SCOPE', fullName: 'E2E Scoped Employee', department: qaDepartment.name,
        departmentId: qaDepartment.id, staffScheduleId: employeePosition.id, employmentRate: 1,
        contractSignedDate: new Date('2026-01-01T00:00:00.000Z'), contractNumber: 'E2E-EMPLOYEE-SCOPE',
      },
    })
    const reviewerEmployee = await db.employee.upsert({
      where: { code: 'E2E-HR-REVIEWER' },
      update: {
        department: qaDepartment.name,
        departmentId: qaDepartment.id,
        staffScheduleId: employeePosition.id,
        status: 'ACTIVE',
      },
      create: {
        code: 'E2E-HR-REVIEWER',
        fullName: 'E2E HR Reviewer',
        department: qaDepartment.name,
        departmentId: qaDepartment.id,
        staffScheduleId: employeePosition.id,
        employmentRate: 1,
      },
    })
    const employeeUser = await db.user.findUniqueOrThrow({ where: { username: E2E_EMPLOYEE.username } })
    await db.user.update({ where: { id: employeeUser.id }, data: { employeeId: employee.id } })
    await db.userRoleAssignment.upsert({
      where: { userId_role: { userId: employeeUser.id, role: 'EMPLOYEE' } },
      update: { departmentScopeMode: 'SELF', projectScopeMode: 'SELF' },
      create: {
        userId: employeeUser.id, role: 'EMPLOYEE', departmentScopeMode: 'SELF', projectScopeMode: 'SELF',
      },
    })
    const hrReviewer = await db.user.findUniqueOrThrow({ where: { username: E2E_HR.username } })
    await db.user.update({ where: { id: hrReviewer.id }, data: { employeeId: reviewerEmployee.id } })
    await db.department.update({
      where: { id: qaDepartment.id },
      data: { headEmployeeId: reviewerEmployee.id },
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
