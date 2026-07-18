import { describe, expect, it } from 'vitest'
import { authOptions } from './auth'

describe('auth session version propagation', () => {
  it('copies the database session version into the JWT and exposed session', async () => {
    const jwtCallback = authOptions.callbacks?.jwt
    const sessionCallback = authOptions.callbacks?.session
    if (!jwtCallback || !sessionCallback) throw new Error('Auth callbacks are not configured')

    const token = await jwtCallback({
      token: {},
      user: {
        id: 'user-1',
        name: 'User',
        username: 'user',
        role: 'VIEWER',
        roles: ['AUDITOR'],
        sessionVersion: 9,
      },
    } as never)
    expect(token).toMatchObject({
      id: 'user-1',
      sessionVersion: 9,
    })

    const session = await sessionCallback({
      session: {
        user: {
          id: '',
          name: 'User',
          username: '',
          role: 'VIEWER',
          roles: [],
          sessionVersion: 0,
        },
        expires: new Date(Date.now() + 60_000).toISOString(),
      },
      token,
    } as never)
    expect(session.user).toMatchObject({
      id: 'user-1',
      sessionVersion: 9,
    })
  })
})
