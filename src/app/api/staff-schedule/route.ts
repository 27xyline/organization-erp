import type { NextRequest } from 'next/server'
import { WorkforceService } from '@/features/employees/workforce.service'
import { createStaffScheduleSchema } from '@/lib/validations'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'

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
  return apiData(await WorkforceService.createPosition(input.data, auth.user.id, auth.requestId), { status: 201 })
}
