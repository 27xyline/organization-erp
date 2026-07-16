'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDecimal } from '@/lib/utils'
import { emptyCell, monthLabels, stickyColumnStyles } from './config'
import { FinanceMonthCell, FinancePlanRow } from '@/features/finance/contracts/ui-types'

interface FinancePlanTableProps {
  loading: boolean
  rows: FinancePlanRow[]
  totalRate: number
  totalSalary: number
  monthTotals: Record<string, string>
  editable: boolean
  onCellClick: (row: FinancePlanRow, month: number) => void
}

const renderCellValue = (cell: FinanceMonthCell) => {
  const amount = Number(cell.amount)
  const hasValue = amount > 0

  if (!hasValue) {
    return <span className="text-muted-foreground">—</span>
  }

  return (
    <div className="min-w-[110px] text-right">
      <div className="text-sm font-medium text-slate-800">{formatCurrency(cell.amount)}</div>
    </div>
  )
}

export function FinancePlanTable({
  loading,
  rows,
  totalRate,
  totalSalary,
  monthTotals,
  editable,
  onCellClick,
}: FinancePlanTableProps) {
  return (
    <div className="rounded-xl border">
      <Table className="w-[2540px] min-w-[2540px] table-fixed border-separate border-spacing-0">
        <TableHeader className="bg-slate-50/80">
          <TableRow>
            <TableHead className="sticky left-0 z-30 box-border border-r bg-slate-50" style={{ width: stickyColumnStyles.fullName.width, minWidth: stickyColumnStyles.fullName.width, maxWidth: stickyColumnStyles.fullName.width }}>
              ФИО
            </TableHead>
            <TableHead className="sticky z-30 box-border border-r bg-slate-50" style={{ left: stickyColumnStyles.department.left, width: stickyColumnStyles.department.width, minWidth: stickyColumnStyles.department.width, maxWidth: stickyColumnStyles.department.width }}>
              Подразделение
            </TableHead>
            <TableHead className="sticky z-30 box-border border-r bg-slate-50" style={{ left: stickyColumnStyles.position.left, width: stickyColumnStyles.position.width, minWidth: stickyColumnStyles.position.width, maxWidth: stickyColumnStyles.position.width }}>
              Должность
            </TableHead>
            <TableHead className="sticky z-30 box-border border-r bg-slate-50" style={{ left: stickyColumnStyles.rate.left, width: stickyColumnStyles.rate.width, minWidth: stickyColumnStyles.rate.width, maxWidth: stickyColumnStyles.rate.width }}>
              Доля ставки
            </TableHead>
            <TableHead className="sticky z-30 box-border border-r bg-slate-50 shadow-[1px_0_0_0_rgba(203,213,225,1)]" style={{ left: stickyColumnStyles.salary.left, width: stickyColumnStyles.salary.width, minWidth: stickyColumnStyles.salary.width, maxWidth: stickyColumnStyles.salary.width }}>
              Оклад
            </TableHead>
            {monthLabels.map((month) => (
              <TableHead key={month} className="min-w-[140px] text-center" style={{ width: 140 }}>
                {month}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                {Array.from({ length: 17 }).map((_, j) => (
                  <TableCell key={`cell-${i}-${j}`}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={17} className="h-32 text-center text-muted-foreground">
                Нет сотрудников для отображения.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.employeeId} className="group">
                <TableCell className="sticky left-0 z-20 box-border border-r bg-white font-medium text-slate-900 group-hover:bg-white" style={{ width: stickyColumnStyles.fullName.width, minWidth: stickyColumnStyles.fullName.width, maxWidth: stickyColumnStyles.fullName.width }}>
                  {row.fullName}
                </TableCell>
                <TableCell className="sticky z-20 box-border border-r bg-white group-hover:bg-white" style={{ left: stickyColumnStyles.department.left, width: stickyColumnStyles.department.width, minWidth: stickyColumnStyles.department.width, maxWidth: stickyColumnStyles.department.width }}>
                  {row.department}
                </TableCell>
                <TableCell className="sticky z-20 box-border border-r bg-white group-hover:bg-white" style={{ left: stickyColumnStyles.position.left, width: stickyColumnStyles.position.width, minWidth: stickyColumnStyles.position.width, maxWidth: stickyColumnStyles.position.width }}>
                  {row.position}
                </TableCell>
                <TableCell className="sticky z-20 box-border border-r bg-white group-hover:bg-white" style={{ left: stickyColumnStyles.rate.left, width: stickyColumnStyles.rate.width, minWidth: stickyColumnStyles.rate.width, maxWidth: stickyColumnStyles.rate.width }}>
                  {formatDecimal(row.rate)}
                </TableCell>
                <TableCell className="sticky z-20 box-border border-r bg-white shadow-[1px_0_0_0_rgba(203,213,225,1)] group-hover:bg-white" style={{ left: stickyColumnStyles.salary.left, width: stickyColumnStyles.salary.width, minWidth: stickyColumnStyles.salary.width, maxWidth: stickyColumnStyles.salary.width }}>
                  {formatCurrency(row.salary)}
                </TableCell>
                {monthLabels.map((_, index) => {
                  const month = String(index + 1)
                  const cell = row.months[month] || emptyCell()

                  return (
                    <TableCell key={`${row.employeeId}-${month}`}>
                      {editable ? (
                        <button
                          type="button"
                          onClick={() => onCellClick(row, index + 1)}
                          className="flex min-h-[52px] w-full min-w-[110px] flex-col items-end justify-center rounded-md border px-3 py-2 text-right transition-colors hover:bg-slate-50"
                        >
                          {renderCellValue(cell)}
                        </button>
                      ) : Number(cell.amount) > 0 ? (
                        <button
                          type="button"
                          onClick={() => onCellClick(row, index + 1)}
                          className="flex min-h-[52px] w-full min-w-[110px] flex-col items-end justify-center rounded-md border px-3 py-2 text-right transition-colors hover:bg-slate-50"
                        >
                          {renderCellValue(cell)}
                        </button>
                      ) : (
                        renderCellValue(cell)
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))
          )}

          {!loading && rows.length > 0 && (
            <TableRow className="bg-slate-50/90 hover:bg-slate-50/90">
              <TableCell className="sticky left-0 z-20 box-border border-r bg-slate-50 font-semibold text-slate-900" style={{ width: stickyColumnStyles.fullName.width, minWidth: stickyColumnStyles.fullName.width, maxWidth: stickyColumnStyles.fullName.width }}>
                Итого
              </TableCell>
              <TableCell className="sticky z-20 box-border border-r bg-slate-50 text-muted-foreground" style={{ left: stickyColumnStyles.department.left, width: stickyColumnStyles.department.width, minWidth: stickyColumnStyles.department.width, maxWidth: stickyColumnStyles.department.width }}>
                —
              </TableCell>
              <TableCell className="sticky z-20 box-border border-r bg-slate-50 text-muted-foreground" style={{ left: stickyColumnStyles.position.left, width: stickyColumnStyles.position.width, minWidth: stickyColumnStyles.position.width, maxWidth: stickyColumnStyles.position.width }}>
                —
              </TableCell>
              <TableCell className="sticky z-20 box-border border-r bg-slate-50 font-semibold" style={{ left: stickyColumnStyles.rate.left, width: stickyColumnStyles.rate.width, minWidth: stickyColumnStyles.rate.width, maxWidth: stickyColumnStyles.rate.width }}>
                {formatDecimal(totalRate)}
              </TableCell>
              <TableCell className="sticky z-20 box-border border-r bg-slate-50 shadow-[1px_0_0_0_rgba(203,213,225,1)] font-semibold" style={{ left: stickyColumnStyles.salary.left, width: stickyColumnStyles.salary.width, minWidth: stickyColumnStyles.salary.width, maxWidth: stickyColumnStyles.salary.width }}>
                {formatCurrency(totalSalary)}
              </TableCell>
              {monthLabels.map((_, index) => {
                const month = String(index + 1)

                return (
                  <TableCell key={`total-${month}`} className="text-right font-semibold text-slate-800">
                    {formatCurrency(monthTotals[month])}
                  </TableCell>
                )
              })}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
