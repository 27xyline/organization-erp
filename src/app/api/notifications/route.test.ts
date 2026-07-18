import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const list = vi.fn()

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: vi.fn(async () => ({
    user: { id: 'current-user' },
    requestId: 'request-1',
  })),
}))

vi.mock('@/features/notifications/application/notification.service', () => ({
  getNotificationService: () => ({ list }),
}))

describe('notifications route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads only the authenticated user inbox', async () => {
    list.mockResolvedValue({ notifications: [], total: 0 })
    const { GET } = await import('./route')
    const response = await GET(new NextRequest(
      'http://localhost/api/notifications?page=2&pageSize=10&unreadOnly=true&userId=other',
    ))
    expect(response.status).toBe(200)
    expect(list).toHaveBeenCalledWith('current-user', {
      page: 2,
      pageSize: 10,
      unreadOnly: true,
    })
  })
})
