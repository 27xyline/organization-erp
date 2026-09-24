import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'
import { updateApprovalTemplateSchema } from '@/features/approvals/contracts/approval'
import { getApprovalService } from '@/features/approvals/application/approval.service'
import { approvalApiError } from '@/features/approvals/application/http'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request, 'approvals.templates.manage')
  if (auth.response) return auth.response
  const parsed = updateApprovalTemplateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiValidationError(parsed.error)
  const { id } = await context.params
  try {
    return apiData(await getApprovalService().updateTemplate(
      id,
      parsed.data,
      auth.user.id,
      auth.requestId,
    ))
  } catch (error) {
    return approvalApiError(error)
  }
}
