import { ServiceError } from '@/lib/errors/service-error'

export type AssetTransactionErrorCode = 'CONCURRENT_UPDATE'

export class AssetTransactionError extends ServiceError<AssetTransactionErrorCode> {}
