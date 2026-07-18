import { describe, expect, it } from 'vitest'
import { ensureAcyclicDependencies, ensureValidTaskHierarchy } from '../task-rules'

describe('ensureValidTaskHierarchy', () => {
  it('accepts a root task at level one', () => {
    expect(() => ensureValidTaskHierarchy({ projectId: 'p1', level: 1, parent: null })).not.toThrow()
  })

  it('rejects a parent from another project', () => {
    expect(() => ensureValidTaskHierarchy({
      projectId: 'p1', level: 2, parentId: 't1', parent: { projectId: 'p2', level: 1 },
    })).toThrow(expect.objectContaining({ code: 'INVALID_HIERARCHY' }))
  })

  it('rejects nesting below level three', () => {
    expect(() => ensureValidTaskHierarchy({
      projectId: 'p1', level: 3, parentId: 't2', parent: { projectId: 'p1', level: 3 },
    })).toThrow(expect.objectContaining({ code: 'INVALID_HIERARCHY' }))
  })
})

describe('ensureAcyclicDependencies', () => {
  it('accepts an acyclic graph', () => {
    expect(() => ensureAcyclicDependencies(
      ['a', 'b', 'c'],
      [{ predecessorId: 'a', successorId: 'b' }, { predecessorId: 'b', successorId: 'c' }],
    )).not.toThrow()
  })

  it('rejects a cycle', () => {
    expect(() => ensureAcyclicDependencies(
      ['a', 'b'],
      [{ predecessorId: 'a', successorId: 'b' }, { predecessorId: 'b', successorId: 'a' }],
    )).toThrow(expect.objectContaining({ code: 'INVALID_DEPENDENCY' }))
  })
})
