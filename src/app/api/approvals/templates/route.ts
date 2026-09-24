import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'
import {
  createApprovalTemplateSchema,
} from '@/features/approvals/contracts/approval'
import { getApprovalService } from '@/features/approvals/application/approval.service'
import { approvalApiError } from '@/features/approvals/application/http'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, {
    anyOf: ['approvals.create', 'approvals.templates.manage'],
  })
  if (auth.response) return auth.response
  const canManage = auth.user.permissions.includes('approvals.templates.manage')
  return apiData(await getApprovalService().listTemplates(canManage))
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'approvals.templates.manage')
  if (auth.response) return auth.response
  const parsed = createApprovalTemplateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiValidationError(parsed.error)
  try {
    return apiData(
      await getApprovalService().createTemplate(parsed.data, auth.user.id, auth.requestId),
      { status: 201 },
    )
  } catch (error) {
    return approvalApiError(error)
  }
}
