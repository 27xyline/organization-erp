export interface LegacyAssetDateInput {
  recordingDate?: string
  plannedDisposalDate?: string | null
}

/** Preserve legacy JavaScript Date coercion at the BFF boundary, without adding business validation. */
export function normalizeLegacyAssetDates<T extends LegacyAssetDateInput>(input: T): T {
  const normalized = { ...input }
  if (typeof input.recordingDate === 'string') {
    normalized.recordingDate = normalizeValidDate(input.recordingDate)
  }
  if (input.plannedDisposalDate === '') {
    normalized.plannedDisposalDate = null
  } else if (typeof input.plannedDisposalDate === 'string') {
    normalized.plannedDisposalDate = normalizeValidDate(input.plannedDisposalDate)
  }
  return normalized
}

function normalizeValidDate(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}
