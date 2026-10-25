import { afterEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { proxy } from './proxy'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('checks anonymous API requests with Python instead of trusting absent or present cookies', async () => {
  vi.stubEnv('BACKEND_BASE_URL', 'http://backend:8000')
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(
    { error: { code: 'UNAUTHENTICATED' } }, { status: 401 },
  ))
  vi.stubGlobal('fetch', fetchMock)
  const request = new NextRequest('https://erp.example/api/payroll')

  const response = await proxy(request)

  expect(fetchMock).toHaveBeenCalledWith(
    new URL('http://backend:8000/api/account/me'),
    expect.objectContaining({ cache: 'no-store' }),
  )
  expect(response.status).toBe(401)
})

it('redirects a stale session cookie after Python rejects it', async () => {
  vi.stubEnv('BACKEND_BASE_URL', 'http://backend:8000')
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(
    { error: { code: 'UNAUTHENTICATED' } }, { status: 401 },
  ))
  vi.stubGlobal('fetch', fetchMock)
  const request = new NextRequest('https://erp.example/projects', {
    headers: { cookie: 'erp_session=stale-token' },
  })

  const response = await proxy(request)

  expect(new URL(response.headers.get('location')!).pathname).toBe('/login')
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('cookie'))
    .toBe('erp_session=stale-token')
})
