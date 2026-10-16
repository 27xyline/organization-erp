import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyStage07Request } from '@/lib/backend/stage07'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.inventory.manage')
  if (auth.response) return auth.response
  await context.params
  return proxyStage07Request(request, `${request.nextUrl.pathname}${request.nextUrl.search}`, auth.user, auth.requestId)
}
