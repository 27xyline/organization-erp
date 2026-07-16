import type { Prisma, PrismaClient } from '@prisma/client'
import { getStaffScheduleRateSummary } from './workforce.repository'
import { ensurePositionRequired, hrError } from '../domain/hr-domain'

type StaffScheduleDbClient = Pick<PrismaClient, 'employee' | 'staffSchedule'> | Prisma.TransactionClient

export const employeeSelect = {
  id: true,
  fullName: true,
  department: true,
  status: true,
  contractType: true,
  contractSignedDate: true,
  contractEndDate: true,
  contractNumber: true,
  staffScheduleId: true,
  employmentRate: true,
  staffSchedule: { select: { id: true, position: true, department: true } },
} as const

export async function resolveAssignablePosition(
  db: StaffScheduleDbClient,
  input: {
    staffScheduleId?: string | null
    employeeId?: string
    employmentRate: number
    status: string
  },
) {
  ensurePositionRequired(input.staffScheduleId, input.status)
  if (!input.staffScheduleId) return null

  const position = await db.staffSchedule.findUnique({ where: { id: input.staffScheduleId } })
  if (!position) throw hrError('POSITION_NOT_FOUND')

  const summary = await getStaffScheduleRateSummary(db, input.staffScheduleId, input.employeeId)
  if (!summary) throw hrError('POSITION_NOT_FOUND')
  if (input.status !== 'DISMISSED' && input.employmentRate > summary.freeRate) {
    throw hrError('INSUFFICIENT_POSITION_RATE')
  }
  return position
}
