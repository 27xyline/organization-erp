import { apiError } from '@/lib/http/api-response'
import { AssetLifecycleError } from './asset-lifecycle.service'

export function assetLifecycleApiError(error: unknown) {
  if (!(error instanceof AssetLifecycleError)) throw error
  if (error.code === 'ASSET_NOT_FOUND' || error.code === 'MAINTENANCE_NOT_FOUND') {
    return apiError(error.code, 'Запись не найдена', 404)
  }
  if (error.code === 'ASSET_UNAVAILABLE') {
    return apiError(error.code, 'Архивный или списанный объект нельзя обслуживать', 409)
  }
  return apiError(error.code, 'Недопустимый переход статуса обслуживания', 409)
}
