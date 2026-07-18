import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'
import { getApprovalService } from '@/features/approvals/application/approval.service'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'approvals.create')
  if (auth.response) return auth.response
  return apiData(await getApprovalService().approverOptions())
}
