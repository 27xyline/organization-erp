import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiError } from '@/lib/http/api-response'
import { proxyStage07Request } from '@/lib/backend/stage07'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.export')
  if (auth.response) return auth.response

  const type = request.nextUrl.searchParams.get('type') || 'assets'
  if (type !== 'assets' && type !== 'operations') {
    return apiError('UNSUPPORTED_EXPORT_TYPE', 'Неизвестный тип экспорта', 422)
  }

  // FastAPI owns the export query and streams the XLSX attachment through the BFF.
  return proxyStage07Request(request, `${request.nextUrl.pathname}${request.nextUrl.search}`, auth.user, auth.requestId)
}
