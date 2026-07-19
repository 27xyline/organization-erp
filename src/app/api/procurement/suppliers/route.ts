import { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { getProcurementService } from '@/features/procurement/application/procurement.service'
import { supplierSchema } from '@/features/procurement/contracts/procurement'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'procurement.suppliers.manage')
  if (auth.response) return auth.response
  const input = supplierSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(
      await getProcurementService().createSupplier(input.data, auth.user.id, auth.requestId),
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('SUPPLIER_TAX_ID_EXISTS', 'Поставщик с таким ИНН уже существует', 409)
    }
    throw error
  }
}
