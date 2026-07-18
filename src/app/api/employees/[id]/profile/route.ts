import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { employeeTarget } from '@/lib/auth/resource-scopes'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { EmployeeProfileService } from '@/features/employees/application/employee-profile.service'
import { employeeProfileSchema } from '@/features/employees/contracts/profile'

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'employees.update')
  if (auth.response) return auth.response
  const input = employeeProfileSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  const { id } = await context.params
  const target = await employeeTarget(id)
  if (!target) return apiError('EMPLOYEE_NOT_FOUND', 'Сотрудник не найден', 404)
  if (!auth.access.allows('employees.update', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  if (input.data.managerId) {
    const managerTarget = await employeeTarget(input.data.managerId)
    if (!managerTarget || !auth.access.allows('employees.read', managerTarget)) {
      return apiError('INVALID_MANAGER', 'Руководитель недоступен', 422)
    }
  }
  try {
    return apiData(await EmployeeProfileService.update(
      id,
      input.data,
      auth.user.id,
      auth.requestId,
    ))
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_MANAGER') {
      return apiError('INVALID_MANAGER', 'Нельзя назначить этого руководителя', 422)
    }
    if (error instanceof Error && error.message === 'EMPLOYEE_NOT_FOUND') {
      return apiError('EMPLOYEE_NOT_FOUND', 'Сотрудник не найден', 404)
    }
    throw error
  }
}
