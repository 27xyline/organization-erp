import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyStage10Request } from '@/lib/backend/stage10'

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'payroll.manage')
  if (auth.response) return auth.response
  return proxyStage10Request(
    request,
    `/api/payroll/adjustments/${(await context.params).id}`,
    auth.user,
    auth.requestId,
  )
}
