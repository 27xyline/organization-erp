import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { updateApprovalTemplateSchema } from '@/features/approvals/contracts/approval'
import { proxyNotificationRequest } from '@/lib/backend/notifications'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request, 'approvals.templates.manage')
  if (auth.response) return auth.response
  const parsed = updateApprovalTemplateSchema.safeParse(await request.clone().json().catch(() => null))
  if (!parsed.success) return apiValidationError(parsed.error)
  const { id } = await context.params
  return proxyNotificationRequest(request, `/api/approvals/templates/${encodeURIComponent(id)}`, auth.user, auth.requestId)
}
