import type { NextRequest } from 'next/server'
import { WorkforceService } from '@/features/employees/application/workforce.service'
import { createStaffScheduleSchema } from '@/features/employees/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import {
  DepartmentReferenceError,
  getDepartmentReferenceErrorMeta,
} from '@/lib/organization/department-reference'
import { departmentForReference } from '@/lib/auth/resource-scopes'

function mapDepartmentError(error: DepartmentReferenceError) {
  const meta = getDepartmentReferenceErrorMeta(error.code)
  return apiError(error.code, meta.message, meta.status)
}

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'staffSchedule.read')
  if (auth.response) return auth.response
  return apiData(await WorkforceService.listPositions(auth.access))
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'staffSchedule.create')
  if (auth.response) return auth.response
  const input = createStaffScheduleSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  const departmentId = await departmentForReference(input.data)
  if (departmentId && !auth.access.allows('staffSchedule.create', { departmentId })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return apiData(await WorkforceService.createPosition(input.data, auth.user.id, auth.requestId), { status: 201 })
  } catch (error) {
    if (error instanceof DepartmentReferenceError) return mapDepartmentError(error)
    throw error
  }
}
