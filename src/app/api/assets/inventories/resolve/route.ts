import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiError } from '@/lib/http/api-response'
import { proxyStage07Request } from '@/lib/backend/stage07'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.inventory.manage')
  if (auth.response) return auth.response
  const inventoryNumber = request.nextUrl.searchParams.get('number')?.trim()
  if (!inventoryNumber || inventoryNumber.length > 100) {
    return apiError('VALIDATION_ERROR', 'Укажите корректный инвентарный номер', 422)
  }
  return proxyStage07Request(request, `${request.nextUrl.pathname}${request.nextUrl.search}`, auth.user, auth.requestId)
}
