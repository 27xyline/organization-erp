import { NextRequest, NextResponse } from 'next/server'
import { ReportService } from '@/features/reporting/application/report.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { z } from 'zod'

const querySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  projectId: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'reports.read')
  if (auth.response) return auth.response

  const searchParams = Object.fromEntries(request.nextUrl.searchParams)
  const query = querySchema.safeParse(searchParams)
  if (!query.success) return apiValidationError(query.error)

  const dateFrom = new Date(`${query.data.dateFrom}T00:00:00.000Z`)
  const dateTo = new Date(`${query.data.dateTo}T23:59:59.999Z`)

  const data = await ReportService.getProjectProfitability(
    dateFrom,
    dateTo,
    query.data.projectId
  )

  return NextResponse.json(data)
}
