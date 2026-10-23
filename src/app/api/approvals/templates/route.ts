import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { createApprovalTemplateSchema } from '@/features/approvals/contracts/approval'
import { proxyStage09 } from '@/lib/backend/stage09'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, {
    anyOf: ['approvals.create', 'approvals.templates.manage'],
  })
  if (auth.response) return auth.response
  return proxyStage09(request, '/api/approvals/templates', auth.user, auth.requestId)
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'approvals.templates.manage')
  if (auth.response) return auth.response
  const parsed = createApprovalTemplateSchema.safeParse(await request.clone().json().catch(() => null))
  if (!parsed.success) return apiValidationError(parsed.error)
  return proxyStage09(request, '/api/approvals/templates', auth.user, auth.requestId)
}
