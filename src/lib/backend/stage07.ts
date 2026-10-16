import 'server-only'

import type { CurrentUser } from '@/lib/auth/authorization'
import { backendUnavailableResponse } from './client'
import { proxyBackendRequest } from './bridge'

/** Proxy a Stage 07 request without allowing a TypeScript database fallback. */
export async function proxyStage07Request(
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

/** Proxy validated JSON after the narrow legacy asset Date coercion has run. */
export async function proxyStage07AssetJsonRequest(
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
  return proxyStage07Request(normalized, path, user, requestId)
}
