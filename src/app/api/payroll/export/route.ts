import ExcelJS from 'exceljs'
import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { payrollQuerySchema } from '@/features/finance/contracts/payroll'
import { PayrollService } from '@/features/finance/application/payroll.service'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'payroll.export')
  if (auth.response) return auth.response
  const query = payrollQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)
  const report = await PayrollService.getMonth(query.data, auth.access)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Consilium'
  const sheet = workbook.addWorksheet('Платёжная ведомость', {
    views: [{ state: 'frozen', ySplit: 3 }],
  })
  sheet.addRow(['Платёжная ведомость'])
  sheet.addRow([`${String(query.data.month).padStart(2, '0')}.${query.data.year}`])
  sheet.addRow([
    'Табельный номер',
    'Сотрудник',
    'Подразделение',
    'Должность',
    'Ставка',
    'План',
    'Начислено',
    'НДФЛ',
    'К выплате',
    'Взносы работодателя',
    'Стоимость работодателя',
    'Отклонение',
  ])
  for (const row of report.rows) {
    sheet.addRow([
      row.code,
      row.fullName,
      row.department,
      row.position,
      row.rate,
      row.plannedGross,
      row.gross,
      row.tax,
      row.payable,
      row.contributions,
      row.employerCost,
      row.variance,
    ])
  }
  sheet.getRow(1).font = { bold: true, size: 16 }
  sheet.getRow(3).font = { bold: true }
  sheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
  sheet.columns = [
    { width: 16 }, { width: 34 }, { width: 24 }, { width: 28 }, { width: 10 },
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 22 },
    { width: 22 }, { width: 16 },
  ]
  for (let column = 6; column <= 12; column += 1) {
    sheet.getColumn(column).numFmt = '#,##0.00 [$₽-ru-RU]'
  }
  sheet.autoFilter = { from: 'A3', to: 'L3' }
  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `payroll-${query.data.year}-${String(query.data.month).padStart(2, '0')}.xlsx`
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  })
}
