import { describe, expect, it } from 'vitest'
import { assetSavedViewFiltersSchema, createAssetSavedViewSchema } from './saved-view'

describe('asset saved view schemas', () => {
  it('keeps only supported filters and normalizes empty search', () => {
    expect(createAssetSavedViewSchema.parse({
      name: '  На ремонте  ',
      filters: { search: '  ', status: 'UNDER_REPAIR' },
    })).toEqual({
      name: 'На ремонте',
      filters: { search: undefined, status: 'UNDER_REPAIR' },
    })
  })

  it('rejects query controls and unknown filters from saved JSON', () => {
    expect(assetSavedViewFiltersSchema.safeParse({ page: 10, archived: true }).success).toBe(false)
  })

  it('rejects a date range with the end before the start', () => {
    expect(assetSavedViewFiltersSchema.safeParse({
      dateFrom: '2026-09-10',
      dateTo: '2026-09-01',
    }).success).toBe(false)
  })
})
