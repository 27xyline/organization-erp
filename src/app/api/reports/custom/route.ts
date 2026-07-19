import { NextRequest, NextResponse } from 'next/server'
import { ReportService } from '@/features/reporting/application/report.service'
import { reportPresetSchema } from '@/features/reporting/contracts/report-presets'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { z } from 'zod'

const querySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departmentId: z.string().optional(),
  projectId: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'reports.read')
  if (auth.response) return auth.response

  try {
    const body = await request.json()
    const presetParsed = reportPresetSchema.safeParse(body.preset)
    if (!presetParsed.success) return apiValidationError(presetParsed.error)

    const queryParsed = querySchema.safeParse(body.query)
    if (!queryParsed.success) return apiValidationError(queryParsed.error)

    const dateFrom = new Date(`${queryParsed.data.dateFrom}T00:00:00.000Z`)
    const dateTo = new Date(`${queryParsed.data.dateTo}T23:59:59.999Z`)

    const data = await ReportService.getCustomReport(
      presetParsed.data,
      dateFrom,
      dateTo,
      queryParsed.data.departmentId,
      queryParsed.data.projectId
    )

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
}
