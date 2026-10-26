import { describe, expect, it } from 'vitest'
import { calculateCriticalPath } from '../critical-path'

describe('calculateCriticalPath', () => {
  it('returns the longest dependency chain', () => {
    expect(calculateCriticalPath([
      { id: 'a', duration: 2 },
      { id: 'b', duration: 5 },
      { id: 'c', duration: 2, predecessors: [{ predecessorId: 'a' }] },
      { id: 'd', duration: 1, predecessors: [{ predecessorId: 'b' }] },
    ])).toEqual(['b', 'd'])
  })

  it('returns an empty path for a cycle', () => {
    expect(calculateCriticalPath([
      { id: 'a', predecessors: [{ predecessorId: 'b' }] },
      { id: 'b', predecessors: [{ predecessorId: 'a' }] },
    ])).toEqual([])
  })
})
