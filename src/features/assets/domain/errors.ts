import { ServiceError } from '@/lib/errors/service-error'

export type AssetServiceErrorCode =
  | 'ASSET_NOT_FOUND'
  | 'ASSET_ARCHIVED'
  | 'HOLDING_NOT_FOUND'
  | 'INSUFFICIENT_QUANTITY'
  | 'MOL_NOT_FOUND'
  | 'QUANTITY_OPERATION_REQUIRED'
  | 'MOL_TRANSFER_REQUIRED'
  | 'FULLY_DISPOSED_RESTORE_FORBIDDEN'
  | 'CONCURRENT_UPDATE'

export class AssetServiceError extends ServiceError<AssetServiceErrorCode> {}
