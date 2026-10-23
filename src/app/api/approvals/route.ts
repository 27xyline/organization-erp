import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { approvalQuerySchema, createApprovalSchema } from '@/features/approvals/contracts/approval'
import { proxyStage09 } from '@/lib/backend/stage09'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'approvals.read')
  if (auth.response) return auth.response
  const query = approvalQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  )
  if (!query.success) return apiValidationError(query.error)
  return proxyStage09(request, `/api/approvals${request.nextUrl.search}`, auth.user, auth.requestId)
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'approvals.create')
  if (auth.response) return auth.response
  const parsed = createApprovalSchema.safeParse(await request.clone().json().catch(() => null))
  if (!parsed.success) return apiValidationError(parsed.error)
  return proxyStage09(request, '/api/approvals', auth.user, auth.requestId)
}
