import { prisma } from '@/lib/prisma'
import {
  ensurePositionRequired,
  ensureValidActionDate,
  ensureValidContractDateRange,
  ensureValidEmploymentRate,
  hrError,
  parseOptionalDate,
  parseRequiredDate,
} from '../domain/hr-domain'
import {
  clearEmployeeDepartmentLeadership,
  employeeSelect,
  resolveAssignablePosition,
} from '../infrastructure/employee.repository'
import { CreatePersonnelActionInput } from '../contracts/schemas'
import { ensureExpiredContractArchiveActions } from '../infrastructure/workforce.repository'
import { withOrganizationMutation } from '@/lib/organization/organization-mutation'
import type { AccessContext } from '@/lib/auth/access-context'

const personnelActionPriority: Record<string, number> = {
  HIRE: 0, DISMISS: 1, ARCHIVE: 2, EXTEND: 3, TRANSFER: 4, PROMOTE: 5, EDIT: 6,
}

export class PersonnelActionService {
  static async list(input: { page: number; pageSize: number }, access?: AccessContext) {
    const where = access ? { employee: access.employeeWhere('personnelActions.read') } : undefined
    const [actions, total] = await prisma.$transaction([
      prisma.personnelAction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { employee: { select: employeeSelect } },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.personnelAction.count({ where }),
    ])
    const timeline = [...actions].sort((left, right) => {
      const dateDifference = right.createdAt.getTime() - left.createdAt.getTime()
      if (dateDifference) return dateDifference
      const priorityDifference = (personnelActionPriority[left.type] ?? 99) - (personnelActionPriority[right.type] ?? 99)
      return priorityDifference || left.employee.fullName.localeCompare(right.employee.fullName, 'ru')
    })
    return { actions: timeline, total }
  }

  static async delete(id: string, actorId: string, requestId?: string) {
    return prisma.$transaction(async (tx) => {
      const action = await tx.personnelAction.findUnique({ where: { id } })
      if (!action) throw hrError('INVALID_ACTION_DATE')
      await tx.personnelAction.delete({ where: { id } })
      await tx.auditLog.create({
        data: {
          userId: actorId, requestId, action: 'PERSONNEL_ACTION_DELETE', entityType: 'PersonnelAction',
          entityId: id, details: { employeeId: action.employeeId, type: action.type },
        },
      })
      return { success: true }
    })
  }

  static syncExpiredContracts(access?: AccessContext) {
    return ensureExpiredContractArchiveActions(
      prisma,
      access?.employeeWhere('personnelActions.sync') || {},
    )
  }

  static async createAction(data: CreatePersonnelActionInput, actorId?: string, requestId?: string) {
    const actionDate = ensureValidActionDate(data.date)

    return withOrganizationMutation(prisma, async (tx) => {
      if (data.type === 'HIRE') {
        if (!data.employeeData?.code || !data.employeeData?.fullName) {
          throw hrError('INVALID_HIRE_PAYLOAD')
        }

        const employmentRate = Number(data.employeeData.employmentRate)
        ensureValidEmploymentRate(employmentRate)

        const contractSignedDate = data.employeeData.contractSignedDate
          ? parseRequiredDate(data.employeeData.contractSignedDate)
          : null
        const contractEndDate = parseOptionalDate(data.employeeData.contractEndDate)

        if (!data.employeeData.contractNumber || !contractSignedDate) {
          throw hrError('INVALID_HIRE_PAYLOAD')
        }

        const hirePosition = await resolveAssignablePosition(tx, {
          staffScheduleId: data.employeeData.staffScheduleId,
          employmentRate,
          status: 'ACTIVE',
        })

        ensureValidContractDateRange(contractSignedDate, contractEndDate)

        const employee = await tx.employee.create({
          data: {
            code: data.employeeData.code,
            fullName: data.employeeData.fullName,
            department: hirePosition?.department || '',
            departmentId: hirePosition!.departmentId,
            phone: data.employeeData.phone || null,
            email: data.employeeData.email || null,
            photo: data.employeeData.photo || null,
            contractType: data.employeeData.contractType || 'PRIMARY',
            contractSignedDate,
            contractEndDate,
            contractNumber: data.employeeData.contractNumber,
            status: 'ACTIVE',
            staffScheduleId: data.employeeData.staffScheduleId,
            employmentRate,
          },
        })

        const action = await tx.personnelAction.create({
          data: {
            type: 'HIRE',
            date: contractSignedDate,
            description: data.description || null,
            employeeId: employee.id,
            oldDepartment: null,
            newDepartment: hirePosition?.department || null,
            oldPosition: null,
            newPosition: hirePosition?.position || null,
            oldContractEndDate: null,
            newContractEndDate: contractEndDate,
          },
          include: {
            employee: {
              select: employeeSelect,
            },
          },
        })
        if (actorId) await tx.auditLog.create({
          data: {
            userId: actorId, requestId, action: 'PERSONNEL_ACTION_CREATE', entityType: 'PersonnelAction',
            entityId: action.id, details: { employeeId: employee.id, type: action.type },
          },
        })
        return action
      }

      if (!data.employeeId) {
        throw hrError('MISSING_EMPLOYEE_ID')
      }

      const employee = await tx.employee.findUnique({
        where: { id: data.employeeId },
        include: {
          staffSchedule: true,
        },
      })

      if (!employee) {
        throw hrError('EMPLOYEE_NOT_FOUND')
      }

      const oldDepartment = employee.department || null
      const oldPosition = employee.staffSchedule?.position || null
      const oldContractEndDate = employee.contractEndDate || null
      const currentEmploymentRate = Number(employee.employmentRate || 0)
      const requestedEmploymentRate = data.employmentRate == null ? currentEmploymentRate : Number(data.employmentRate)

      if (data.type === 'TRANSFER' || data.type === 'PROMOTE') {
        ensureValidEmploymentRate(requestedEmploymentRate)
      }

      const nextPosition =
        data.type === 'TRANSFER' || data.type === 'PROMOTE'
          ? await resolveAssignablePosition(tx, {
              staffScheduleId: data.staffScheduleId,
              employeeId: employee.id,
              employmentRate: requestedEmploymentRate,
              status: 'ACTIVE',
            })
          : data.staffScheduleId
            ? await tx.staffSchedule.findUnique({ where: { id: data.staffScheduleId } })
            : null

      // Department changes are only allowed through a normalized staff position
      // in TRANSFER/PROMOTE. Other actions must not desynchronize the legacy
      // snapshot from employee.departmentId.
      let newDepartment = oldDepartment
      let newPosition = data.newPosition || nextPosition?.position || oldPosition
      let nextStatus = employee.status
      let nextStaffScheduleId = employee.staffScheduleId
      let nextDepartmentId = employee.departmentId
      let nextContractEndDate = employee.contractEndDate || null
      let nextEmploymentRate = currentEmploymentRate

      if (data.newContractEndDate) {
        const parsedContractDate = parseRequiredDate(data.newContractEndDate)
        ensureValidContractDateRange(employee.contractSignedDate, parsedContractDate)
        nextContractEndDate = parsedContractDate
      }

      switch (data.type) {
        case 'TRANSFER':
          ensurePositionRequired(data.staffScheduleId, 'ACTIVE')
          nextStatus = 'ACTIVE'
          nextStaffScheduleId = data.staffScheduleId || employee.staffScheduleId || null
          newDepartment = nextPosition!.department
          nextDepartmentId = nextPosition!.departmentId
          newPosition = data.newPosition || nextPosition?.position || employee.staffSchedule?.position || null
          nextEmploymentRate = requestedEmploymentRate
          break
        case 'DISMISS':
          nextStatus = 'DISMISSED'
          nextStaffScheduleId = employee.staffScheduleId
          newDepartment = null
          newPosition = null
          break
        case 'EXTEND':
          if (!data.newContractEndDate) {
            throw hrError('MISSING_CONTRACT_END_DATE')
          }
          nextStatus = 'ACTIVE'
          nextStaffScheduleId = employee.staffScheduleId
          newDepartment = employee.department
          newPosition = employee.staffSchedule?.position || null
          break
        case 'PROMOTE':
          nextStatus = 'ACTIVE'
          nextStaffScheduleId = data.staffScheduleId || employee.staffScheduleId || null
          newDepartment = nextPosition!.department
          nextDepartmentId = nextPosition!.departmentId
          newPosition = data.newPosition || nextPosition?.position || employee.staffSchedule?.position || null
          nextEmploymentRate = requestedEmploymentRate
          break
        default:
          break
      }

      const action = await tx.personnelAction.create({
        data: {
          type: data.type,
          date: actionDate,
          description: data.description || null,
          employeeId: employee.id,
          oldDepartment,
          newDepartment,
          oldPosition,
          newPosition,
          oldContractEndDate,
          newContractEndDate: nextContractEndDate,
        },
        include: {
          employee: {
            select: employeeSelect,
          },
        },
      })

      await tx.employee.update({
        where: { id: employee.id },
        data: {
          department: newDepartment || employee.department,
          departmentId: nextDepartmentId,
          status: nextStatus,
          staffScheduleId: nextStaffScheduleId,
          contractEndDate: nextContractEndDate,
          employmentRate: nextEmploymentRate,
        },
      })
      const clearedDepartmentHeads = data.type === 'DISMISS'
        ? await clearEmployeeDepartmentLeadership(tx, employee.id)
        : []

      if (actorId) await tx.auditLog.create({
        data: {
          userId: actorId, requestId, action: 'PERSONNEL_ACTION_CREATE', entityType: 'PersonnelAction',
          entityId: action.id,
          details: {
            employeeId: employee.id,
            type: action.type,
            clearedDepartmentHeads,
          },
        },
      })

      return action
    })
  }
}
