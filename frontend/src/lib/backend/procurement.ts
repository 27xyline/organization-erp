import type { CurrentUser } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/transport'
import { backendUnavailableResponse } from '@/lib/backend/client'

/** Проксируем процесс закупки как единую границу транзакции, за которую отвечает Python. */
export async function proxyProcurementRequest(
  request: Request,
  path: string,
  user: Pick<CurrentUser, 'id' | 'sessionVersion'>,
  requestId: string,
): Promise<Response> {
  try {
    return await proxyBackendRequest(request, path, user, requestId)
  } catch (error) {
    return backendUnavailableResponse(error, requestId)
  }
}
