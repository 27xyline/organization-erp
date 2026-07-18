import type { NextRequest } from 'next/server'
import { WorkforceService } from '@/features/employees/application/workforce.service'
import { createStaffScheduleSchema } from '@/features/employees/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { DepartmentReferenceError } from '@/lib/organization/department-reference'

function mapDepartmentError(error: DepartmentReferenceError) {
  return apiError(
    error.code,
    error.code === 'INACTIVE_DEPARTMENT'
      ? 'Нельзя назначить неактивное подразделение'
      : 'Подразделение не найдено',
    error.code === 'NOT_FOUND' ? 404 : 409,
  )
}

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  return apiData(await WorkforceService.listPositions())
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  const input = createStaffScheduleSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await WorkforceService.createPosition(input.data, auth.user.id, auth.requestId), { status: 201 })
  } catch (error) {
    if (error instanceof DepartmentReferenceError) return mapDepartmentError(error)
    throw error
  }
}
