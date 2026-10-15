import type { NextRequest } from 'next/server'
import { updateEmployeeSchema } from '@/features/employees/contracts/employee'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiError, apiValidationError } from '@/lib/http/api-response'
import {
  departmentByName,
  departmentForPosition,
  employeeTarget,
} from '@/lib/auth/resource-scopes'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'employees.update')
  if (auth.response) return auth.response
  const input = updateEmployeeSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  const id = (await params).id
  const [currentTarget, positionDepartmentId, legacyDepartmentId] = await Promise.all([
    employeeTarget(id),
    departmentForPosition(input.data.staffScheduleId),
    departmentByName(input.data.department),
  ])
  const nextDepartmentId = positionDepartmentId || legacyDepartmentId
  if (currentTarget && !auth.access.allows('employees.update', {
    employeeId: currentTarget.employeeId,
    departmentIds: [
      ...(currentTarget.departmentId ? [currentTarget.departmentId] : []),
      ...(nextDepartmentId ? [nextDepartmentId] : []),
    ],
  })) return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  try {
    return await proxyBackendRequest(
      request,
      `/api/employees/${encodeURIComponent(id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'employees.delete')
  if (auth.response) return auth.response
  const id = (await params).id
  const target = await employeeTarget(id)
  if (target && !auth.access.allows('employees.delete', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return await proxyBackendRequest(
      request,
      `/api/employees/${encodeURIComponent(id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
