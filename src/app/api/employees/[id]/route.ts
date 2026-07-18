import { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { EmployeeService } from '@/features/employees/application/employee.service'
import { getEmployeeRouteErrorMeta } from '@/features/employees/application/error-mapping'
import { updateEmployeeSchema } from '@/features/employees/contracts/employee'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import {
  DepartmentReferenceError,
  getDepartmentReferenceErrorMeta,
} from '@/lib/organization/department-reference'

function mapEmployeeError(error: unknown) {
  if (error instanceof DepartmentReferenceError) {
    const meta = getDepartmentReferenceErrorMeta(error.code)
    return apiError(error.code, meta.message, meta.status)
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return apiError('EMPLOYEE_CODE_EXISTS', 'Сотрудник с таким табельным номером уже существует', 409)
  }
  const routeError = getEmployeeRouteErrorMeta(error)
  return routeError ? apiError('EMPLOYEE_DOMAIN_ERROR', routeError.error, routeError.status) : null
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  const input = updateEmployeeSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await EmployeeService.updateEmployee((await params).id, input.data, auth.user.id, auth.requestId))
  } catch (error) {
    const mapped = mapEmployeeError(error)
    if (mapped) return mapped
    throw error
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  try {
    await EmployeeService.dismissEmployee((await params).id, auth.user.id, auth.requestId)
    return apiData({ success: true, archived: true, status: 'DISMISSED' })
  } catch (error) {
    const mapped = mapEmployeeError(error)
    if (mapped) return mapped
    throw error
  }
}
