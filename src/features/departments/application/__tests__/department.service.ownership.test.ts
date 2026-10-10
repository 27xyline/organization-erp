import { describe, expect, it } from 'vitest'
import { DepartmentService } from '../department.service'

describe('department TypeScript service ownership', () => {
  it('keeps only read access after mutations move to FastAPI', () => {
    expect(DepartmentService).toHaveProperty('list')
    expect(DepartmentService).toHaveProperty('listHeadCandidates')
    expect(DepartmentService).not.toHaveProperty('create')
    expect(DepartmentService).not.toHaveProperty('update')
    expect(DepartmentService).not.toHaveProperty('delete')
  })
})
