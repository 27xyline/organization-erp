import type { CurrentUser } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/transport'
import { backendUnavailableResponse } from '@/lib/backend/client'

/** Проксируем чтение отчётов, поиск и экспорт в Python без запасного обращения через Prisma. */
export async function proxyReportingRequest(
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
