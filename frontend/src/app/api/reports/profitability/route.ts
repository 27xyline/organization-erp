import { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { z } from 'zod'
import { proxyStage12Request } from '@/lib/backend/stage12'

const querySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  projectId: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, {
    allOf: ['reports.read', 'projects.read', 'projectPayroll.read', 'finance.salary.read'],
  })
  if (auth.response) return auth.response

  const searchParams = Object.fromEntries(request.nextUrl.searchParams)
  const query = querySchema.safeParse(searchParams)
  if (!query.success) return apiValidationError(query.error)

  return proxyStage12Request(request, `${request.nextUrl.pathname}${request.nextUrl.search}`, auth.user, auth.requestId)
}
