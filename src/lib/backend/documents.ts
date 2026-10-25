import 'server-only'

import type { CurrentUser } from '@/lib/auth/authorization'
import { backendUnavailableResponse } from './client'
import { proxyBackendRequest, proxyDocumentStreamRequest } from './transport'

export async function proxyDocumentRequest(
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

export async function proxyDocumentStream(
  request: Request,
  path: string,
  user: Pick<CurrentUser, 'id' | 'sessionVersion'>,
  requestId?: string,
): Promise<Response> {
  try {
    return await proxyDocumentStreamRequest(request, path, user, requestId)
  } catch (error) {
    return backendUnavailableResponse(error, requestId)
  }
}
