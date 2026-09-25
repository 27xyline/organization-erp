import { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getProcurementService } from '@/features/procurement/application/procurement.service'
import { procurementApiError } from '@/features/procurement/application/http'
import { createProcurementSchema, procurementQuerySchema } from '@/features/procurement/contracts/procurement'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'procurement.read')
  if (auth.response) return auth.response
  const query = procurementQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)
  const result = await getProcurementService().list(query.data)
  return NextResponse.json({
    data: result.requests,
    pagination: {
      page: query.data.page,
      pageSize: query.data.pageSize,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / query.data.pageSize)),
    },
    summary: result.summary,
  })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'procurement.create')
  if (auth.response) return auth.response
  const input = createProcurementSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(
      await getProcurementService().create(input.data, auth.user.id, auth.requestId),
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('PROCUREMENT_NUMBER_EXISTS', 'Номер заявки уже используется', 409)
    }
    return procurementApiError(error)
  }
}
