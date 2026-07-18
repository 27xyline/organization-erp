import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'
import { approvalDecisionSchema } from '@/features/approvals/contracts/approval'
import { getApprovalService } from '@/features/approvals/application/approval.service'
import { approvalApiError } from '@/features/approvals/application/http'
import { getNotificationService } from '@/features/notifications/application/notification.service'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'approvals.decide')
  if (auth.response) return auth.response
  const parsed = approvalDecisionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiValidationError(parsed.error)
  try {
    const { id } = await context.params
    return apiData(
      await getApprovalService(getNotificationService())
        .decide(id, auth.user.id, parsed.data, auth.requestId),
    )
  } catch (error) {
    return approvalApiError(error)
  }
}
