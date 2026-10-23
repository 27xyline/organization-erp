import 'server-only'

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const FORWARDED_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-disposition',
  'content-length',
  'cache-control',
  'etag',
  'last-modified',
  'x-request-id',
  'x-content-type-options',
  'traceparent',
  'retry-after',
])

export class BackendRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'BackendRequestError'
  }
}

function backendBaseUrl(): URL {
  const configured = process.env.BACKEND_BASE_URL
  if (!configured) throw new BackendRequestError('Backend URL is not configured', 503)
  let url: URL
  try {
    url = new URL(configured)
  } catch (cause) {
    throw new BackendRequestError('Backend URL is invalid', 503, cause)
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new BackendRequestError('Backend URL is invalid', 503)
  }
  return url
}

function backendUrl(path: string): URL {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new BackendRequestError('Backend path must be an absolute API path', 400)
  }
  const base = backendBaseUrl()
  const url = new URL(path, base)
  if (url.origin !== base.origin) throw new BackendRequestError('Backend path is invalid', 400)
  return url
}

/** Server-only fixed-origin API client. Callers supply a relative path, never a URL. */
export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = backendUrl(path)
  const headers = new Headers(init.headers)
  headers.delete('cookie')
  headers.delete('host')
  headers.delete('connection')

  try {
    return await fetch(url, {
      ...init,
      headers,
      cache: 'no-store',
      signal: init.signal ?? AbortSignal.timeout(8_000),
      redirect: 'manual',
    })
  } catch (cause) {
    const status = cause instanceof DOMException && cause.name === 'TimeoutError' ? 503 : 502
    throw new BackendRequestError(status === 503 ? 'Backend request timed out' : 'Backend is unavailable', status, cause)
  }
}

/**
 * Fetch a streamed document request with an idle timeout while uploading and
 * awaiting response headers. Each upload chunk refreshes that timer. Once
 * headers arrive, the timeout ends; the caller's signal remains active for
 * request and response body cancellation.
 */
export async function backendStreamFetch(
  path: string,
  init: RequestInit = {},
  options: { headerTimeoutMs?: number } = {},
): Promise<Response> {
  const url = backendUrl(path)
  const headers = new Headers(init.headers)
  headers.delete('cookie')
  headers.delete('host')
  headers.delete('connection')

  const headerController = new AbortController()
  const timeoutMs = options.headerTimeoutMs ?? 8_000
  let timedOut = false
  let timer!: ReturnType<typeof setTimeout>
  const resetTimeout = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      timedOut = true
      headerController.abort(new DOMException('Backend request timed out', 'TimeoutError'))
    }, timeoutMs)
  }
  resetTimeout()
  const signal = init.signal
    ? AbortSignal.any([init.signal, headerController.signal])
    : headerController.signal
  let body = init.body
  if (body instanceof ReadableStream) {
    const reader = body.getReader()
    body = new ReadableStream({
      async pull(controller) {
        try {
          const chunk = await reader.read()
          if (chunk.done) {
            controller.close()
          } else {
            controller.enqueue(chunk.value)
          }
          resetTimeout()
        } catch (error) {
          controller.error(error)
        }
      },
      async cancel(reason) {
        clearTimeout(timer)
        await reader.cancel(reason)
      },
    })
  }

  try {
    return await fetch(url, {
      ...init,
      body,
      headers,
      cache: 'no-store',
      signal,
      redirect: 'manual',
    })
  } catch (cause) {
    if (init.signal?.aborted) throw cause
    const status = timedOut ? 503 : 502
    throw new BackendRequestError(
      status === 503 ? 'Backend request timed out' : 'Backend is unavailable',
      status,
      cause,
    )
  } finally {
    clearTimeout(timer)
  }
}

export function forwardedResponse(response: Response): Response {
  const headers = new Headers()
  response.headers.forEach((value, name) => {
    const key = name.toLowerCase()
    if (!HOP_BY_HOP_HEADERS.has(key) && FORWARDED_RESPONSE_HEADERS.has(key)) {
      headers.set(name, value)
    }
  })
  headers.set('cache-control', 'private, no-store')
  return new Response(response.body, { status: response.status, headers })
}

export function backendUnavailableResponse(error: unknown, requestId?: string): Response {
  const status = error instanceof BackendRequestError ? error.status : 502
  const headers = requestId ? { 'x-request-id': requestId } : undefined
  return Response.json(
    { error: { code: status === 503 ? 'BACKEND_UNAVAILABLE' : 'BACKEND_REQUEST_FAILED', message: 'Сервис временно недоступен' } },
    { status, headers },
  )
}

export function forwardRequestHeaders(request: Request): Headers {
  const headers = new Headers()
  for (const name of ['accept', 'content-type', 'x-request-id', 'traceparent']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  return headers
}

/** Allow only the extra metadata and unchanged declared length for raw file bodies. */
export function forwardDocumentRequestHeaders(request: Request): Headers {
  const headers = forwardRequestHeaders(request)
  for (const name of ['x-document-metadata', 'content-length']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  return headers
}
