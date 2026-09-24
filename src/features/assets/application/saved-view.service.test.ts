import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetSavedViewService } from './saved-view.service'

const database = vi.hoisted(() => ({
  assetSavedView: {
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ getDb: () => database }))

describe('AssetSavedViewService', () => {
  const service = new AssetSavedViewService(database as never)

  beforeEach(() => vi.resetAllMocks())

  it('lists views by owner and most recently updated first', async () => {
    const rows = [{ id: 'view-1', name: 'На ремонте', filters: { status: 'UNDER_REPAIR' } }]
    database.assetSavedView.findMany.mockResolvedValueOnce(rows)

    await expect(service.list('user-1')).resolves.toEqual(rows)
    expect(database.assetSavedView.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, filters: true },
    })
  })

  it('stores the owner and whitelisted filters when creating a view', async () => {
    const filters = { search: 'Ноутбук', status: 'IN_USE' as const }
    database.assetSavedView.create.mockResolvedValueOnce({ id: 'view-2', name: 'Ноутбуки', filters })

    await service.create('user-2', { name: 'Ноутбуки', filters })

    expect(database.assetSavedView.create).toHaveBeenCalledWith({
      data: { userId: 'user-2', name: 'Ноутбуки', filters },
      select: { id: true, name: true, filters: true },
    })
  })

  it('deletes by both view id and owner', async () => {
    database.assetSavedView.deleteMany.mockResolvedValueOnce({ count: 1 })

    await expect(service.delete('user-3', 'view-3')).resolves.toBe(true)
    expect(database.assetSavedView.deleteMany).toHaveBeenCalledWith({
      where: { id: 'view-3', userId: 'user-3' },
    })
  })

  it('reports when the requested view is not owned by the user', async () => {
    database.assetSavedView.deleteMany.mockResolvedValueOnce({ count: 0 })

    await expect(service.delete('user-4', 'another-users-view')).resolves.toBe(false)
  })
})
