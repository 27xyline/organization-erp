import { createHmac, timingSafeEqual } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mintBackendBridgeToken } from './bridge'

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
