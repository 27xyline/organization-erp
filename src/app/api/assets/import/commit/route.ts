import { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { AssetImportService } from '@/features/assets/application/asset-import.service'
import { AssetService } from '@/features/assets/application/asset.service'
import { assetImportCommitSchema } from '@/features/assets/contracts/asset-import'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.create')
  if (auth.response) return auth.response

  const payload = await request.json().catch(() => null)
  const input = assetImportCommitSchema.safeParse(payload)
  if (!input.success) return apiValidationError(input.error)

  const validationErrors = await AssetImportService.validateCommit(input.data.assets, auth.access)
  if (validationErrors.size) {
    return apiError(
      'ASSET_IMPORT_REVIEW_REQUIRED',
      'Данные изменились или обнаружена ошибка. Загрузите файл заново и проверьте предварительный просмотр',
      409,
      Object.fromEntries(Array.from(validationErrors, ([row, errors]) => [`строка ${row}`, errors])),
    )
  }

  try {
    const importedCount = await AssetService.createMany(input.data.assets, auth.user.id, auth.requestId)
    return apiData({
      importedCount,
      inventoryNumbers: input.data.assets.map((asset) => asset.inventoryNumber),
    }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError(
        'INVENTORY_NUMBER_EXISTS',
        'Инвентарный номер успели зарегистрировать после проверки. Загрузите файл и повторите предварительный просмотр',
        409,
      )
    }
    throw error
  }
}
