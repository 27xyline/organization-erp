import 'server-only'

import { BackendRequestError, backendFetch, forwardedResponse } from './client'

const SESSION_REQUEST_HEADERS = [
  'accept',
  'content-type',
  'cookie',
  'origin',
  'x-csrf-token',
  'x-request-id',
  'traceparent',
] as const

/** Forward the browser's session transport to Python without trusting browser auth headers. */
export async function proxySessionRequest(request: Request, path: string): Promise<Response> {
  const headers = new Headers()
  for (const name of SESSION_REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.delete('authorization')
  const method = request.method.toUpperCase()
  const body = ['GET', 'HEAD'].includes(method) ? undefined : await request.arrayBuffer()
  let response: Response
  try {
    response = await backendFetch(path, {
      method,
      headers,
      body,
    }, { forwardCookies: true })
  } catch (error) {
    if (error instanceof BackendRequestError) throw error
    throw new BackendRequestError('Backend is unavailable', 502, error)
  }
  return forwardedResponse(response, { forwardSetCookie: true })
}
