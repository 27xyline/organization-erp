import ExcelJS from 'exceljs'
import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError, apiError } from '@/lib/http/api-response'
import { PayrollService } from '@/features/finance/application/payroll.service'
import { z } from 'zod'

const payslipQuerySchema = z.object({
  year: z.coerce.number().int().positive(),
  month: z.coerce.number().int().min(1).max(12),
  employeeId: z.string().min(1),
})

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'payroll.export')
  if (auth.response) return auth.response

  const params = Object.fromEntries(request.nextUrl.searchParams)
  const query = payslipQuerySchema.safeParse(params)
  if (!query.success) return apiValidationError(query.error)

  const { year, month, employeeId } = query.data
  const report = await PayrollService.getMonth({ year, month }, auth.access)
  const row = report.rows.find((r) => r.employeeId === employeeId)

  if (!row) {
    return apiError('NOT_FOUND', 'Сотрудник не найден в расчетной ведомости за этот месяц', 404)
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Consilium'
  const sheet = workbook.addWorksheet('Расчетный лист')

  sheet.addRow(['РАСЧЕТНЫЙ ЛИСТ'])
  sheet.addRow([`За период: ${String(month).padStart(2, '0')}.${year}`])
  sheet.addRow([])

  sheet.addRow(['Табельный номер:', row.code])
  sheet.addRow(['Сотрудник:', row.fullName])
  sheet.addRow(['Подразделение:', row.department])
  sheet.addRow(['Должность:', row.position])
  sheet.addRow(['Ставка:', row.rate])
  sheet.addRow([])

  sheet.addRow(['Вид начисления/удержания', 'План', 'Факт'])
  sheet.addRow(['Оклад', row.plannedGross, row.actualBase])
  sheet.addRow(['Надбавки', 0, row.allowance])
  sheet.addRow(['Премии', 0, row.bonus + row.oneTime])
  sheet.addRow(['Удержания (НДФЛ)', 0, -row.tax])
  sheet.addRow(['Прочие удержания', 0, -row.deduction])
  sheet.addRow([])

  sheet.addRow(['Всего начислено:', '', row.gross])
  sheet.addRow(['НДФЛ удержан:', '', -row.tax])
  sheet.addRow(['К выплате на руки:', '', row.payable])
  sheet.addRow(['Взносы ПФР/ФОМС/ФСС:', '', row.contributions])
  sheet.addRow([])

  // Styling
  sheet.getRow(1).font = { bold: true, size: 14 }
  sheet.getRow(10).font = { bold: true }
  sheet.getRow(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }

  sheet.getColumn(1).width = 30
  sheet.getColumn(2).width = 15
  sheet.getColumn(3).width = 15

  // Format currency fields for values in rows 11 to 20
  for (let r = 11; r <= 20; r++) {
    const rowObj = sheet.getRow(r)
    rowObj.getCell(2).numFmt = '#,##0.00 [$₽-ru-RU]'
    rowObj.getCell(3).numFmt = '#,##0.00 [$₽-ru-RU]'
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `payslip-${row.code}-${year}-${String(month).padStart(2, '0')}.xlsx`
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  })
}
