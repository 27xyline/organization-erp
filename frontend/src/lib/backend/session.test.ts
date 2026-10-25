import { afterEach, expect, it, vi } from 'vitest'

import { proxySessionRequest } from './session'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('forwards only session and CSRF transport headers and returns backend Set-Cookie', async () => {
  vi.stubEnv('BACKEND_BASE_URL', 'http://127.0.0.1:8000')
  const fetchMock = vi.fn<typeof fetch>(async () => {
    const response = new Response(JSON.stringify({ data: true }), {
      headers: { 'content-type': 'application/json' },
    })
    response.headers.append('set-cookie', 'erp_session=opaque; HttpOnly; Path=/; SameSite=Lax')
    return response
  })
  vi.stubGlobal('fetch', fetchMock)
  const request = new Request('https://erp.example/api/auth/login', {
    method: 'POST',
    headers: {
      cookie: 'erp_csrf=signed; unrelated=ignored',
      origin: 'https://erp.example',
      'x-csrf-token': 'signed',
      authorization: 'Basic attacker-controlled',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ username: 'person', password: 'secret' }),
  })

  const response = await proxySessionRequest(request, '/api/auth/login')

  const forwarded = new Headers(fetchMock.mock.calls[0][1]?.headers)
  expect(String(fetchMock.mock.calls[0][0])).toBe('http://127.0.0.1:8000/api/auth/login')
  expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
  expect(JSON.parse(new TextDecoder().decode(fetchMock.mock.calls[0][1]?.body as ArrayBuffer))).toEqual({
    username: 'person',
    password: 'secret',
  })
  expect(forwarded.get('cookie')).toBe('erp_csrf=signed; unrelated=ignored')
  expect(forwarded.get('origin')).toBe('https://erp.example')
  expect(forwarded.get('x-csrf-token')).toBe('signed')
  expect(forwarded.get('authorization')).toBeNull()
  expect(response.headers.get('set-cookie')).toContain('erp_session=opaque')
})
