import { describe, expect, it } from 'vitest'
import { normalizeLegacyAssetDates } from './legacy-date-transport'

describe('legacy asset date transport', () => {
  it('normalizes valid non-ISO JavaScript dates and ISO timezone instants', () => {
    expect(normalizeLegacyAssetDates({
      recordingDate: '10/01/2026', plannedDisposalDate: '2026-07-16T03:30:00+03:00',
    })).toEqual({ recordingDate: new Date('10/01/2026').toISOString(), plannedDisposalDate: '2026-07-16T00:30:00.000Z' })
  })

  it('leaves invalid legacy strings for Python to preserve the legacy 500 response', () => {
    expect(normalizeLegacyAssetDates({
      recordingDate: 'not-a-date', plannedDisposalDate: 'not-a-date',
    })).toEqual({ recordingDate: 'not-a-date', plannedDisposalDate: 'not-a-date' })
  })

  it('maps empty planned disposal dates to null and keeps omitted or explicit null values', () => {
    expect(normalizeLegacyAssetDates({ recordingDate: '2026-07-16', plannedDisposalDate: '' }))
      .toEqual({ recordingDate: '2026-07-16T00:00:00.000Z', plannedDisposalDate: null })
    expect(normalizeLegacyAssetDates({ recordingDate: '2026-07-16', plannedDisposalDate: null }))
      .toEqual({ recordingDate: '2026-07-16T00:00:00.000Z', plannedDisposalDate: null })
    expect(normalizeLegacyAssetDates({ recordingDate: '2026-07-16' }))
      .toEqual({ recordingDate: '2026-07-16T00:00:00.000Z' })
  })
})
