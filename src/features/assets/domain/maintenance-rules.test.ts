import { AssetMaintenanceStatus } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { ensureMaintenanceTransition, MaintenanceTransitionError } from './maintenance-rules'

describe('maintenance transitions', () => {
  it('supports the normal lifecycle', () => {
    expect(() => ensureMaintenanceTransition(
      AssetMaintenanceStatus.PLANNED,
      AssetMaintenanceStatus.IN_PROGRESS,
    )).not.toThrow()
    expect(() => ensureMaintenanceTransition(
      AssetMaintenanceStatus.IN_PROGRESS,
      AssetMaintenanceStatus.COMPLETED,
    )).not.toThrow()
  })

  it('keeps terminal records immutable', () => {
    expect(() => ensureMaintenanceTransition(
      AssetMaintenanceStatus.COMPLETED,
      AssetMaintenanceStatus.IN_PROGRESS,
    )).toThrow(MaintenanceTransitionError)
  })
})
