import { describe, expect, it } from 'vitest'
import { globalSearchQuerySchema } from './search'

describe('globalSearchQuerySchema', () => {
  it('trims a search query and allows between 2 and 100 characters', () => {
    expect(globalSearchQuerySchema.parse({ q: '  INV-7  ' })).toEqual({ q: 'INV-7' })
    expect(globalSearchQuerySchema.safeParse({ q: 'a' }).success).toBe(false)
    expect(globalSearchQuerySchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false)
  })
})
