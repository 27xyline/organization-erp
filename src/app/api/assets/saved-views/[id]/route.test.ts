import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorizeApiRequest: vi.fn(),
  deleteView: vi.fn(),
}))

vi.mock('@/lib/auth/authorization', () => ({
  authorizeApiRequest: mocks.authorizeApiRequest,
}))

vi.mock('@/features/assets/application/saved-view.service', () => ({
  getAssetSavedViewService: () => ({ delete: mocks.deleteView }),
}))

import { DELETE } from './route'

describe('assets/saved-views/[id] route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.authorizeApiRequest.mockResolvedValue({
      user: { id: 'user-21' },
      response: null,
    })
  })

  it('deletes only the current owner view', async () => {
    mocks.deleteView.mockResolvedValueOnce(true)
    const request = new NextRequest('http://localhost/api/assets/saved-views/view-4', {
      method: 'DELETE',
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'view-4' }) })

    expect(mocks.authorizeApiRequest).toHaveBeenCalledWith(request, 'assets.read')
    expect(mocks.deleteView).toHaveBeenCalledWith('user-21', 'view-4')
    expect(response.status).toBe(204)
  })

  it('does not reveal or delete a view owned by another user', async () => {
    mocks.deleteView.mockResolvedValueOnce(false)

    const response = await DELETE(
      new NextRequest('http://localhost/api/assets/saved-views/other-view', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'other-view' }) },
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: { code: 'SAVED_VIEW_NOT_FOUND' } })
  })
})
