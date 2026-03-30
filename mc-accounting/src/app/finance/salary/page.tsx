'use client'

import { useEffect, useMemo, useState } from 'react'
import { Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency, formatDecimal } from '@/lib/utils'

interface SalaryRow {
  employeeId: string
  fullName: string
  department: string
  position: string
  rate: string
  salary: string
  months: Record<string, string>
}

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

const normalizeAmountInput = (value: string) => value.replace(',', '.')

const formatAmountValue = (value: string) => {
  const normalized = normalizeAmountInput(value).trim()

  if (!normalized) return '0.00'

  const numericValue = Number(normalized)

  if (Number.isNaN(numericValue)) return '0.00'

  return numericValue.toFixed(2)
}

export default function SalaryPage() {
  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const [rows, setRows] = useState<SalaryRow[]>([])
  const [initialRows, setInitialRows] = useState<SalaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadSalaryTable = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/finance/salary?year=${currentYear}`)

      if (!response.ok) {
        throw new Error('Failed to fetch salary table')
      }

      const data = await response.json()
      setRows(data.rows)
      setInitialRows(data.rows)
    } catch (error) {
      console.error('Error loading salary table:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSalaryTable()
  }, [currentYear])

  const hasChanges = useMemo(
    () => JSON.stringify(rows) !== JSON.stringify(initialRows),
    [rows, initialRows]
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
    const normalized = value.replace(',', '.')

    if (!/^\d*(?:[.]\d{0,2})?$/.test(normalized)) {
      return
    }

    setRows((currentRows) => currentRows.map((row) => (
      row.employeeId === employeeId
        ? {
            ...row,
            months: {
              ...row.months,
              [String(month)]: normalized,
            },
          }
        : row
    )))
  }

  const handleAmountBlur = (employeeId: string, month: number) => {
    setRows((currentRows) => currentRows.map((row) => (
      row.employeeId === employeeId
        ? {
            ...row,
            months: {
              ...row.months,
              [String(month)]: formatAmountValue(row.months[String(month)]),
            },
          }
        : row
    )))
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      const payload = {
        year: currentYear,
        rows: rows.map((row) => ({
          employeeId: row.employeeId,
          months: Object.fromEntries(
            Array.from({ length: 12 }, (_, index) => {
              const month = String(index + 1)
              return [month, formatAmountValue(row.months[month])]
            })
          ),
        })),
      }

      const response = await fetch('/api/finance/salary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || 'Failed to save salary table')
      }

      const normalizedRows = rows.map((row) => ({
        ...row,
        months: Object.fromEntries(
          Array.from({ length: 12 }, (_, index) => {
            const month = String(index + 1)
            return [month, formatAmountValue(row.months[month])]
          })
        ),
      }))

      setRows(normalizedRows)
      setInitialRows(normalizedRows)
    } catch (error) {
      console.error('Error saving salary table:', error)
      alert(error instanceof Error ? error.message : 'Ошибка при сохранении заработной платы')
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
            Заработная плата
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Текущий год: {currentYear}</p>
        </div>

        <Button onClick={handleSave} disabled={loading || saving || !hasChanges}>
          {saving ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Таблица заработной платы</CardTitle>
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
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Режим сохранения</p>
              <p className="mt-2 text-sm font-medium">По кнопке “Сохранить”</p>
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
                      Загрузка таблицы заработной платы...
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
                            <Input
                              value={row.months[month]}
                              onChange={(e) => handleAmountChange(row.employeeId, index + 1, e.target.value)}
                              onBlur={() => handleAmountBlur(row.employeeId, index + 1)}
                              inputMode="decimal"
                              className="min-w-[110px] text-right"
                            />
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
