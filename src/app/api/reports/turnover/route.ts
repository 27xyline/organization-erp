import { NextRequest, NextResponse } from 'next/server'
import { ReportService } from '@/features/reporting/application/report.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { z } from 'zod'

const querySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departmentId: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, {
    allOf: ['reports.read', 'employees.read', 'personnelActions.read'],
  })
  if (auth.response) return auth.response

  const searchParams = Object.fromEntries(request.nextUrl.searchParams)
  const query = querySchema.safeParse(searchParams)
  if (!query.success) return apiValidationError(query.error)

  const dateFrom = new Date(`${query.data.dateFrom}T00:00:00.000Z`)
  const dateTo = new Date(`${query.data.dateTo}T23:59:59.999Z`)

  const data = await ReportService.getTurnoverReport(
    dateFrom,
    dateTo,
    query.data.departmentId,
    auth.access,
  )

  return NextResponse.json(data)
}
