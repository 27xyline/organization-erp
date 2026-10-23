import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyStage10Request } from '@/lib/backend/stage10'
import { apiValidationError } from '@/lib/http/api-response'

export const dynamic = 'force-dynamic'

const yearSchema = z.coerce.number().int().min(2000).max(2100)

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'finance.salary.read')
  if (auth.response) return auth.response
  const year = yearSchema.safeParse(
    request.nextUrl.searchParams.get('year') || new Date().getFullYear(),
  )
  if (!year.success) return apiValidationError(year.error)
  return proxyStage10Request(
    request,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    auth.user,
    auth.requestId,
  )
}
