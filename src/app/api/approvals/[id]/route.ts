import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'
import { getApprovalService } from '@/features/approvals/application/approval.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'approvals.read')
  if (auth.response) return auth.response
  const canViewAll = auth.user.roles.some((role) => role === 'ADMIN' || role === 'AUDITOR')
  const { id } = await context.params
  const approval = await getApprovalService().getVisibleById(id, auth.user.id, canViewAll)
  if (!approval) return Response.json({ error: { message: 'Согласование не найдено' } }, { status: 404 })
  return apiData(approval)
}
