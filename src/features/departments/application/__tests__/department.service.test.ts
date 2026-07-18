import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/prisma'
import {
  DepartmentService,
} from '../department.service'
import { resolveDepartment } from '@/lib/organization/department-reference'

vi.mock('@/lib/prisma', () => ({ getDb: vi.fn() }))

const departmentRecord = {
  id: 'department-1',
  code: 'DEP-1',
  name: 'НИО-904',
  parentId: null,
  headEmployeeId: null,
  headEmployee: null,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  _count: { children: 0, employees: 0, staffPositions: 0, mols: 0 },
}

function createTransactionMock() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
    department: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    employee: { findFirst: vi.fn(), updateMany: vi.fn() },
    staffSchedule: { updateMany: vi.fn() },
    mol: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
}

function useTransaction(tx: ReturnType<typeof createTransactionMock>) {
  vi.mocked(getDb).mockReturnValue({
    $transaction: vi.fn(async (callback) => callback(tx)),
  } as never)
}

describe('DepartmentService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects a duplicate code regardless of case', async () => {
    const tx = createTransactionMock()
    useTransaction(tx)
    tx.department.findFirst.mockResolvedValue({ code: 'dep-1', name: 'Другое подразделение' })

    await expect(DepartmentService.create({
      code: 'DEP-1',
      name: 'Новое подразделение',
      parentId: null,
      headEmployeeId: null,
      isActive: true,
    }, 'admin-1')).rejects.toMatchObject({ code: 'CODE_EXISTS' })

    expect(tx.department.create).not.toHaveBeenCalled()
  })

  it('rejects a duplicate name regardless of case', async () => {
    const tx = createTransactionMock()
    useTransaction(tx)
    tx.department.findFirst.mockResolvedValue({ code: 'DEP-OTHER', name: 'нио-904' })

    await expect(DepartmentService.create({
      code: 'DEP-NEW',
      name: 'НИО-904',
      parentId: null,
      headEmployeeId: null,
      isActive: true,
    }, 'admin-1')).rejects.toMatchObject({ code: 'NAME_EXISTS' })
  })

  it('walks the complete parent chain and rejects a deep cycle', async () => {
    const tx = createTransactionMock()
    useTransaction(tx)
    tx.department.findFirst.mockResolvedValue(null)
    tx.department.findUnique.mockImplementation(async ({ where, select }) => {
      if (!select) return departmentRecord
      if (where.id === 'department-b') return { parentId: 'department-c' }
      if (where.id === 'department-c') return { parentId: departmentRecord.id }
      return null
    })

    await expect(DepartmentService.update(departmentRecord.id, {
      parentId: 'department-b',
    }, 'admin-1')).rejects.toMatchObject({ code: 'CYCLIC_HIERARCHY' })

    expect(tx.department.update).not.toHaveBeenCalled()
  })

  it('synchronizes every legacy snapshot when a department is renamed', async () => {
    const tx = createTransactionMock()
    useTransaction(tx)
    tx.department.findFirst.mockResolvedValue(null)
    tx.department.findUnique.mockResolvedValue(departmentRecord)
    tx.department.update.mockResolvedValue({ ...departmentRecord, name: 'Исследовательский отдел' })
    tx.employee.updateMany.mockResolvedValue({ count: 2 })
    tx.staffSchedule.updateMany.mockResolvedValue({ count: 3 })
    tx.mol.updateMany.mockResolvedValue({ count: 1 })
    tx.auditLog.create.mockResolvedValue({})

    await DepartmentService.update(departmentRecord.id, {
      name: 'Исследовательский отдел',
    }, 'admin-1')

    expect(tx.employee.updateMany).toHaveBeenCalledWith({
      where: { departmentId: departmentRecord.id },
      data: { department: 'Исследовательский отдел' },
    })
    expect(tx.staffSchedule.updateMany).toHaveBeenCalledWith({
      where: { departmentId: departmentRecord.id },
      data: { department: 'Исследовательский отдел' },
    })
    expect(tx.mol.updateMany).toHaveBeenCalledWith({
      where: { departmentId: departmentRecord.id },
      data: { department: 'Исследовательский отдел' },
    })
  })

  it('does not delete a department referenced by domain data', async () => {
    const tx = createTransactionMock()
    useTransaction(tx)
    tx.department.findUnique.mockResolvedValue({
      ...departmentRecord,
      _count: { ...departmentRecord._count, employees: 1 },
    })

    await expect(DepartmentService.delete(departmentRecord.id, 'admin-1'))
      .rejects.toMatchObject({ code: 'IN_USE' })
    expect(tx.department.delete).not.toHaveBeenCalled()
  })
})

describe('resolveDepartment', () => {
  it('resolves a legacy name with a case-insensitive lookup', async () => {
    const db = {
      department: {
        findFirst: vi.fn().mockResolvedValue({
          id: departmentRecord.id,
          name: departmentRecord.name,
          isActive: true,
        }),
      },
    }

    await expect(resolveDepartment(db as never, { department: 'нио-904' }))
      .resolves.toMatchObject({ id: departmentRecord.id })
    expect(db.department.findFirst).toHaveBeenCalledWith({
      where: { name: { equals: 'нио-904', mode: 'insensitive' } },
      select: { id: true, name: true, isActive: true },
    })
  })

  it('rejects an empty legacy department before querying the database', async () => {
    const db = {
      department: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
    }

    await expect(resolveDepartment(db as never, { department: '   ' }))
      .rejects.toMatchObject({ code: 'DEPARTMENT_REQUIRED' })
    expect(db.department.findFirst).not.toHaveBeenCalled()
    expect(db.department.findUnique).not.toHaveBeenCalled()
  })
})
