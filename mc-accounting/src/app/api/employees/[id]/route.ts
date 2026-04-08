import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getStaffScheduleRateSummary } from '@/lib/employees'

// PUT /api/employees/[id] - Update employee
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json()
    const contractSignedDate = data.contractSignedDate ? new Date(data.contractSignedDate) : null
    const contractEndDate = data.contractEndDate ? new Date(data.contractEndDate) : null
    const actionDate = new Date()
    const employmentRate = Number(data.employmentRate)

    if (!data.staffScheduleId && data.status !== 'DISMISSED') {
      return NextResponse.json(
        { error: 'Должность из штатного расписания обязательна' },
        { status: 400 }
      )
    }

    if (data.status !== 'DISMISSED' && (!Number.isFinite(employmentRate) || employmentRate <= 0)) {
      return NextResponse.json(
        { error: 'Количество ставок сотрудника должно быть больше нуля' },
        { status: 400 }
      )
    }

    if (!data.contractNumber || !contractSignedDate || Number.isNaN(contractSignedDate.getTime())) {
      return NextResponse.json(
        { error: 'Номер договора и дата подписания обязательны' },
        { status: 400 }
      )
    }

    if (contractEndDate && Number.isNaN(contractEndDate.getTime())) {
      return NextResponse.json(
        { error: 'Некорректная дата окончания договора' },
        { status: 400 }
      )
    }

    if (contractEndDate && contractSignedDate >= contractEndDate) {
      return NextResponse.json(
        { error: 'Дата подписания договора должна быть раньше срока действия договора' },
        { status: 400 }
      )
    }

    const employee = await prisma.$transaction(async (tx) => {
      const existingEmployee = await tx.employee.findUnique({
        where: { id: params.id },
        include: {
          staffSchedule: true,
        },
      })

      if (!existingEmployee) {
        throw new Error('EMPLOYEE_NOT_FOUND')
      }

      const position = data.staffScheduleId
        ? await tx.staffSchedule.findUnique({ where: { id: data.staffScheduleId } })
        : null

      if (data.staffScheduleId && !position) {
        throw new Error('POSITION_NOT_FOUND')
      }

      if (data.staffScheduleId) {
        const rateSummary = await getStaffScheduleRateSummary(tx, data.staffScheduleId, params.id)

        if (!rateSummary) {
          throw new Error('POSITION_NOT_FOUND')
        }

        if (data.status !== 'DISMISSED' && employmentRate > rateSummary.freeRate) {
          throw new Error('INSUFFICIENT_POSITION_RATE')
        }
      }

      const updatedEmployee = await tx.employee.update({
        where: { id: params.id },
        data: {
          code: data.code,
          fullName: data.fullName,
          department: position?.department || data.department,
          photo: data.photo,
          phone: data.phone,
          email: data.email,
          contractType: data.contractType || 'PRIMARY',
          contractSignedDate,
          contractEndDate,
          contractNumber: data.contractNumber,
          staffScheduleId: data.staffScheduleId,
          employmentRate: data.status === 'DISMISSED' ? existingEmployee.employmentRate : employmentRate,
          status: data.status,
        },
        include: {
          staffSchedule: true,
        },
      })

      const newDepartment = position?.department || data.department
      const changedFields: string[] = []

      if (existingEmployee.fullName !== updatedEmployee.fullName) changedFields.push('ФИО')
      if (existingEmployee.code !== updatedEmployee.code) changedFields.push('табельный номер')
      if ((existingEmployee.staffScheduleId || null) !== (updatedEmployee.staffScheduleId || null)) changedFields.push('должность')
      if (Number(existingEmployee.employmentRate || 0) !== Number(updatedEmployee.employmentRate || 0)) changedFields.push('количество ставок')
      if ((existingEmployee.department || null) !== (newDepartment || null)) changedFields.push('подразделение')
      if (existingEmployee.contractType !== updatedEmployee.contractType) changedFields.push('вид договора')
      if ((existingEmployee.contractSignedDate?.getTime() || null) !== (updatedEmployee.contractSignedDate?.getTime() || null)) changedFields.push('дату подписания договора')
      if ((existingEmployee.contractEndDate?.getTime() || null) !== (updatedEmployee.contractEndDate?.getTime() || null)) changedFields.push('срок действия договора')
      if ((existingEmployee.contractNumber || null) !== (updatedEmployee.contractNumber || null)) changedFields.push('номер договора')
      if (existingEmployee.status !== updatedEmployee.status) changedFields.push('статус')

      if (changedFields.length > 0) {
        await tx.personnelAction.create({
          data: {
            type: 'EDIT',
            date: actionDate,
            description: `Изменены данные сотрудника: ${changedFields.join(', ')}`,
            employeeId: updatedEmployee.id,
            oldDepartment: existingEmployee.department || null,
            newDepartment,
            oldPosition: existingEmployee.staffSchedule?.position || null,
            newPosition: updatedEmployee.staffSchedule?.position || null,
            oldContractEndDate: existingEmployee.contractEndDate || null,
            newContractEndDate: updatedEmployee.contractEndDate || null,
          },
        })
      }

      return updatedEmployee
    })
    
    return NextResponse.json(employee)
  } catch (error) {
    console.error('Error updating employee:', error)

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target : []

      if (target.includes('code')) {
        return NextResponse.json(
          { error: 'Сотрудник с таким табельным номером уже существует' },
          { status: 400 }
        )
      }
    }

    if (error instanceof Error) {
      if (error.message === 'POSITION_NOT_FOUND') {
        return NextResponse.json(
          { error: 'Должность из штатного расписания не найдена' },
          { status: 404 }
        )
      }

      if (error.message === 'EMPLOYEE_NOT_FOUND') {
        return NextResponse.json(
          { error: 'Сотрудник не найден' },
          { status: 404 }
        )
      }

      if (error.message === 'INSUFFICIENT_POSITION_RATE') {
        return NextResponse.json(
          { error: 'Недостаточно свободных ставок по выбранной должности' },
          { status: 400 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Ошибка при обновлении сотрудника' },
      { status: 500 }
    )
  }
}

// DELETE /api/employees/[id] - Delete employee
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actionDate = new Date()

    await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({
        where: { id: params.id },
        include: {
          staffSchedule: true,
        },
      })

      if (!employee) {
        throw new Error('EMPLOYEE_NOT_FOUND')
      }

      await tx.employee.update({
        where: { id: params.id },
        data: {
          status: 'DISMISSED',
        },
      })

      await tx.personnelAction.create({
        data: {
          type: 'DISMISS',
          date: actionDate,
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
    })
    
    return NextResponse.json({ success: true, archived: true, status: 'DISMISSED' })
  } catch (error) {
    console.error('Error deleting employee:', error)

    if (error instanceof Error && error.message === 'EMPLOYEE_NOT_FOUND') {
      return NextResponse.json(
        { error: 'Сотрудник не найден' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: 'Ошибка при увольнении сотрудника' },
      { status: 500 }
    )
  }
}
