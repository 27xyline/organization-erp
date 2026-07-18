import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/prisma'
import { CatalogService } from '@/features/assets/application/catalog.service'

vi.mock('@/lib/prisma', () => ({
  getDb: vi.fn(),
}))

describe('CatalogService department audit snapshots', () => {
  beforeEach(() => vi.clearAllMocks())

  it('records both department ID and canonical name when creating a MOL', async () => {
    const department = {
      id: 'department-1',
      name: 'Отдел снабжения',
      isActive: true,
    }
    const mol = {
      id: 'mol-1',
      code: 'MOL-1',
      fullName: 'Иванов Иван Иванович',
      storageLocation: 'Склад',
      photo: null,
      departmentId: department.id,
      department: department.name,
    }
    const tx = {
      department: {
        findUnique: vi.fn().mockResolvedValue(department),
      },
      mol: {
        create: vi.fn().mockResolvedValue(mol),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    }
    vi.mocked(getDb).mockReturnValue({
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as never)

    await CatalogService.createMol({
      code: mol.code,
      fullName: mol.fullName,
      storageLocation: mol.storageLocation,
      photo: null,
      departmentId: department.id,
    }, 'admin-1', 'request-1')

    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        details: {
          after: expect.objectContaining({
            departmentId: department.id,
            department: department.name,
          }),
        },
      }),
    }))
  })
})
