import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServerSession } from 'next-auth'
import { getDb } from '@/lib/prisma'
import { authorizeApiRequest, requireUser } from '../authorization'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  getDb: vi.fn(),
}))

const findUnique = vi.fn()

describe('authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDb).mockReturnValue({ user: { findUnique } } as never)
  })

  it('rejects a request without a session', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    await expect(requireUser()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    })
  })

  it('revalidates that the database user is active', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-1' } } as never)
    findUnique.mockResolvedValue({
      id: 'user-1', username: 'reader', name: 'Reader', role: 'VIEWER', isActive: false,
    })
    await expect(requireUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
  })

  it('enforces role requirements after the database lookup', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-1' } } as never)
    findUnique.mockResolvedValue({
      id: 'user-1', username: 'reader', name: 'Reader', role: 'VIEWER', isActive: true,
    })
    await expect(requireUser(['ADMIN', 'EDITOR'])).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    })
  })

  it('blocks cross-origin mutations before running domain code', async () => {
    const request = new NextRequest('http://localhost/api/assets', {
      method: 'POST',
      headers: { origin: 'https://attacker.example' },
    })
    const result = await authorizeApiRequest(request, ['ADMIN'])
    expect(result.response?.status).toBe(403)
    expect(getServerSession).not.toHaveBeenCalled()
  })
})
