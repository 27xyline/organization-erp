import type { Prisma, PrismaClient } from '@prisma/client'
import { getStaffScheduleRateSummary } from './workforce.repository'
import { ensurePositionRequired, hrError } from '../domain/hr-domain'

type StaffScheduleDbClient = Pick<PrismaClient, 'employee' | 'staffSchedule'> | Prisma.TransactionClient
type DepartmentHeadDbClient = Pick<PrismaClient, 'department'> | Prisma.TransactionClient

export const employeeSelect = {
  id: true,
  fullName: true,
  department: true,
  departmentId: true,
  status: true,
  contractType: true,
  contractSignedDate: true,
  contractEndDate: true,
  contractNumber: true,
  staffScheduleId: true,
  employmentRate: true,
  staffSchedule: {
    select: {
      id: true,
      position: true,
      department: true,
      departmentId: true,
      departmentRef: { select: { isActive: true } },
    },
  },
} as const

export async function resolveAssignablePosition(
  db: StaffScheduleDbClient,
  input: {
    staffScheduleId?: string | null
    employeeId?: string
    employmentRate: number
    status: string
    allowInactiveCurrentPosition?: boolean
  },
) {
  ensurePositionRequired(input.staffScheduleId, input.status)
  if (!input.staffScheduleId) return null

  const position = await db.staffSchedule.findUnique({
    where: { id: input.staffScheduleId },
    include: { departmentRef: { select: { isActive: true } } },
  })
  if (!position) throw hrError('POSITION_NOT_FOUND')
  if (!position.departmentRef.isActive && !input.allowInactiveCurrentPosition) {
    throw hrError('INACTIVE_POSITION_DEPARTMENT')
  }

  const summary = await getStaffScheduleRateSummary(db, input.staffScheduleId, input.employeeId)
  if (!summary) throw hrError('POSITION_NOT_FOUND')
  if (input.status !== 'DISMISSED' && input.employmentRate > summary.freeRate) {
    throw hrError('INSUFFICIENT_POSITION_RATE')
  }
  return position
}

export async function clearEmployeeDepartmentLeadership(
  db: DepartmentHeadDbClient,
  employeeId: string,
) {
  const departments = await db.department.findMany({
    where: { headEmployeeId: employeeId },
    select: { id: true, code: true, name: true },
  })
  if (departments.length > 0) {
    await db.department.updateMany({
      where: { id: { in: departments.map((department) => department.id) } },
      data: { headEmployeeId: null },
    })
  }
  return departments
}
