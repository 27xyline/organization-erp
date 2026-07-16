import { prisma } from '@/lib/prisma'
import {
  ensureValidContractDateRange,
  ensureValidEmploymentRate,
  hrError,
  resolveAssignablePosition,
} from '@/lib/services/hr-domain'
import { UpdateEmployeeInput } from '@/lib/schemas/employee'

export class EmployeeService {
  static async updateEmployee(id: string, data: UpdateEmployeeInput) {
    return prisma.$transaction(async (tx) => {
      const existingEmployee = await tx.employee.findUnique({
        where: { id },
        include: {
          staffSchedule: true,
        },
      })

      if (!existingEmployee) {
        throw hrError('EMPLOYEE_NOT_FOUND')
      }

      const employmentRate = data.employmentRate !== undefined ? Number(data.employmentRate) : Number(existingEmployee.employmentRate)
      const status = data.status || existingEmployee.status
      const contractSignedDate = data.contractSignedDate ?? existingEmployee.contractSignedDate
      const contractEndDate = data.contractEndDate === undefined
        ? existingEmployee.contractEndDate
        : data.contractEndDate

      if (status !== 'DISMISSED') {
        ensureValidEmploymentRate(employmentRate)
      }

      const positionId = data.staffScheduleId === undefined ? existingEmployee.staffScheduleId : data.staffScheduleId
      ensureValidContractDateRange(contractSignedDate, contractEndDate)

      const position = await resolveAssignablePosition(tx, {
        staffScheduleId: positionId,
        employeeId: id,
        employmentRate,
        status,
      })

      const updatedEmployee = await tx.employee.update({
        where: { id },
        data: {
          code: data.code,
          fullName: data.fullName,
          department: position?.department || data.department || undefined,
          photo: data.photo,
          phone: data.phone,
          email: data.email,
          contractType: data.contractType,
          contractSignedDate: data.contractSignedDate,
          contractEndDate: data.contractEndDate,
          contractNumber: data.contractNumber,
          staffScheduleId: data.staffScheduleId,
          employmentRate: status === 'DISMISSED' ? existingEmployee.employmentRate : employmentRate,
          status: data.status,
        },
        include: {
          staffSchedule: true,
        },
      })

      const newDepartment = position?.department || data.department || existingEmployee.department
      const changedFields: string[] = []

      // Audit logic
      if (data.fullName && existingEmployee.fullName !== updatedEmployee.fullName) changedFields.push('ФИО')
      if (data.code && existingEmployee.code !== updatedEmployee.code) changedFields.push('табельный номер')
      if (data.staffScheduleId !== undefined && (existingEmployee.staffScheduleId || null) !== (updatedEmployee.staffScheduleId || null)) changedFields.push('должность')
      if (data.employmentRate !== undefined && Number(existingEmployee.employmentRate || 0) !== Number(updatedEmployee.employmentRate || 0)) changedFields.push('количество ставок')
      if ((data.department || position?.department) && (existingEmployee.department || null) !== (newDepartment || null)) changedFields.push('подразделение')
      if (data.contractType && existingEmployee.contractType !== updatedEmployee.contractType) changedFields.push('вид договора')
      if (data.contractSignedDate && (existingEmployee.contractSignedDate?.getTime() || null) !== (updatedEmployee.contractSignedDate?.getTime() || null)) changedFields.push('дату подписания договора')
      if (data.contractEndDate !== undefined && (existingEmployee.contractEndDate?.getTime() || null) !== (updatedEmployee.contractEndDate?.getTime() || null)) changedFields.push('срок действия договора')
      if (data.contractNumber && (existingEmployee.contractNumber || null) !== (updatedEmployee.contractNumber || null)) changedFields.push('номер договора')
      if (data.status && existingEmployee.status !== updatedEmployee.status) changedFields.push('статус')

      if (changedFields.length > 0) {
        await tx.personnelAction.create({
          data: {
            type: 'EDIT',
            date: new Date(),
            description: `Изменены данные сотрудника: ${changedFields.join(', ')}`,
            employeeId: updatedEmployee.id,
            oldDepartment: existingEmployee.department || null,
            newDepartment: newDepartment || null,
            oldPosition: existingEmployee.staffSchedule?.position || null,
            newPosition: updatedEmployee.staffSchedule?.position || null,
            oldContractEndDate: existingEmployee.contractEndDate || null,
            newContractEndDate: updatedEmployee.contractEndDate || null,
          },
        })
      }

      return updatedEmployee
    })
  }

  static async dismissEmployee(id: string) {
    return prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({
        where: { id },
        include: {
          staffSchedule: true,
        },
      })

      if (!employee) {
        throw hrError('EMPLOYEE_NOT_FOUND')
      }

      const updated = await tx.employee.update({
        where: { id },
        data: {
          status: 'DISMISSED',
        },
      })

      await tx.personnelAction.create({
        data: {
          type: 'DISMISS',
          date: new Date(),
          description: 'Уволен',
          employeeId: employee.id,
          oldDepartment: employee.department || null,
          newDepartment: null,
          oldPosition: employee.staffSchedule?.position || null,
          newPosition: null,
          oldContractEndDate: employee.contractEndDate || null,
          newContractEndDate: employee.contractEndDate || null,
        },
      })

      return updated
    })
  }
}
