import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

type ActorEnvelope = {
  data?: { mustChangePassword?: boolean }
}

function backendMeUrl(): URL | null {
  const configured = process.env.BACKEND_BASE_URL
  if (!configured) return null
  try {
    const base = new URL(configured)
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) return null
    return new URL('/api/account/me', base)
  } catch {
    return null
  }
}

export async function proxy(request: NextRequest) {
  const requestId = request.headers.get('x-request-id')?.slice(0, 128) || crypto.randomUUID()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)

  const continueRequest = () => {
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    response.headers.set('x-request-id', requestId)
    return response
  }
  const redirectWithRequestId = (url: URL) => {
    const response = NextResponse.redirect(url)
    response.headers.set('x-request-id', requestId)
    return response
  }
  const path = request.nextUrl.pathname
  if (path.startsWith('/login') || path === '/api/account/me') return continueRequest()

  const url = backendMeUrl()
  if (!url) return NextResponse.json(
    { error: { code: 'BACKEND_UNAVAILABLE', message: 'Сервис временно недоступен' } },
    { status: 503, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } },
  )

  let actorResponse: Response
  try {
    actorResponse = await fetch(url, {
      method: 'GET',
      headers: {
        cookie: request.headers.get('cookie') ?? '',
        accept: 'application/json',
        'x-request-id': requestId,
      },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    return NextResponse.json(
      { error: { code: 'BACKEND_UNAVAILABLE', message: 'Сервис временно недоступен' } },
      { status: 503, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } },
    )
  }

  if (actorResponse.status === 401) {
    if (path.startsWith('/api')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Требуется вход в систему' } },
        { status: 401, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } },
      )
    }
    const from = `${path}${request.nextUrl.search}`
    return redirectWithRequestId(new URL(`/login?from=${encodeURIComponent(from)}`, request.url))
  }
  if (!actorResponse.ok) {
    return NextResponse.json(
      { error: { code: 'BACKEND_UNAVAILABLE', message: 'Сервис временно недоступен' } },
      { status: 503, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } },
    )
  }

  let actor: ActorEnvelope['data']
  try {
    actor = (await actorResponse.json() as ActorEnvelope).data
  } catch {
    return NextResponse.json(
      { error: { code: 'BACKEND_REQUEST_FAILED', message: 'Сервис временно недоступен' } },
      { status: 502, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } },
    )
  }
  if (!actor) {
    return NextResponse.json(
      { error: { code: 'BACKEND_REQUEST_FAILED', message: 'Сервис временно недоступен' } },
      { status: 502, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } },
    )
  }
  if (actor.mustChangePassword && path !== '/account/password' && path !== '/api/account/password') {
    if (path.startsWith('/api')) {
      return NextResponse.json(
        { error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Необходимо изменить временный пароль' } },
        { status: 403, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } },
      )
    }
    return redirectWithRequestId(new URL('/account/password', request.url))
  }
  return continueRequest()
}

export const config = {
  matcher: [
    '/((?!api/auth|api/health|_next/static|_next/image|favicon.ico).*)',
  ],
}
