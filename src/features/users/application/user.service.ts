import type { Prisma } from '@prisma/client'
import { getDb } from '@/lib/prisma'

const userSelect = {
  id: true,
  username: true,
  name: true,
  role: true,
  employeeId: true,
  employee: { select: { id: true, code: true, fullName: true } },
  roleAssignments: {
    orderBy: { role: 'asc' as const },
    select: {
      id: true,
      role: true,
      departmentScopeMode: true,
      projectScopeMode: true,
      departmentScopes: {
        orderBy: { department: { name: 'asc' as const } },
        select: { departmentId: true },
      },
      projectScopes: {
        orderBy: { project: { code: 'asc' as const } },
        select: { projectId: true },
      },
    },
  },
  isActive: true,
  mustChangePassword: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect

/** Legacy read helpers remain for callers that have not yet moved to the Python API. */
export class UserService {
  static async list(input: { page: number; pageSize: number }) {
    const db = getDb()
    const skip = (input.page - 1) * input.pageSize
    const [users, total] = await db.$transaction([
      db.user.findMany({
        select: userSelect,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        skip,
        take: input.pageSize,
      }),
      db.user.count(),
    ])
    return { users, total }
  }

  static async references() {
    const db = getDb()
    const [departments, projects, employees] = await Promise.all([
      db.department.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, parentId: true },
        orderBy: { name: 'asc' },
      }),
      db.project.findMany({
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      db.employee.findMany({
        where: { status: { not: 'DISMISSED' } },
        select: { id: true, code: true, fullName: true, departmentId: true },
        orderBy: { fullName: 'asc' },
      }),
    ])
    return { departments, projects, employees }
  }
}
