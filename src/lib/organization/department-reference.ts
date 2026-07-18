import { Prisma, type PrismaClient } from '@prisma/client'
import { ServiceError } from '@/lib/errors/service-error'

export type DepartmentReferenceErrorCode =
  | 'NOT_FOUND'
  | 'DEPARTMENT_REQUIRED'
  | 'INACTIVE_DEPARTMENT'

export class DepartmentReferenceError extends ServiceError<DepartmentReferenceErrorCode> {}

type DepartmentDbClient =
  | Pick<PrismaClient, 'department'>
  | Prisma.TransactionClient

interface DepartmentReference {
  departmentId?: string | null
  department?: string | null
}

export async function resolveDepartment(
  db: DepartmentDbClient,
  reference: DepartmentReference,
  options: { allowInactive?: boolean } = {},
) {
  const departmentId = reference.departmentId?.trim()
  const legacyName = reference.department?.trim()
  if (!departmentId && !legacyName) throw new DepartmentReferenceError('DEPARTMENT_REQUIRED')

  const department = departmentId
    ? await db.department.findUnique({
        where: { id: departmentId },
        select: { id: true, name: true, isActive: true },
      })
    : await db.department.findFirst({
        where: { name: { equals: legacyName, mode: 'insensitive' } },
        select: { id: true, name: true, isActive: true },
      })

  if (!department) throw new DepartmentReferenceError('NOT_FOUND')
  if (!department.isActive && !options.allowInactive) {
    throw new DepartmentReferenceError('INACTIVE_DEPARTMENT')
  }
  return department
}

