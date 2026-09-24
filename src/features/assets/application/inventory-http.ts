import { AssetInventoryError } from '../domain/asset-inventory-error'
import { apiError } from '@/lib/http/api-response'

const inventoryErrorResponses: Record<AssetInventoryError['code'], { status: number; message: string }> = {
  MOL_NOT_FOUND: { status: 404, message: 'МОЛ не найден или недоступен' },
  FORBIDDEN: { status: 403, message: 'Недостаточно прав для этой инвентаризации' },
  EMPTY_INVENTORY: { status: 422, message: 'В выбранном месте нет имущества для инвентаризации' },
  INVENTORY_TOO_LARGE: { status: 422, message: 'Разделите проверку: в одной ведомости не более 5 000 позиций' },
  INVENTORY_NOT_FOUND: { status: 404, message: 'Инвентаризация не найдена' },
  INVENTORY_COMPLETED: { status: 409, message: 'Инвентаризация уже завершена' },
  ASSET_NOT_IN_INVENTORY: { status: 404, message: 'Позиция не входит в эту инвентаризацию' },
}

export function assetInventoryApiError(error: unknown) {
  if (!(error instanceof AssetInventoryError)) return null
  const response = inventoryErrorResponses[error.code]
  return apiError(error.code, response.message, response.status)
}
