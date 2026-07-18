import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { WorkforceService, WorkforceServiceError } from '@/features/employees/application/workforce.service'
import { createVacationSchema } from '@/features/employees/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { employeeTarget } from '@/lib/auth/resource-scopes'

const yearSchema = z.coerce.number().int().min(2000).max(2200)

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'vacations.read')
  if (auth.response) return auth.response
  const year = yearSchema.safeParse(request.nextUrl.searchParams.get('year') || new Date().getFullYear())
  if (!year.success) return apiValidationError(year.error)
  return apiData(await WorkforceService.listVacations(year.data, auth.access))
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'vacations.create')
  if (auth.response) return auth.response
  const input = createVacationSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  const target = await employeeTarget(input.data.employeeId)
  if (target && !auth.access.allows('vacations.create', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return apiData(await WorkforceService.saveVacation(undefined, input.data, auth.user.id, auth.requestId), { status: 201 })
  } catch (error) {
    if (error instanceof WorkforceServiceError) return apiError(error.code, 'Некорректные даты отпуска', 422)
    throw error
  }
}
