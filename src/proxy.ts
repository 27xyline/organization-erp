import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request })
  const isAuthPage = request.nextUrl.pathname.startsWith('/login')
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

  if (isAuthPage) {
    // A decodable JWT can still be invalid after sessionVersion changes.
    // Let the login page render so stale sessions do not loop between / and /login.
    return continueRequest()
  }

  // Protect all API routes and pages
  if (!token) {
    let from = request.nextUrl.pathname;
    if (request.nextUrl.search) {
      from += request.nextUrl.search;
    }

    if (request.nextUrl.pathname.startsWith('/api')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Требуется вход в систему' } },
        { status: 401, headers: { 'x-request-id': requestId } },
      )
    }

    return redirectWithRequestId(new URL(`/login?from=${encodeURIComponent(from)}`, request.url))
  }

  return continueRequest()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth endpoints)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/auth|api/health|_next/static|_next/image|favicon.ico).*)',
  ],
}
