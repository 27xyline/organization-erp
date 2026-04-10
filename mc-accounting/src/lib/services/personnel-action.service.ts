import { prisma } from '@/lib/prisma'
import {
  employeeSelect,
  ensurePositionRequired,
  ensureValidActionDate,
  ensureValidContractDateRange,
  ensureValidEmploymentRate,
  hrError,
  parseOptionalDate,
  parseRequiredDate,
  resolveAssignablePosition,
} from '@/lib/services/hr-domain'
import { CreatePersonnelActionInput } from '@/lib/validations'

export class PersonnelActionService {
  static async createAction(data: CreatePersonnelActionInput) {
    const actionDate = ensureValidActionDate(data.date)

    return prisma.$transaction(async (tx) => {
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

        return tx.personnelAction.create({
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

      let newDepartment = data.newDepartment || oldDepartment
      let newPosition = data.newPosition || nextPosition?.position || oldPosition
      let nextStatus = employee.status
      let nextStaffScheduleId = employee.staffScheduleId
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
          newDepartment = data.newDepartment || nextPosition?.department || employee.department
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
          newDepartment = data.newDepartment || nextPosition?.department || employee.department
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
          status: nextStatus,
          staffScheduleId: nextStaffScheduleId,
          contractEndDate: nextContractEndDate,
          employmentRate: nextEmploymentRate,
        },
      })

      return action
    })
  }
}
