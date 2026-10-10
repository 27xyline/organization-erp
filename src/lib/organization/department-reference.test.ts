import { describe, expect, it, vi } from 'vitest'
import { resolveDepartment } from './department-reference'

const department = {
  id: 'department-1',
  name: 'НИО-904',
  isActive: true,
}

describe('resolveDepartment', () => {
  it('resolves a legacy name with a case-insensitive lookup', async () => {
    const db = { department: { findFirst: vi.fn().mockResolvedValue(department) } }

    await expect(resolveDepartment(db as never, { department: 'нио-904' }))
      .resolves.toMatchObject({ id: department.id })
    expect(db.department.findFirst).toHaveBeenCalledWith({
      where: { name: { equals: 'нио-904', mode: 'insensitive' } },
      select: { id: true, name: true, isActive: true },
    })
  })

  it('rejects an empty legacy department before querying the database', async () => {
    const findFirst = vi.fn()
    const findUnique = vi.fn()
    const db = { department: { findFirst, findUnique } }

    await expect(resolveDepartment(db as never, { department: '   ' }))
      .rejects.toMatchObject({ code: 'DEPARTMENT_REQUIRED' })
    expect(findFirst).not.toHaveBeenCalled()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'ID', reference: { departmentId: department.id }, method: 'findUnique' as const },
    { label: 'legacy name', reference: { department: department.name.toLocaleLowerCase('ru') }, method: 'findFirst' as const },
  ])('allows preserving the same inactive department by $label', async ({ reference, method }) => {
    const findUnique = vi.fn().mockResolvedValue({ ...department, isActive: false })
    const findFirst = vi.fn().mockResolvedValue({ ...department, isActive: false })
    const db = { department: { findUnique, findFirst } }

    await expect(resolveDepartment(db as never, reference, {
      allowInactiveDepartmentId: department.id,
    })).resolves.toMatchObject({ id: department.id, isActive: false })
    expect(method === 'findUnique' ? findUnique : findFirst).toHaveBeenCalledTimes(1)
  })

  it('rejects assigning a different inactive department through a legacy name', async () => {
    const db = {
      department: {
        findFirst: vi.fn().mockResolvedValue({ ...department, id: 'department-other', isActive: false }),
      },
    }

    await expect(resolveDepartment(db as never, { department: 'закрытый отдел' }, {
      allowInactiveDepartmentId: department.id,
    })).rejects.toMatchObject({ code: 'INACTIVE_DEPARTMENT' })
  })
})
