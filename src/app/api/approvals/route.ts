import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiList, apiValidationError } from '@/lib/http/api-response'
import {
  approvalQuerySchema,
  createApprovalSchema,
} from '@/features/approvals/contracts/approval'
import { getApprovalService } from '@/features/approvals/application/approval.service'
import { approvalApiError } from '@/features/approvals/application/http'
import { getNotificationService } from '@/features/notifications/application/notification.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'approvals.read')
  if (auth.response) return auth.response
  const query = approvalQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  )
  if (!query.success) return apiValidationError(query.error)
  const canViewAll = auth.user.roles.some((role) =>
    role === 'ADMIN' || role === 'AUDITOR'
  )
  const result = await getApprovalService().list(
    auth.user.id,
    canViewAll,
    query.data,
  )
  return apiList(result.requests, {
    page: query.data.page,
    pageSize: query.data.pageSize,
    total: result.total,
  })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'approvals.create')
  if (auth.response) return auth.response
  const parsed = createApprovalSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiValidationError(parsed.error)
  try {
    return apiData(
      await getApprovalService(getNotificationService())
        .create(parsed.data, auth.user.id, auth.requestId),
      { status: 201 },
    )
  } catch (error) {
    return approvalApiError(error)
  }
}
