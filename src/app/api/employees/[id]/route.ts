import { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { EmployeeService } from '@/lib/services/employee.service'
import { getEmployeeRouteErrorMeta } from '@/lib/services/hr-domain'
import { updateEmployeeSchema } from '@/lib/schemas/employee'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

function mapEmployeeError(error: unknown) {
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
