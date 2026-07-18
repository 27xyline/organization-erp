import type { NextRequest } from 'next/server'
import {
  DepartmentService,
  DepartmentServiceError,
} from '@/features/departments/application/department.service'
import { getDepartmentErrorMeta } from '@/features/departments/application/error-mapping'
import {
  createDepartmentSchema,
  departmentsQuerySchema,
} from '@/features/departments/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

function mapDepartmentError(error: DepartmentServiceError) {
  const meta = getDepartmentErrorMeta(error.code)
  return apiError(error.code, meta.message, meta.status)
}
export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'departments.read')
  if (auth.response) return auth.response
  const query = departmentsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)
  return apiData(await DepartmentService.list(query.data, auth.access))
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'departments.create')
  if (auth.response) return auth.response
  const input = createDepartmentSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(
      await DepartmentService.create(input.data, auth.user.id, auth.requestId),
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof DepartmentServiceError) return mapDepartmentError(error)
    throw error
  }
}
