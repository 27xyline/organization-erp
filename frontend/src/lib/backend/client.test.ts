import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  backendStreamFetch,
  backendFetch,
  backendUnavailableResponse,
  forwardDocumentRequestHeaders,
  forwardRequestHeaders,
  forwardedResponse,
} from './client'
import { proxyBackendRequest } from './transport'

describe('backend client', () => {
  it('owns the source stream and propagates downstream cancellation', async () => {
    let cancelled: unknown
    const source = new Response(new ReadableStream<Uint8Array>({
      cancel(reason) { cancelled = reason },
    }))
    const forwarded = forwardedResponse(source)

    // Native fetch finalizers may cancel an unlocked source after its Response is collected.
    expect(source.body?.locked).toBe(true)
    await forwarded.body?.cancel('browser disconnected')
    await vi.waitFor(() => expect(cancelled).toBe('browser disconnected'))
  })

  it('delivers chunks before EOF and propagates upstream failures', async () => {
    let upstream!: ReadableStreamDefaultController<Uint8Array>
    const source = new Response(new ReadableStream<Uint8Array>({
      start(controller) { upstream = controller },
    }))
    const reader = forwardedResponse(source).body!.getReader()
    upstream.enqueue(new Uint8Array([1, 2, 3]))
    expect(await reader.read()).toEqual({ done: false, value: new Uint8Array([1, 2, 3]) })
    upstream.error(new Error('upstream disconnected'))
    await expect(reader.read()).rejects.toThrow('upstream disconnected')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('preserves the fixed backend path, query, method, body and trace headers', async () => {
    vi.stubEnv('BACKEND_BASE_URL', 'http://127.0.0.1:8000')
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)
    const request = new Request('https://erp.example/api/users?page=2', {
      method: 'POST',
      headers: {
        cookie: 'session=secret',
        authorization: 'Basic browser-value',
        'x-request-id': 'request-1',
        traceparent: '00-11111111111111111111111111111111-2222222222222222-01',
        'content-type': 'application/json',
      },
    })
    const headers = forwardRequestHeaders(request)
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('authorization')).toBeNull()

    await backendFetch('/api/users?page=2', {
      method: request.method,
      headers,
      body: JSON.stringify({ username: 'new-user' }),
    })
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:8000/api/users?page=2'),
      expect.objectContaining({ method: 'POST', cache: 'no-store' }),
    )
    const forwardedHeaders = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(forwardedHeaders.get('x-request-id')).toBe('request-1')
    expect(forwardedHeaders.get('traceparent')).toBe(
      '00-11111111111111111111111111111111-2222222222222222-01',
    )
  })

  it('will not accept a caller-controlled backend URL and filters response headers', async () => {
    vi.stubEnv('BACKEND_BASE_URL', 'http://127.0.0.1:8000')
    await expect(backendFetch('https://attacker.example/')).rejects.toThrow(/absolute API path/)
    const response = forwardedResponse(new Response('streamed', {
      status: 206,
      headers: {
        'content-type': 'application/octet-stream',
        'x-request-id': 'request-2',
        'set-cookie': 'private=1',
        connection: 'close',
      },
    }))
    expect(response.status).toBe(206)
    expect(response.headers.get('x-request-id')).toBe('request-2')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await response.text()).toBe('streamed')
  })

  it('forwards document metadata and declared length without forwarding browser credentials', () => {
    const request = new Request('https://erp.example/api/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'content-length': '1234',
        'x-document-metadata': 'eyJ0aXRsZSI6ImRvYyJ9',
        cookie: 'session=secret',
        authorization: 'Basic browser-value',
      },
      body: 'x'.repeat(1234),
    })

    const headers = forwardDocumentRequestHeaders(request)

    expect(headers.get('content-type')).toBe('application/pdf')
    expect(headers.get('content-length')).toBe('1234')
    expect(headers.get('x-document-metadata')).toBe('eyJ0aXRsZSI6ImRvYyJ9')
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('authorization')).toBeNull()
  })

  it('preserves download security headers through the response allowlist', () => {
    const response = forwardedResponse(new Response('bytes', {
      headers: {
        'content-type': 'application/pdf',
        'content-length': '5',
        'content-disposition': 'attachment; filename="a.pdf"',
        etag: '"sha256-abc"',
        'x-content-type-options': 'nosniff',
      },
    }))

    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-length')).toBe('5')
    expect(response.headers.get('content-disposition')).toContain('a.pdf')
    expect(response.headers.get('etag')).toBe('"sha256-abc"')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('bounds backend headers but does not time out a slow streamed body', async () => {
    vi.stubEnv('BACKEND_BASE_URL', 'http://127.0.0.1:8000')
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({
      async start(controller) {
        await new Promise((resolve) => setTimeout(resolve, 30))
        controller.enqueue(new TextEncoder().encode('late'))
        controller.close()
      },
    })))
    vi.stubGlobal('fetch', fetchMock)

    const response = await backendStreamFetch('/api/documents/1/download', {}, { headerTimeoutMs: 10 })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(await response.text()).toBe('late')
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:8000/api/documents/1/download'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('resets the header timeout as upload chunks continue arriving', async () => {
    vi.stubEnv('BACKEND_BASE_URL', 'http://127.0.0.1:8000')
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const reader = (init?.body as ReadableStream<Uint8Array>).getReader()
      while (!(await reader.read()).done) { /* читаем входящие данные загрузки */ }
      return new Response('uploaded')
    })
    vi.stubGlobal('fetch', fetchMock)
    const upload = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (let chunk = 0; chunk < 4; chunk += 1) {
          await new Promise((resolve) => setTimeout(resolve, 8))
          controller.enqueue(new Uint8Array([chunk]))
        }
        controller.close()
      },
    })

    const startedAt = Date.now()
    const response = await backendStreamFetch('/api/documents', {
      method: 'POST', body: upload, duplex: 'half',
    } as RequestInit, { headerTimeoutMs: 15 })

    expect(Date.now() - startedAt).toBeGreaterThan(15)
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false)
    expect(await response.text()).toBe('uploaded')
  })

  it('aborts a pending document request when the client disconnects', async () => {
    vi.stubEnv('BACKEND_BASE_URL', 'http://127.0.0.1:8000')
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new AbortController()
    const pending = backendStreamFetch('/api/documents/1/download', { signal: client.signal }, { headerTimeoutMs: 1_000 })
    client.abort(new DOMException('client disconnected', 'AbortError'))

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('maps a backend timeout to 503 with a request id without retrying', async () => {
    vi.stubEnv('BACKEND_BASE_URL', 'http://127.0.0.1:8000')
    const timeout = new DOMException('timed out', 'TimeoutError')
    const fetchMock = vi.fn<typeof fetch>(async () => { throw timeout })
    vi.stubGlobal('fetch', fetchMock)

    let caught: unknown
    try {
      await backendFetch('/api/users', { method: 'POST', body: '{}' })
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({ name: 'BackendRequestError', status: 503 })
    const response = backendUnavailableResponse(caught, 'request-timeout')
    expect(response.status).toBe(503)
    expect(response.headers.get('x-request-id')).toBe('request-timeout')
    expect(await response.json()).toMatchObject({ error: { code: 'BACKEND_UNAVAILABLE' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('forwards a user request with a signed bridge token and streams the backend response', async () => {
    vi.stubEnv('BACKEND_BASE_URL', 'http://127.0.0.1:8000')
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('backend-stream', {
      status: 206,
      headers: { 'x-request-id': 'request-from-python', 'content-type': 'application/octet-stream' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const request = new Request('https://erp.example/api/users?search=a', {
      method: 'POST',
      headers: {
        authorization: 'Basic browser-credential',
        cookie: 'erp_session=private',
        origin: 'https://erp.example',
        'x-csrf-token': 'csrf-token',
        'content-type': 'application/json',
        traceparent: '00-11111111111111111111111111111111-2222222222222222-01',
      },
      body: JSON.stringify({ username: 'new-user' }),
    })
    const response = await proxyBackendRequest(request, '/api/users?search=a', {
      id: 'user-7', sessionVersion: 4,
    }, 'request-from-next')

    expect(response.status).toBe(206)
    expect(response.headers.get('x-request-id')).toBe('request-from-python')
    expect(await response.text()).toBe('backend-stream')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBeInstanceOf(URL)
    expect((url as URL).pathname + (url as URL).search).toBe('/api/users?search=a')
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('cookie')).toBe('erp_session=private')
    expect(headers.get('origin')).toBe('https://erp.example')
    expect(headers.get('x-csrf-token')).toBe('csrf-token')
    expect(headers.get('x-request-id')).toBe('request-from-next')
    expect(headers.get('traceparent')).toBe(
      '00-11111111111111111111111111111111-2222222222222222-01',
    )
    expect(await new Response(init?.body).text()).toBe(JSON.stringify({ username: 'new-user' }))
  })
})
