import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => 'erp_session=ssr-session' }),
}))

import { backendUserFetch, proxyDocumentStreamRequest } from './transport'

describe('session transport', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('forwards the SSR session cookie for Python to resolve the current actor', async () => {
    vi.stubEnv('BACKEND_BASE_URL', 'http://127.0.0.1:8000')
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ data: { id: 'user-1' } }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await backendUserFetch('/api/account/me', { id: 'user-1', sessionVersion: 2 })

    expect(response.status).toBe(200)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toEqual(new URL('http://127.0.0.1:8000/api/account/me'))
    expect(new Headers(init?.headers).get('cookie')).toBe('erp_session=ssr-session')
    expect(new Headers(init?.headers).get('authorization')).toBeNull()
  })

  it('streams document bodies with session, CSRF and metadata headers intact', async () => {
    vi.stubEnv('BACKEND_BASE_URL', 'http://127.0.0.1:8000')
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('stored', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const bytes = new Uint8Array([1, 2, 3])
    const request = new Request('https://erp.example/api/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(bytes.byteLength),
        'x-document-metadata': 'encoded-metadata',
        cookie: 'erp_session=browser-session',
        origin: 'https://erp.example',
        'x-csrf-token': 'csrf-token',
        authorization: 'Bearer untrusted-browser-token',
      },
      body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } }),
      duplex: 'half',
    } as RequestInit)

    const response = await proxyDocumentStreamRequest(
      request,
      '/api/documents',
      { id: 'user-1', sessionVersion: 2 },
      'request-doc',
    )

    expect(response.status).toBe(201)
    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('cookie')).toBe('erp_session=browser-session')
    expect(headers.get('origin')).toBe('https://erp.example')
    expect(headers.get('x-csrf-token')).toBe('csrf-token')
    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('x-document-metadata')).toBe('encoded-metadata')
    expect(headers.get('content-length')).toBe(String(bytes.byteLength))
    expect(headers.get('x-request-id')).toBe('request-doc')
    expect(Array.from(new Uint8Array(await new Response(init?.body).arrayBuffer()))).toEqual([1, 2, 3])
  })
})
