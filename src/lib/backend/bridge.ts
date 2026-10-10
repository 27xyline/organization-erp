import 'server-only'

import { createHmac } from 'node:crypto'
import type { CurrentUser } from '@/lib/auth/authorization'
import { BackendRequestError, backendFetch, forwardedResponse, forwardRequestHeaders } from './client'

const ISSUER = 'erp-next'
const AUDIENCE = 'erp-python'
const TOKEN_LIFETIME_SECONDS = 60

function secret(name: 'BACKEND_BRIDGE_SECRET' | 'BACKEND_INTERNAL_AUTH_SECRET'): string {
  const value = process.env[name]
  if (!value || Buffer.byteLength(value, 'utf8') < 32) {
    throw new BackendRequestError(`${name} must contain at least 32 bytes`, 503)
  }
  const otherName = name === 'BACKEND_BRIDGE_SECRET'
    ? 'BACKEND_INTERNAL_AUTH_SECRET'
    : 'BACKEND_BRIDGE_SECRET'
  if (process.env[otherName] && process.env[otherName] === value) {
    throw new BackendRequestError('Backend authentication secrets must be different', 503)
  }
  return value
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

function sign(payload: Record<string, unknown>): string {
  const key = secret('BACKEND_BRIDGE_SECRET')
  const encodedHeader = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const encodedPayload = base64url(JSON.stringify(payload))
  const content = `${encodedHeader}.${encodedPayload}`
  const signature = createHmac('sha256', key).update(content).digest('base64url')
  return `${content}.${signature}`
}

/** Mint only from a CurrentUser returned by requireUser after DB activity/version checks. */
export function mintBackendBridgeToken(user: Pick<CurrentUser, 'id' | 'sessionVersion'>): string {
  const iat = Math.floor(Date.now() / 1000)
  return sign({
    sub: user.id,
    sessionVersion: user.sessionVersion,
    iat,
    exp: iat + TOKEN_LIFETIME_SECONDS,
    iss: ISSUER,
    aud: AUDIENCE,
  })
}

export function internalAuthHeaders(): Headers {
  return new Headers({ Authorization: `Bearer ${secret('BACKEND_INTERNAL_AUTH_SECRET')}` })
}

export function backendUserHeaders(
  request: Request,
  user: Pick<CurrentUser, 'id' | 'sessionVersion'>,
): Headers {
  const headers = forwardRequestHeaders(request)
  headers.set('authorization', `Bearer ${mintBackendBridgeToken(user)}`)
  return headers
}

export async function proxyBackendRequest(
  request: Request,
  path: string,
  user: Pick<CurrentUser, 'id' | 'sessionVersion'>,
  requestId?: string,
): Promise<Response> {
  const method = request.method.toUpperCase()
  const body = ['GET', 'HEAD'].includes(method) ? undefined : request.body
  const headers = backendUserHeaders(request, user)
  if (requestId) headers.set('x-request-id', requestId)
  const response = await backendFetch(path, {
    method,
    headers,
    body,
    ...(body ? { duplex: 'half' as const } : {}),
  } as RequestInit)
  return forwardedResponse(response)
}

export function backendUserFetch(
  path: string,
  user: Pick<CurrentUser, 'id' | 'sessionVersion'>,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${mintBackendBridgeToken(user)}`)
  headers.set('accept', 'application/json')
  return backendFetch(path, { ...init, headers })
}

export async function authenticateBackendCredentials(
  username: string,
  password: string,
): Promise<Response> {
  const response = await backendFetch('/api/internal/auth/credentials', {
    method: 'POST',
    headers: {
      ...Object.fromEntries(internalAuthHeaders()),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ username, password }),
  })
  return response
}
