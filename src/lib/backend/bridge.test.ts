import { createHmac, timingSafeEqual } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mintBackendBridgeToken, proxyDocumentStreamRequest } from './bridge'

const secret = 'bridge-secret-for-tests-only-32-bytes'

describe('backend bridge token', () => {
  beforeEach(() => {
    vi.stubEnv('BACKEND_BRIDGE_SECRET', secret)
  })

  it('signs a short lived actor token with the Python audience and session version', () => {
    const token = mintBackendBridgeToken({ id: 'user-42', sessionVersion: 7 })
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.')
    const content = `${encodedHeader}.${encodedPayload}`
    const expected = createHmac('sha256', secret).update(content).digest()
    const actual = Buffer.from(encodedSignature, 'base64url')

    expect(timingSafeEqual(actual, expected)).toBe(true)
    expect(JSON.parse(Buffer.from(encodedHeader, 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT' })
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString())
    expect(payload).toMatchObject({ sub: 'user-42', sessionVersion: 7, iss: 'erp-next', aud: 'erp-python' })
    expect(payload.exp - payload.iat).toBe(60)
  })

  it('fails closed if the bridge secret is absent or too short', () => {
    vi.stubEnv('BACKEND_BRIDGE_SECRET', 'short')
    expect(() => mintBackendBridgeToken({ id: 'user-42', sessionVersion: 7 })).toThrow(/at least 32 bytes/)
  })

  it('rejects reuse of the internal-auth secret as the signing key', () => {
    vi.stubEnv('BACKEND_INTERNAL_AUTH_SECRET', secret)
    expect(() => mintBackendBridgeToken({ id: 'user-42', sessionVersion: 7 })).toThrow(/must be different/)
  })
})

describe('document stream bridge', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('forwards the raw upload stream, metadata, declared length and client signal', async () => {
    vi.stubEnv('BACKEND_BASE_URL', 'http://127.0.0.1:8000')
    vi.stubEnv('BACKEND_BRIDGE_SECRET', secret)
    vi.stubEnv('BACKEND_INTERNAL_AUTH_SECRET', 'different-internal-secret-for-test')
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('created', {
      status: 201,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const bytes = new Uint8Array([0, 255, 1, 2, 128])
    const client = new AbortController()
    const request = new Request('https://erp.example/api/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(bytes.byteLength),
        'x-document-metadata': 'eyJmaWxlbmFtZSI6ImEucGRmIn0',
        cookie: 'session=private',
        authorization: 'Basic browser-value',
      },
      body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } }),
      signal: client.signal,
      duplex: 'half',
    } as RequestInit)

    const response = await proxyDocumentStreamRequest(request, '/api/documents', { id: 'user-1', sessionVersion: 2 }, 'req-1')

    expect(response.status).toBe(201)
    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('content-type')).toBe('application/pdf')
    expect(headers.get('content-length')).toBe(String(bytes.byteLength))
    expect(headers.get('x-document-metadata')).toBe('eyJmaWxlbmFtZSI6ImEucGRmIn0')
    expect(headers.get('x-request-id')).toBe('req-1')
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('authorization')).toMatch(/^Bearer /)
    expect(Array.from(new Uint8Array(await new Response(init?.body).arrayBuffer()))).toEqual(Array.from(bytes))
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })
})
