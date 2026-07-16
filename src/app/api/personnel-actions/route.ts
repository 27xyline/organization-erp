import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { PersonnelActionService } from '@/lib/services/personnel-action.service'
import { getPersonnelActionRouteErrorMeta } from '@/lib/services/hr-domain'
import { createPersonnelActionSchema } from '@/lib/validations'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiList, apiValidationError } from '@/lib/http/api-response'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  const raw = Object.fromEntries(request.nextUrl.searchParams)
  if (raw.limit && !raw.pageSize) raw.pageSize = raw.limit
  const query = querySchema.safeParse(raw)
  if (!query.success) return apiValidationError(query.error)
  const result = await PersonnelActionService.list(query.data)
  return apiList(result.actions, { ...query.data, total: result.total })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  const input = createPersonnelActionSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await PersonnelActionService.createAction(input.data, auth.user.id, auth.requestId), { status: 201 })
  } catch (error) {
    const mapped = getPersonnelActionRouteErrorMeta(error)
    if (mapped) return apiError('PERSONNEL_ACTION_INVALID', mapped.error, mapped.status)
    throw error
  }
}
