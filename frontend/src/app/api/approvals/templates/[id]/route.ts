import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { updateApprovalTemplateSchema } from '@/features/approvals/contracts/approval'
import { proxyStage09 } from '@/lib/backend/stage09'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request, 'approvals.templates.manage')
  if (auth.response) return auth.response
  const parsed = updateApprovalTemplateSchema.safeParse(await request.clone().json().catch(() => null))
  if (!parsed.success) return apiValidationError(parsed.error)
  const { id } = await context.params
  return proxyStage09(request, `/api/approvals/templates/${encodeURIComponent(id)}`, auth.user, auth.requestId)
}
