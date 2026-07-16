import { getDb } from '@/lib/prisma'
import { getStaffScheduleRateSummary, toRateNumber } from '@/lib/employees'
import { ServiceError } from '@/lib/services/service-error'
import type { CreateStaffScheduleInput, CreateVacationInput } from '@/features/employees/contracts/schemas'

type WorkforceErrorCode = 'NOT_FOUND' | 'INVALID_DATES' | 'RATE_BELOW_OCCUPIED' | 'POSITION_IN_USE'
export class WorkforceServiceError extends ServiceError<WorkforceErrorCode> {}

const employeeSummary = { id: true, fullName: true, department: true } as const

export class WorkforceService {
  static async listVacations(year: number) {
    const startOfYear = new Date(year, 0, 1)
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999)
    return getDb().vacation.findMany({
      where: { startDate: { lte: endOfYear }, endDate: { gte: startOfYear } },
      orderBy: { startDate: 'asc' },
      include: { employee: { select: employeeSummary } },
    })
  }

  static async saveVacation(id: string | undefined, input: CreateVacationInput, actorId: string, requestId?: string) {
    const startDate = new Date(input.startDate)
    const endDate = new Date(input.endDate)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      throw new WorkforceServiceError('INVALID_DATES')
    }
    return getDb().$transaction(async (tx) => {
      const before = id ? await tx.vacation.findUnique({ where: { id } }) : null
      if (id && !before) throw new WorkforceServiceError('NOT_FOUND')
      const vacation = id
        ? await tx.vacation.update({
            where: { id }, data: { employeeId: input.employeeId, startDate, endDate, type: input.type },
            include: { employee: { select: employeeSummary } },
          })
        : await tx.vacation.create({
            data: { employeeId: input.employeeId, startDate, endDate, type: input.type },
            include: { employee: { select: employeeSummary } },
          })
      await tx.auditLog.create({
        data: {
          userId: actorId, requestId, action: id ? 'VACATION_UPDATE' : 'VACATION_CREATE',
          entityType: 'Vacation', entityId: vacation.id,
          details: {
            before: before ? { employeeId: before.employeeId, startDate: before.startDate.toISOString(), endDate: before.endDate.toISOString() } : null,
            after: { employeeId: vacation.employeeId, startDate: vacation.startDate.toISOString(), endDate: vacation.endDate.toISOString() },
          },
        },
      })
      return vacation
    })
  }

  static async deleteVacation(id: string, actorId: string, requestId?: string) {
    return getDb().$transaction(async (tx) => {
      const vacation = await tx.vacation.findUnique({ where: { id } })
      if (!vacation) throw new WorkforceServiceError('NOT_FOUND')
      await tx.vacation.delete({ where: { id } })
      await tx.auditLog.create({
        data: {
          userId: actorId, requestId, action: 'VACATION_DELETE', entityType: 'Vacation', entityId: id,
          details: { employeeId: vacation.employeeId },
        },
      })
      return { success: true }
    })
  }

  static async listPositions() {
    const positions = await getDb().staffSchedule.findMany({
      orderBy: [{ department: 'asc' }, { position: 'asc' }],
      include: { employees: { where: { status: { not: 'DISMISSED' } } } },
    })
    return positions.map((position) => {
      const rate = toRateNumber(position.rate)
      const occupiedRate = position.employees.reduce((sum, employee) => sum + toRateNumber(employee.employmentRate), 0)
      return { ...position, occupiedRate, freeRate: Math.max(rate - occupiedRate, 0) }
    })
  }

  static async createPosition(input: CreateStaffScheduleInput, actorId: string, requestId?: string) {
    return getDb().$transaction(async (tx) => {
      const position = await tx.staffSchedule.create({
        data: { ...input, position: input.position.trim() },
      })
      await tx.auditLog.create({
        data: {
          userId: actorId, requestId, action: 'STAFF_POSITION_CREATE', entityType: 'StaffSchedule',
          entityId: position.id, details: { after: { position: position.position, department: position.department } },
        },
      })
      return position
    })
  }

  static async updatePosition(id: string, input: CreateStaffScheduleInput, actorId: string, requestId?: string) {
    return getDb().$transaction(async (tx) => {
      const summary = await getStaffScheduleRateSummary(tx, id)
      if (!summary) throw new WorkforceServiceError('NOT_FOUND')
      if (input.rate < summary.occupiedRate) throw new WorkforceServiceError('RATE_BELOW_OCCUPIED')
      const before = await tx.staffSchedule.findUniqueOrThrow({ where: { id } })
      const position = await tx.staffSchedule.update({
        where: { id }, data: { ...input, position: input.position.trim() },
      })
      await tx.auditLog.create({
        data: {
          userId: actorId, requestId, action: 'STAFF_POSITION_UPDATE', entityType: 'StaffSchedule', entityId: id,
          details: {
            before: { position: before.position, rate: before.rate.toString(), salary: before.salary.toString() },
            after: { position: position.position, rate: position.rate.toString(), salary: position.salary.toString() },
          },
        },
      })
      return position
    })
  }

  static async deletePosition(id: string, actorId: string, requestId?: string) {
    return getDb().$transaction(async (tx) => {
      const position = await tx.staffSchedule.findUnique({
        where: { id }, include: { employees: { where: { status: { not: 'DISMISSED' } }, select: { id: true } } },
      })
      if (!position) throw new WorkforceServiceError('NOT_FOUND')
      if (position.employees.length) throw new WorkforceServiceError('POSITION_IN_USE')
      await tx.employee.updateMany({ where: { staffScheduleId: id, status: 'DISMISSED' }, data: { staffScheduleId: null } })
      await tx.staffSchedule.delete({ where: { id } })
      await tx.auditLog.create({
        data: {
          userId: actorId, requestId, action: 'STAFF_POSITION_DELETE', entityType: 'StaffSchedule', entityId: id,
          details: { before: { position: position.position, department: position.department } },
        },
      })
      return { success: true }
    })
  }
}
