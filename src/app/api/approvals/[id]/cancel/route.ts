import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'
import { getApprovalService } from '@/features/approvals/application/approval.service'
import { approvalApiError } from '@/features/approvals/application/http'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'approvals.cancel')
  if (auth.response) return auth.response
  try {
    const { id } = await context.params
    return apiData(await getApprovalService().cancel(id, auth.user.id, auth.requestId))
  } catch (error) {
    return approvalApiError(error)
  }
}
