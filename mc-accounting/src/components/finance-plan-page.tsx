'use client'

import { useEffect, useMemo, useState } from 'react'
import { Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency, formatDecimal } from '@/lib/utils'

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

const pageConfig: Record<FinanceSectionType, { title: string; endpoint: (year: number) => string; editable: boolean; saveType?: 'oklad' | 'nadbavka' }> = {
  salary: {
    title: 'Заработная плата',
    endpoint: (year) => `/api/finance/salary?year=${year}`,
    editable: false,
  },
  oklad: {
    title: 'Оклад',
    endpoint: (year) => `/api/finance/plans?type=oklad&year=${year}`,
    editable: true,
    saveType: 'oklad',
  },
  nadbavka: {
    title: 'Надбавка',
    endpoint: (year) => `/api/finance/plans?type=nadbavka&year=${year}`,
    editable: true,
    saveType: 'nadbavka',
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
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Wallet className="h-6 w-6" />
            {config.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Текущий год: {currentYear}</p>
        </div>

        {config.editable ? (
          <Button onClick={handleSave} disabled={loading || saving || !hasChanges}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{config.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Сотрудников</p>
              <p className="mt-2 text-sm font-medium">{rows.length}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Всего ставок</p>
              <p className="mt-2 text-sm font-medium">{formatDecimal(totalRate)}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Сумма окладов</p>
              <p className="mt-2 text-sm font-medium">{formatCurrency(totalSalary)}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Режим</p>
              <p className="mt-2 text-sm font-medium">
                {config.editable ? 'По кнопке “Сохранить”' : 'Автоматический расчет'}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="min-w-[240px]">ФИО</TableHead>
                  <TableHead className="min-w-[180px]">Подразделение</TableHead>
                  <TableHead className="min-w-[180px]">Должность</TableHead>
                  <TableHead className="min-w-[120px]">Доля ставки</TableHead>
                  <TableHead className="min-w-[140px]">Оклад</TableHead>
                  {monthLabels.map((month) => (
                    <TableHead key={month} className="min-w-[140px] text-center">
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
                    <TableRow key={row.employeeId}>
                      <TableCell className="font-medium text-slate-900">{row.fullName}</TableCell>
                      <TableCell>{row.department}</TableCell>
                      <TableCell>{row.position}</TableCell>
                      <TableCell>{formatDecimal(row.rate)}</TableCell>
                      <TableCell>{formatCurrency(row.salary)}</TableCell>
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
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
