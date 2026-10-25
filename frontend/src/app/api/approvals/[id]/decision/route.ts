import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { approvalDecisionSchema } from '@/features/approvals/contracts/approval'
import { proxyNotificationRequest } from '@/lib/backend/notifications'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'approvals.decide')
  if (auth.response) return auth.response
  const parsed = approvalDecisionSchema.safeParse(await request.clone().json().catch(() => null))
  if (!parsed.success) return apiValidationError(parsed.error)
  const { id } = await context.params
  return proxyNotificationRequest(request, `/api/approvals/${encodeURIComponent(id)}/decision`, auth.user, auth.requestId)
}
