import { NextRequest, NextResponse } from 'next/server'
import { ReportService } from '@/features/reporting/application/report.service'
import { reportPresetSchema } from '@/features/reporting/contracts/report-presets'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { z } from 'zod'
import type { Permission } from '@/lib/auth/permissions'

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

    if (!presetParsed.data.groupBy) {
      return NextResponse.json({
        error: { code: 'INVALID_GROUP', message: 'Выберите группировку отчёта' },
      }, { status: 400 })
    }

    const validMetrics = presetParsed.data.groupBy === 'department'
      ? new Set(['headcount', 'occupiedRate', 'plannedFot', 'assetValue'])
      : new Set(['projectBudget', 'actualFot', 'assetValue'])
    if (presetParsed.data.metrics.some((metric) => !validMetrics.has(metric))) {
      return NextResponse.json({
        error: { code: 'INVALID_METRIC', message: 'Показатель недоступен для выбранной группировки' },
      }, { status: 400 })
    }

    const requiredPermissions = new Set<Permission>([
      presetParsed.data.groupBy === 'department' ? 'departments.read' : 'projects.read',
    ])
    for (const metric of presetParsed.data.metrics) {
      if (metric === 'headcount' || metric === 'occupiedRate') requiredPermissions.add('employees.read')
      if (metric === 'plannedFot' || metric === 'actualFot') requiredPermissions.add('finance.salary.read')
      if (metric === 'assetValue') requiredPermissions.add('assets.read')
    }
    if ([...requiredPermissions].some((permission) => !auth.access.has(permission))) {
      return NextResponse.json({
        error: { code: 'FORBIDDEN', message: 'Недостаточно прав для выбранных показателей' },
      }, { status: 403 })
    }

    const dateFrom = new Date(`${queryParsed.data.dateFrom}T00:00:00.000Z`)
    const dateTo = new Date(`${queryParsed.data.dateTo}T23:59:59.999Z`)

    const data = await ReportService.getCustomReport(
      presetParsed.data,
      dateFrom,
      dateTo,
      queryParsed.data.departmentId,
      queryParsed.data.projectId,
      auth.access,
    )

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
}
