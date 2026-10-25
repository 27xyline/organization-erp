import { expect, it } from 'vitest'

import { requestWithCsrfHeader } from './csrf-fetch'

it('adds the signed double-submit cookie to unsafe same-origin browser requests', () => {
  const request = requestWithCsrfHeader(
    new Request('https://erp.example/api/payroll', { method: 'POST' }),
    undefined,
    'erp_csrf=signed-token',
    'https://erp.example',
  )

  expect(new Headers(request.init.headers).get('x-csrf-token')).toBe('signed-token')
})

it('does not add a CSRF header to safe, cross-origin, or already explicit requests', () => {
  const safe = requestWithCsrfHeader(
    new Request('https://erp.example/api/payroll'), undefined,
    'erp_csrf=signed-token', 'https://erp.example',
  )
  const crossOrigin = requestWithCsrfHeader(
    new Request('https://other.example/api/payroll', { method: 'POST' }), undefined,
    'erp_csrf=signed-token', 'https://erp.example',
  )
  const explicit = requestWithCsrfHeader(
    new Request('https://erp.example/api/payroll', { method: 'POST' }),
    { headers: { 'x-csrf-token': 'explicit-token' } },
    'erp_csrf=signed-token', 'https://erp.example',
  )

  expect(new Headers(safe.init.headers).has('x-csrf-token')).toBe(false)
  expect(new Headers(crossOrigin.init.headers).has('x-csrf-token')).toBe(false)
  expect(new Headers(explicit.init.headers).get('x-csrf-token')).toBe('explicit-token')
})
