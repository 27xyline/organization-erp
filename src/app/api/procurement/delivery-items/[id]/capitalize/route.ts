import { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { AssetService } from '@/features/assets/application/asset.service'
import { getProcurementService } from '@/features/procurement/application/procurement.service'
import { procurementApiError } from '@/features/procurement/application/http'
import { capitalizeDeliveryItemSchema } from '@/features/procurement/contracts/procurement'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'procurement.capitalize')
  if (auth.response) return auth.response
  const input = capitalizeDeliveryItemSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(
      await getProcurementService().capitalize(
        (await context.params).id,
        input.data,
        auth.user.id,
        auth.requestId,
        (assetInput) => AssetService.create(
          assetInput,
          auth.user.id,
          auth.requestId,
        ),
      ),
    )
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('INVENTORY_NUMBER_EXISTS', 'Инвентарный номер уже используется', 409)
    }
    return procurementApiError(error)
  }
}
