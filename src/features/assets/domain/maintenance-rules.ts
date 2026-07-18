import { AssetMaintenanceStatus } from '@prisma/client'

export class MaintenanceTransitionError extends Error {
  constructor() {
    super('INVALID_MAINTENANCE_TRANSITION')
  }
}

const allowed: Record<AssetMaintenanceStatus, readonly AssetMaintenanceStatus[]> = {
  PLANNED: [AssetMaintenanceStatus.PLANNED, AssetMaintenanceStatus.IN_PROGRESS, AssetMaintenanceStatus.CANCELED],
  IN_PROGRESS: [AssetMaintenanceStatus.IN_PROGRESS, AssetMaintenanceStatus.COMPLETED, AssetMaintenanceStatus.CANCELED],
  COMPLETED: [AssetMaintenanceStatus.COMPLETED],
  CANCELED: [AssetMaintenanceStatus.CANCELED],
}

export function ensureMaintenanceTransition(
  from: AssetMaintenanceStatus,
  to: AssetMaintenanceStatus,
) {
  if (!allowed[from].includes(to)) throw new MaintenanceTransitionError()
}
