import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { EmployeeService } from '@/lib/services/employee.service'
import { getEmployeeRouteErrorMeta } from '@/lib/services/hr-domain'
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

    const routeError = getEmployeeRouteErrorMeta(error)

    if (routeError) {
      return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
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

    const routeError = getEmployeeRouteErrorMeta(error)

    if (routeError) {
      return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
    }

    return NextResponse.json(
      { error: 'Ошибка при увольнении сотрудника' },
      { status: 500 }
    )
  }
}
