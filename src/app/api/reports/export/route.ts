import ExcelJS from 'exceljs'
import type { NextRequest } from 'next/server'
import { DashboardService } from '@/features/reporting/application/dashboard.service'
import { dashboardQuerySchema } from '@/features/reporting/contracts/dashboard'
import {
  ASSET_STATUS_LABELS,
  VACATION_TYPE_LABELS,
} from '@/features/reporting/contracts/labels'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { getDb } from '@/lib/prisma'

function styleSheet(sheet: ExcelJS.Worksheet, headerRow = 1) {
  sheet.views = [{ state: 'frozen', ySplit: headerRow }]
  const header = sheet.getRow(headerRow)
  header.font = { bold: true, color: { argb: 'FF0F172A' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
  header.alignment = { vertical: 'middle' }
  sheet.columns.forEach((column) => {
    column.width = Math.max(14, Math.min(38, column.header?.toString().length || 14))
  })
}

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'reports.export')
  if (auth.response) return auth.response
  const query = dashboardQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)

  const data = await DashboardService.getOverview(query.data, auth.access)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Consilium'
  workbook.created = new Date()

  const summary = workbook.addWorksheet('Сводка')
  summary.columns = [{ header: 'Показатель', key: 'metric' }, { header: 'Значение', key: 'value' }]
  summary.addRows([
    { metric: 'Период', value: `${query.data.dateFrom} — ${query.data.dateTo}` },
    { metric: 'Сотрудников', value: data.summary.headcount },
    { metric: 'Занято ставок', value: data.summary.occupiedRate },
    { metric: 'Занятость штата, %', value: data.summary.occupancy },
    { metric: 'Активных проектов', value: data.summary.count },
    { metric: 'Средний прогресс, %', value: data.summary.averageProgress },
    { metric: 'Плановый бюджет', value: data.summary.plannedBudget },
    { metric: 'Фактический бюджет', value: data.summary.actualBudget },
    { metric: 'Стоимость имущества', value: data.summary.assetValue },
    { metric: 'Просроченных задач', value: data.summary.overdueTasks },
  ])
  styleSheet(summary)
  summary.getColumn(2).numFmt = '#,##0.00'
  summary.getColumn(1).width = 30
  summary.getColumn(2).width = 24

  const workforce = workbook.addWorksheet('Сотрудники и ФОТ')
  workforce.columns = [
    { header: 'Подразделение', key: 'department', width: 30 },
    { header: 'Сотрудников', key: 'headcount', width: 14 },
    { header: 'Активных', key: 'active', width: 14 },
    { header: 'Занято ставок', key: 'occupiedRate', width: 16 },
    { header: 'Штатных ставок', key: 'staffRate', width: 16 },
    { header: 'Занятость, %', key: 'occupancy', width: 16 },
    { header: 'Плановый ФОТ', key: 'plannedFot', width: 20 },
    { header: 'Фактический ФОТ', key: 'actualFot', width: 20 },
  ]
  workforce.addRows(data.analytics.workforceByDepartment)
  styleSheet(workforce)
  workforce.getColumn('plannedFot').numFmt = '#,##0.00'
  workforce.getColumn('actualFot').numFmt = '#,##0.00'

  const projects = workbook.addWorksheet('Проекты')
  projects.columns = [
    { header: 'Код', key: 'code', width: 16 },
    { header: 'Наименование', key: 'name', width: 38 },
    { header: 'Окончание', key: 'endDate', width: 16 },
    { header: 'Прогресс, %', key: 'progress', width: 16 },
    { header: 'Задач', key: 'tasksTotal', width: 12 },
    { header: 'Выполнено', key: 'tasksCompleted', width: 14 },
    { header: 'Плановый бюджет', key: 'plannedBudget', width: 20 },
    { header: 'Фактический бюджет', key: 'actualBudget', width: 20 },
    { header: 'Отклонение', key: 'variance', width: 20 },
  ]
  projects.addRows(data.analytics.projects.map((project) => ({
    ...project,
    endDate: project.endDate || '',
    variance: project.actualBudget - project.plannedBudget,
  })))
  styleSheet(projects)
  projects.getColumn('endDate').numFmt = 'dd.mm.yyyy'
  for (const key of ['plannedBudget', 'actualBudget', 'variance']) {
    projects.getColumn(key).numFmt = '#,##0.00'
  }

  const assets = workbook.addWorksheet('Имущество')
  assets.columns = [
    { header: 'Статус', key: 'status', width: 28 },
    { header: 'Количество', key: 'count', width: 14 },
    { header: 'Стоимость', key: 'value', width: 22 },
  ]
  assets.addRows(data.analytics.assetsByStatus.map((row) => ({
    ...row,
    status: ASSET_STATUS_LABELS[row.status] || row.status,
  })))
  styleSheet(assets)
  assets.getColumn('value').numFmt = '#,##0.00'

  const vacations = workbook.addWorksheet('Отпуска')
  vacations.columns = [
    { header: 'Сотрудник', key: 'employee', width: 34 },
    { header: 'Подразделение', key: 'department', width: 30 },
    { header: 'Тип', key: 'type', width: 22 },
    { header: 'Начало', key: 'startDate', width: 16 },
    { header: 'Окончание', key: 'endDate', width: 16 },
  ]
  vacations.addRows(data.analytics.vacations.map((vacation) => ({
    ...vacation,
    type: VACATION_TYPE_LABELS[vacation.type] || vacation.type,
  })))
  styleSheet(vacations)
  vacations.getColumn('startDate').numFmt = 'dd.mm.yyyy'
  vacations.getColumn('endDate').numFmt = 'dd.mm.yyyy'

  const risks = workbook.addWorksheet('Контроль сроков')
  risks.columns = [
    { header: 'Категория', key: 'category', width: 22 },
    { header: 'Объект', key: 'name', width: 38 },
    { header: 'Контекст', key: 'context', width: 32 },
    { header: 'Срок / статус', key: 'status', width: 24 },
  ]
  risks.addRows([
    ...data.overdueTasks.map((task) => ({
      category: 'Просроченная задача',
      name: task.name,
      context: `${task.project.code} · ${task.responsible}`,
      status: `${task.overdueDays} дн.`,
    })),
    ...data.contracts.map((contract) => ({
      category: 'Трудовой договор',
      name: contract.employee,
      context: contract.department,
      status: contract.contractEndDate,
    })),
    ...data.assetAttention.map((asset) => ({
      category: 'Имущество',
      name: asset.name,
      context: asset.inventoryNumber,
      status: ASSET_STATUS_LABELS[asset.status] || asset.status,
    })),
  ])
  styleSheet(risks)

  const buffer = await workbook.xlsx.writeBuffer()
  await getDb().auditLog.create({
    data: {
      userId: auth.user.id,
      requestId: auth.requestId,
      action: 'REPORT_EXPORT',
      entityType: 'Reporting',
      entityId: `${query.data.dateFrom}:${query.data.dateTo}`,
      details: {
        format: 'XLSX',
        departmentId: query.data.departmentId || null,
        projectId: query.data.projectId || null,
      },
    },
  })

  return new Response(buffer as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="consilium-report-${query.data.dateFrom}-${query.data.dateTo}.xlsx"`,
      'cache-control': 'no-store',
    },
  })
}
