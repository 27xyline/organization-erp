import type { NextRequest } from 'next/server'
import {
  DepartmentService,
  DepartmentServiceError,
} from '@/features/departments/application/department.service'
import { getDepartmentErrorMeta } from '@/features/departments/application/error-mapping'
import { updateDepartmentSchema } from '@/features/departments/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

function mapDepartmentError(error: DepartmentServiceError) {
  const meta = getDepartmentErrorMeta(error.code)
  return apiError(error.code, meta.message, meta.status)
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'departments.update')
  if (auth.response) return auth.response
  const input = updateDepartmentSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  const id = (await params).id
  if (!auth.access.allows('departments.update', { departmentId: id })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return apiData(
      await DepartmentService.update(id, input.data, auth.user.id, auth.requestId),
    )
  } catch (error) {
    if (error instanceof DepartmentServiceError) return mapDepartmentError(error)
    throw error
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'departments.delete')
  if (auth.response) return auth.response
  const id = (await params).id
  if (!auth.access.allows('departments.delete', { departmentId: id })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return apiData(
      await DepartmentService.delete(id, auth.user.id, auth.requestId),
    )
  } catch (error) {
    if (error instanceof DepartmentServiceError) return mapDepartmentError(error)
    throw error
  }
}
