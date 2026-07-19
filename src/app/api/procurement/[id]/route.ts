import type { NextRequest } from 'next/server'
import { getProcurementService } from '@/features/procurement/application/procurement.service'
import { procurementApiError } from '@/features/procurement/application/http'
import { updateProcurementSchema } from '@/features/procurement/contracts/procurement'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'procurement.read')
  if (auth.response) return auth.response
  try {
    return apiData(await getProcurementService().get((await context.params).id))
  } catch (error) {
    return procurementApiError(error)
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'procurement.update')
  if (auth.response) return auth.response
  const input = updateProcurementSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(
      await getProcurementService().update(
        (await context.params).id,
        input.data,
        auth.user.id,
        auth.requestId,
      ),
    )
  } catch (error) {
    return procurementApiError(error)
  }
}
