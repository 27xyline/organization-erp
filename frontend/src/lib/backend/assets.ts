import 'server-only'

import type { CurrentUser } from '@/lib/auth/authorization'
import { backendUnavailableResponse } from './client'
import { proxyBackendRequest } from './transport'

/** Проксируем запрос без возможности обращения к БД из TypeScript в качестве запасного варианта. */
export async function proxyAssetRequest(
  request: Request,
  path: string,
  user: Pick<CurrentUser, 'id' | 'sessionVersion'>,
  requestId?: string,
): Promise<Response> {
  try {
    return await proxyBackendRequest(request, path, user, requestId)
  } catch (error) {
    return backendUnavailableResponse(error, requestId)
  }
}

/** Проксируем проверенный JSON после ограниченного приведения даты актива к прежнему формату Date. */
export async function proxyAssetJsonRequest(
  request: Request,
  path: string,
  user: Pick<CurrentUser, 'id' | 'sessionVersion'>,
  requestId: string | undefined,
  body: unknown,
): Promise<Response> {
  const headers = new Headers(request.headers)
  headers.delete('content-length')
  if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  const normalized = new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(body),
  })
  return proxyAssetRequest(normalized, path, user, requestId)
}
