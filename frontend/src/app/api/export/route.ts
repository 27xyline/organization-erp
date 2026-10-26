import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiError } from '@/lib/http/api-response'
import { proxyAssetRequest } from '@/lib/backend/assets'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.export')
  if (auth.response) return auth.response

  const type = request.nextUrl.searchParams.get('type') || 'assets'
  if (type !== 'assets' && type !== 'operations') {
    return apiError('UNSUPPORTED_EXPORT_TYPE', 'Неизвестный тип экспорта', 422)
  }

  // FastAPI выполняет запрос экспорта и передаёт вложение XLSX потоком через BFF.
  return proxyAssetRequest(request, `${request.nextUrl.pathname}${request.nextUrl.search}`, auth.user, auth.requestId)
}
