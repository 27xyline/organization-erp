import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { employeeTarget } from '@/lib/auth/resource-scopes'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiError, apiValidationError } from '@/lib/http/api-response'
import { employeeProfileSchema } from '@/features/employees/contracts/profile'

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'employees.update')
  if (auth.response) return auth.response
  const input = employeeProfileSchema.safeParse(await request.clone().json().catch(() => null))
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
    return await proxyBackendRequest(
      request,
      `/api/employees/${encodeURIComponent(id)}/profile`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
