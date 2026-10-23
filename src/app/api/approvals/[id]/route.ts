import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyStage09 } from '@/lib/backend/stage09'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'approvals.read')
  if (auth.response) return auth.response
  const { id } = await context.params
  return proxyStage09(request, `/api/approvals/${encodeURIComponent(id)}`, auth.user, auth.requestId)
}
