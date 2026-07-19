import { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { getProcurementService } from '@/features/procurement/application/procurement.service'
import { procurementApiError } from '@/features/procurement/application/http'
import { deliverySchema } from '@/features/procurement/contracts/procurement'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'procurement.deliver')
  if (auth.response) return auth.response
  const input = deliverySchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(
      await getProcurementService().createDelivery(
        (await context.params).id,
        input.data,
        auth.user.id,
        auth.requestId,
      ),
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('DELIVERY_NUMBER_EXISTS', 'Номер поставки уже используется для договора', 409)
    }
    return procurementApiError(error)
  }
}
