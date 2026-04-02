'use client'

import { useEffect, useMemo, useState } from 'react'
import { Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn, formatCurrency, formatDecimal } from '@/lib/utils'

interface FinancePlanRow {
  employeeId: string
  fullName: string
  department: string
  position: string
  rate: string
  salary: string
  months: Record<string, string>
}

type FinanceSectionType = 'salary' | 'oklad' | 'nadbavka'

const monthLabels = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

const stickyColumnStyles = {
  fullName: { left: 0, width: 240 },
  department: { left: 240, width: 180 },
  position: { left: 420, width: 180 },
  rate: { left: 600, width: 120 },
  salary: { left: 720, width: 140 },
} as const

const pageConfig: Record<FinanceSectionType, {
  title: string
  endpoint: (year: number) => string
  editable: boolean
  saveType?: 'oklad' | 'nadbavka'
  iconClassName: string
  summaryCardClassName: string
  badgeClassName: string
  modeLabel: string
}> = {
  salary: {
    title: 'Заработная плата',
    endpoint: (year) => `/api/finance/salary?year=${year}`,
    editable: false,
    iconClassName: 'bg-slate-100 text-slate-700',
    summaryCardClassName: 'border-slate-200 bg-slate-50/70',
    badgeClassName: 'border-slate-200 bg-slate-100 text-slate-700',
    modeLabel: 'Автоматический расчет',
  },
  oklad: {
    title: 'Оклад',
    endpoint: (year) => `/api/finance/plans?type=oklad&year=${year}`,
    editable: true,
    saveType: 'oklad',
    iconClassName: 'bg-blue-100 text-blue-700',
    summaryCardClassName: 'border-blue-200 bg-blue-50/70',
    badgeClassName: 'border-blue-200 bg-blue-100 text-blue-700',
    modeLabel: 'Редактируемый раздел',
  },
  nadbavka: {
    title: 'Надбавка',
    endpoint: (year) => `/api/finance/plans?type=nadbavka&year=${year}`,
    editable: true,
    saveType: 'nadbavka',
    iconClassName: 'bg-violet-100 text-violet-700',
    summaryCardClassName: 'border-violet-200 bg-violet-50/70',
    badgeClassName: 'border-violet-200 bg-violet-100 text-violet-700',
    modeLabel: 'Редактируемый раздел',
  },
}

const normalizeAmountInput = (value: string) => value.replace(',', '.')

const formatAmountValue = (value: string) => {
  const normalized = normalizeAmountInput(value).trim()

  if (!normalized) return '0.00'

  const numericValue = Number(normalized)

  if (Number.isNaN(numericValue)) return '0.00'

  return numericValue.toFixed(2)
}

const normalizeRowMonths = (months: Record<string, string>) => Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1)
    return [month, formatAmountValue(months[month])]
  })
)

const normalizeFinanceRows = (rows: FinancePlanRow[]) => rows.map((row) => ({
  ...row,
  months: normalizeRowMonths(row.months),
}))

const hasRowMonthChanges = (currentRow: FinancePlanRow, initialRow?: FinancePlanRow) => {
  if (!initialRow) return true

  for (let month = 1; month <= 12; month += 1) {
    const key = String(month)

    if (formatAmountValue(currentRow.months[key]) !== formatAmountValue(initialRow.months[key])) {
      return true
    }
  }

  return false
}

export function FinancePlanPage({ type }: { type: FinanceSectionType }) {
  const config = pageConfig[type]
  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const [rows, setRows] = useState<FinancePlanRow[]>([])
  const [initialRows, setInitialRows] = useState<FinancePlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadFinanceTable = async () => {
      try {
        setLoading(true)
        const response = await fetch(config.endpoint(currentYear))

        if (!response.ok) {
          throw new Error('Failed to fetch finance table')
        }

        const data = await response.json()
        setRows(data.rows)
        setInitialRows(data.rows)
      } catch (error) {
        console.error('Error loading finance table:', error)
      } finally {
        setLoading(false)
      }
    }

    loadFinanceTable()
  }, [config, currentYear])

  const initialRowsById = useMemo(
    () => new Map(initialRows.map((row) => [row.employeeId, row])),
    [initialRows]
  )

  const dirtyEmployeeIds = useMemo(
    () => rows.filter((row) => hasRowMonthChanges(row, initialRowsById.get(row.employeeId))).map((row) => row.employeeId),
    [rows, initialRowsById]
  )

  const dirtyEmployeeIdSet = useMemo(
    () => new Set(dirtyEmployeeIds),
    [dirtyEmployeeIds]
  )

  const hasChanges = useMemo(
    () => dirtyEmployeeIds.length > 0,
    [dirtyEmployeeIds]
  )

  const totalRate = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.rate), 0),
    [rows]
  )

  const totalSalary = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.salary), 0),
    [rows]
  )

  const monthTotals = useMemo(
    () => Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => {
        const month = String(index + 1)
        const total = rows.reduce((sum, row) => sum + Number(formatAmountValue(row.months[month])), 0)
        return [month, total.toFixed(2)]
      })
    ),
    [rows]
  )

  const handleAmountChange = (employeeId: string, month: number, value: string) => {
    if (!config.editable) return

    const normalized = value.replace(',', '.')

    if (!/^\d*(?:[.]\d{0,2})?$/.test(normalized)) {
      return
    }

    setRows((currentRows) => {
      const index = currentRows.findIndex((row) => row.employeeId === employeeId)
      if (index === -1) return currentRows

      const currentRow = currentRows[index]
      if (currentRow.months[String(month)] === normalized) return currentRows

      const nextRows = [...currentRows]
      nextRows[index] = {
        ...currentRow,
        months: {
          ...currentRow.months,
          [String(month)]: normalized,
        },
      }

      return nextRows
    })
  }

  const handleAmountBlur = (employeeId: string, month: number) => {
    if (!config.editable) return

    setRows((currentRows) => {
      const index = currentRows.findIndex((row) => row.employeeId === employeeId)
      if (index === -1) return currentRows

      const currentRow = currentRows[index]
      const normalizedValue = formatAmountValue(currentRow.months[String(month)])
      if (currentRow.months[String(month)] === normalizedValue) return currentRows

      const nextRows = [...currentRows]
      nextRows[index] = {
        ...currentRow,
        months: {
          ...currentRow.months,
          [String(month)]: normalizedValue,
        },
      }

      return nextRows
    })
  }

  const handleSave = async () => {
    if (!config.editable || !config.saveType) return

    try {
      setSaving(true)

      const normalizedRows = normalizeFinanceRows(rows)
      const changedRows = normalizedRows.filter((row) => dirtyEmployeeIdSet.has(row.employeeId))

      if (changedRows.length === 0) {
        setRows(normalizedRows)
        setInitialRows(normalizedRows)
        return
      }

      const payload = {
        year: currentYear,
        type: config.saveType,
        rows: changedRows.map((row) => ({
          employeeId: row.employeeId,
          months: row.months,
        })),
      }

      const response = await fetch('/api/finance/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || 'Failed to save finance table')
      }

      setRows(normalizedRows)
      setInitialRows(normalizedRows)
    } catch (error) {
      console.error('Error saving finance table:', error)
      alert(error instanceof Error ? error.message : 'Ошибка при сохранении данных')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold">
            <span className={cn('inline-flex rounded-xl p-2', config.iconClassName)}>
              <Wallet className="h-6 w-6" />
            </span>
            {config.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Текущий год: {currentYear}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className={cn('rounded-full border px-3 py-1 text-sm font-medium', config.badgeClassName)}>
            {config.modeLabel}
          </div>
          {config.editable ? (
            <Button onClick={handleSave} disabled={loading || saving || !hasChanges}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{config.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border">
            <Table className="w-[2540px] min-w-[2540px] table-fixed border-separate border-spacing-0">
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead
                    className="sticky left-0 z-30 box-border border-r bg-slate-50"
                    style={{ width: stickyColumnStyles.fullName.width, minWidth: stickyColumnStyles.fullName.width, maxWidth: stickyColumnStyles.fullName.width }}
                  >
                    ФИО
                  </TableHead>
                  <TableHead
                    className="sticky z-30 box-border border-r bg-slate-50"
                    style={{ left: stickyColumnStyles.department.left, width: stickyColumnStyles.department.width, minWidth: stickyColumnStyles.department.width, maxWidth: stickyColumnStyles.department.width }}
                  >
                    Подразделение
                  </TableHead>
                  <TableHead
                    className="sticky z-30 box-border border-r bg-slate-50"
                    style={{ left: stickyColumnStyles.position.left, width: stickyColumnStyles.position.width, minWidth: stickyColumnStyles.position.width, maxWidth: stickyColumnStyles.position.width }}
                  >
                    Должность
                  </TableHead>
                  <TableHead
                    className="sticky z-30 box-border border-r bg-slate-50"
                    style={{ left: stickyColumnStyles.rate.left, width: stickyColumnStyles.rate.width, minWidth: stickyColumnStyles.rate.width, maxWidth: stickyColumnStyles.rate.width }}
                  >
                    Доля ставки
                  </TableHead>
                  <TableHead
                    className="sticky z-30 box-border border-r bg-slate-50 shadow-[1px_0_0_0_rgba(203,213,225,1)]"
                    style={{ left: stickyColumnStyles.salary.left, width: stickyColumnStyles.salary.width, minWidth: stickyColumnStyles.salary.width, maxWidth: stickyColumnStyles.salary.width }}
                  >
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
                  <TableRow>
                    <TableCell colSpan={17} className="h-32 text-center text-muted-foreground">
                      Загрузка данных...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={17} className="h-32 text-center text-muted-foreground">
                      Нет сотрудников для отображения.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.employeeId} className="group">
                      <TableCell
                        className="sticky left-0 z-20 box-border border-r bg-white font-medium text-slate-900 group-hover:bg-white"
                        style={{ width: stickyColumnStyles.fullName.width, minWidth: stickyColumnStyles.fullName.width, maxWidth: stickyColumnStyles.fullName.width }}
                      >
                        {row.fullName}
                      </TableCell>
                      <TableCell
                        className="sticky z-20 box-border border-r bg-white group-hover:bg-white"
                        style={{ left: stickyColumnStyles.department.left, width: stickyColumnStyles.department.width, minWidth: stickyColumnStyles.department.width, maxWidth: stickyColumnStyles.department.width }}
                      >
                        {row.department}
                      </TableCell>
                      <TableCell
                        className="sticky z-20 box-border border-r bg-white group-hover:bg-white"
                        style={{ left: stickyColumnStyles.position.left, width: stickyColumnStyles.position.width, minWidth: stickyColumnStyles.position.width, maxWidth: stickyColumnStyles.position.width }}
                      >
                        {row.position}
                      </TableCell>
                      <TableCell
                        className="sticky z-20 box-border border-r bg-white group-hover:bg-white"
                        style={{ left: stickyColumnStyles.rate.left, width: stickyColumnStyles.rate.width, minWidth: stickyColumnStyles.rate.width, maxWidth: stickyColumnStyles.rate.width }}
                      >
                        {formatDecimal(row.rate)}
                      </TableCell>
                      <TableCell
                        className="sticky z-20 box-border border-r bg-white shadow-[1px_0_0_0_rgba(203,213,225,1)] group-hover:bg-white"
                        style={{ left: stickyColumnStyles.salary.left, width: stickyColumnStyles.salary.width, minWidth: stickyColumnStyles.salary.width, maxWidth: stickyColumnStyles.salary.width }}
                      >
                        {formatCurrency(row.salary)}
                      </TableCell>
                      {monthLabels.map((_, index) => {
                        const month = String(index + 1)

                        return (
                          <TableCell key={`${row.employeeId}-${month}`}>
                            {config.editable ? (
                              <Input
                                value={row.months[month]}
                                onChange={(e) => handleAmountChange(row.employeeId, index + 1, e.target.value)}
                                onBlur={() => handleAmountBlur(row.employeeId, index + 1)}
                                inputMode="decimal"
                                className="min-w-[110px] text-right"
                              />
                            ) : (
                              <div className="min-w-[110px] text-right text-sm font-medium text-slate-700">
                                {formatDecimal(row.months[month])}
                              </div>
                            )}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))
                )}

                {!loading && rows.length > 0 && (
                  <TableRow className="bg-slate-50/90 hover:bg-slate-50/90">
                    <TableCell
                      className="sticky left-0 z-20 box-border border-r bg-slate-50 font-semibold text-slate-900"
                      style={{ width: stickyColumnStyles.fullName.width, minWidth: stickyColumnStyles.fullName.width, maxWidth: stickyColumnStyles.fullName.width }}
                    >
                      Итого
                    </TableCell>
                    <TableCell
                      className="sticky z-20 box-border border-r bg-slate-50 text-muted-foreground"
                      style={{ left: stickyColumnStyles.department.left, width: stickyColumnStyles.department.width, minWidth: stickyColumnStyles.department.width, maxWidth: stickyColumnStyles.department.width }}
                    >
                      —
                    </TableCell>
                    <TableCell
                      className="sticky z-20 box-border border-r bg-slate-50 text-muted-foreground"
                      style={{ left: stickyColumnStyles.position.left, width: stickyColumnStyles.position.width, minWidth: stickyColumnStyles.position.width, maxWidth: stickyColumnStyles.position.width }}
                    >
                      —
                    </TableCell>
                    <TableCell
                      className="sticky z-20 box-border border-r bg-slate-50 font-semibold"
                      style={{ left: stickyColumnStyles.rate.left, width: stickyColumnStyles.rate.width, minWidth: stickyColumnStyles.rate.width, maxWidth: stickyColumnStyles.rate.width }}
                    >
                      {formatDecimal(totalRate)}
                    </TableCell>
                    <TableCell
                      className="sticky z-20 box-border border-r bg-slate-50 shadow-[1px_0_0_0_rgba(203,213,225,1)] font-semibold"
                      style={{ left: stickyColumnStyles.salary.left, width: stickyColumnStyles.salary.width, minWidth: stickyColumnStyles.salary.width, maxWidth: stickyColumnStyles.salary.width }}
                    >
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
        </CardContent>
      </Card>
    </div>
  )
}
