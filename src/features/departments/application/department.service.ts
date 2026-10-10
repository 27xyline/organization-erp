import type { Prisma } from '@prisma/client'
import { getDb } from '@/lib/prisma'
import type { DepartmentHeadCandidate, DepartmentListItem } from '../contracts/types'
import type { AccessContext } from '@/lib/auth/access-context'

const departmentInclude = {
  headEmployee: {
    select: {
      id: true,
      code: true,
      fullName: true,
    },
  },
  _count: {
    select: {
      children: true,
      employees: true,
      staffPositions: true,
      mols: true,
    },
  },
} as const

type DepartmentRecord = Prisma.DepartmentGetPayload<{ include: typeof departmentInclude }>

function toListItem(department: DepartmentRecord): DepartmentListItem {
  return {
    id: department.id,
    code: department.code,
    name: department.name,
    parentId: department.parentId,
    headEmployeeId: department.headEmployeeId,
    headEmployee: department.headEmployee,
    isActive: department.isActive,
    usage: department._count,
    createdAt: department.createdAt.toISOString(),
    updatedAt: department.updatedAt.toISOString(),
  }
}

/** Transitional read-only Prisma access for TypeScript modules outside Stage 04. */
export class DepartmentService {
  static async list(
    input: { activeOnly?: boolean } = {},
    access?: AccessContext,
  ): Promise<DepartmentListItem[]> {
    const departments = await getDb().department.findMany({
      where: {
        AND: [
          input.activeOnly ? { isActive: true } : {},
          access ? access.departmentWhere('departments.read') : {},
        ],
      },
      orderBy: [{ name: 'asc' }],
      include: departmentInclude,
    })
    return departments.map(toListItem)
  }

  static async listHeadCandidates(): Promise<DepartmentHeadCandidate[]> {
    return getDb().employee.findMany({
      where: { status: { not: 'DISMISSED' } },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        code: true,
        fullName: true,
        departmentId: true,
      },
    })
  }
}
