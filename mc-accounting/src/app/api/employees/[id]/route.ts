import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { EmployeeService } from '@/lib/services/employee.service'
import { updateEmployeeSchema } from '@/lib/schemas/employee'
import { validateRequest } from '@/lib/validations'

// PUT /api/employees/[id] - Update employee
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const json = await request.json()
    const validation = validateRequest(updateEmployeeSchema, json)

    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const data = validation.data

    // Specific business rules that are easier to check here or in service
    if (!data.staffScheduleId && data.status !== 'DISMISSED') {
      return NextResponse.json(
        { error: 'Должность из штатного расписания обязательна' },
        { status: 400 }
      )
    }

    const employee = await EmployeeService.updateEmployee(params.id, data)
    
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
      const errorMap: Record<string, string> = {
        'POSITION_NOT_FOUND': 'Должность из штатного расписания не найдена',
        'EMPLOYEE_NOT_FOUND': 'Сотрудник не найден',
        'INSUFFICIENT_POSITION_RATE': 'Недостаточно свободных ставок по выбранной должности'
      }

      if (errorMap[error.message]) {
        const isNotFound = error.message.includes('NOT_FOUND')
        return NextResponse.json(
          { error: errorMap[error.message] },
          { status: isNotFound ? 404 : 400 }
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
    await EmployeeService.dismissEmployee(params.id)
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
