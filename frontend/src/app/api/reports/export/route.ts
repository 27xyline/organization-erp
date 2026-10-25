import type { NextRequest } from 'next/server'
import { dashboardQuerySchema } from '@/features/reporting/contracts/dashboard'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyReportingRequest } from '@/lib/backend/reporting'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'reports.export')
  if (auth.response) return auth.response
  const query = dashboardQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)

  const format = request.nextUrl.searchParams.get('format') || 'xlsx'
  const path = new URL(request.url)
  path.searchParams.set('format', format)
  return proxyReportingRequest(request, `${path.pathname}${path.search}`, auth.user, auth.requestId)
}
