export type AssetInventoryErrorCode =
  | 'MOL_NOT_FOUND'
  | 'FORBIDDEN'
  | 'EMPTY_INVENTORY'
  | 'INVENTORY_TOO_LARGE'
  | 'INVENTORY_NOT_FOUND'
  | 'INVENTORY_COMPLETED'
  | 'ASSET_NOT_IN_INVENTORY'

export class AssetInventoryError extends Error {
  constructor(public readonly code: AssetInventoryErrorCode) {
    super(code)
    this.name = 'AssetInventoryError'
  }
}
