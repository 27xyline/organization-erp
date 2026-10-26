import { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { z } from 'zod'
import { proxyReportingRequest } from '@/lib/backend/reporting'

const querySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departmentId: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, { allOf: ['reports.read', 'assets.read'] })
  if (auth.response) return auth.response

  const searchParams = Object.fromEntries(request.nextUrl.searchParams)
  const query = querySchema.safeParse(searchParams)
  if (!query.success) return apiValidationError(query.error)

  return proxyReportingRequest(request, `${request.nextUrl.pathname}${request.nextUrl.search}`, auth.user, auth.requestId)
}
