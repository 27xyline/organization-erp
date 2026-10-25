import 'server-only'

import { cookies } from 'next/headers'
import type { CurrentUser } from '@/lib/auth/authorization'
import {
  backendFetch,
  backendStreamFetch,
  forwardedResponse,
  forwardDocumentRequestHeaders,
  forwardRequestHeaders,
} from './client'

type Actor = Pick<CurrentUser, 'id' | 'sessionVersion'>

function forwardSessionHeaders(request: Request, headers: Headers): void {
  for (const name of ['cookie', 'origin', 'x-csrf-token']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
}

/** Forward the browser's Python session to the API after the BFF has authorized the request. */
export async function proxyBackendRequest(
  request: Request,
  path: string,
  _user: Actor,
  requestId?: string,
): Promise<Response> {
  const method = request.method.toUpperCase()
  const body = ['GET', 'HEAD'].includes(method) ? undefined : request.body
  const headers = forwardRequestHeaders(request)
  forwardSessionHeaders(request, headers)
  if (requestId) headers.set('x-request-id', requestId)
  const response = await backendFetch(path, {
    method,
    headers,
    body,
    ...(body ? { duplex: 'half' as const } : {}),
  } as RequestInit, { forwardCookies: true })
  return forwardedResponse(response, { forwardSetCookie: true })
}

/** Stream document uploads/downloads through the same authenticated Python session. */
export async function proxyDocumentStreamRequest(
  request: Request,
  path: string,
  _user: Actor,
  requestId?: string,
): Promise<Response> {
  const method = request.method.toUpperCase()
  const body = ['GET', 'HEAD'].includes(method) ? undefined : request.body
  const headers = forwardDocumentRequestHeaders(request)
  forwardSessionHeaders(request, headers)
  if (requestId) headers.set('x-request-id', requestId)
  const response = await backendStreamFetch(path, {
    method,
    headers,
    body,
    signal: request.signal,
    ...(body ? { duplex: 'half' as const } : {}),
  } as RequestInit, { forwardCookies: true })
  return forwardedResponse(response, { forwardSetCookie: true })
}

/** SSR calls use the browser's session cookie and let Python resolve current roles/scopes. */
export async function backendUserFetch(
  path: string,
  _user: Actor,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  const cookieHeader = (await cookies()).toString()
  if (cookieHeader) headers.set('cookie', cookieHeader)
  headers.set('accept', 'application/json')
  const response = await backendFetch(path, { ...init, headers }, { forwardCookies: true })
  return forwardedResponse(response, { forwardSetCookie: true })
}
