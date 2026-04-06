'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn, formatCurrency, formatDecimal } from '@/lib/utils'

interface FinanceMonthCell {
  amount: string
  projectId: string | null
  projectCode: string
  projectName: string
  projectLabel?: string
  allocations?: Array<{
    projectId: string
    projectCode: string
    projectName: string
    amount: string
  }>
}

interface FinancePlanRow {
  employeeId: string
  fullName: string
  department: string
  position: string
  rate: string
  salary: string
  months: Record<string, FinanceMonthCell>
}

interface FinanceProjectOption {
  id: string
  code: string
  name: string
  plannedBudget: string
  actualBudget: string
  remainingBudget: string
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
  badgeClassName: string
  modeLabel: string
}> = {
  salary: {
    title: 'Заработная плата',
    endpoint: (year) => `/api/finance/salary?year=${year}`,
    editable: false,
    iconClassName: 'bg-slate-100 text-slate-700',
    badgeClassName: 'border-slate-200 bg-slate-100 text-slate-700',
    modeLabel: 'Автоматический расчет',
  },
  oklad: {
    title: 'Оклад',
    endpoint: (year) => `/api/finance/plans?type=oklad&year=${year}`,
    editable: true,
    saveType: 'oklad',
    iconClassName: 'bg-blue-100 text-blue-700',
    badgeClassName: 'border-blue-200 bg-blue-100 text-blue-700',
    modeLabel: 'Через проект',
  },
  nadbavka: {
    title: 'Надбавка',
    endpoint: (year) => `/api/finance/plans?type=nadbavka&year=${year}`,
    editable: true,
    saveType: 'nadbavka',
    iconClassName: 'bg-violet-100 text-violet-700',
    badgeClassName: 'border-violet-200 bg-violet-100 text-violet-700',
    modeLabel: 'Через проект',
  },
}

const emptyCell = (): FinanceMonthCell => ({
  amount: '0.00',
  projectId: null,
  projectCode: '',
  projectName: '',
  projectLabel: '',
  allocations: [],
})

const createEmptyAllocation = () => ({
  localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  projectId: '',
  amount: '',
})

const formatAmountValue = (value: string) => {
  const normalized = value.replace(',', '.').trim()

  if (!normalized) return '0.00'

  const numericValue = Number(normalized)

  if (Number.isNaN(numericValue)) return '0.00'

  return numericValue.toFixed(2)
}

export function FinancePlanPage({ type }: { type: FinanceSectionType }) {
  const config = pageConfig[type]
  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const [rows, setRows] = useState<FinancePlanRow[]>([])
  const [projects, setProjects] = useState<FinanceProjectOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedCell, setSelectedCell] = useState<{
    employeeId: string
    employeeName: string
    employeeSalary: string
    month: number
    cell: FinanceMonthCell
  } | null>(null)
  const [cellForm, setCellForm] = useState({
    projectId: '',
    amount: '',
  })
  const [allocationRows, setAllocationRows] = useState<Array<{
    localId: string
    projectId: string
    amount: string
  }>>([])

  const loadFinanceTable = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(config.endpoint(currentYear))

      if (!response.ok) {
        throw new Error('Failed to fetch finance table')
      }

      const data = await response.json()
      setRows(data.rows)
      setProjects(data.projects || [])
    } catch (error) {
      console.error('Error loading finance table:', error)
    } finally {
      setLoading(false)
    }
  }, [config, currentYear])

  useEffect(() => {
    loadFinanceTable()
  }, [loadFinanceTable])

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
        const total = rows.reduce((sum, row) => sum + Number(formatAmountValue(row.months[month]?.amount || '0.00')), 0)
        return [month, total.toFixed(2)]
      })
    ),
    [rows]
  )

  const openCellDialog = (row: FinancePlanRow, month: number) => {
    if (!config.editable) return

    const cell = row.months[String(month)] || emptyCell()

    setSelectedCell({
      employeeId: row.employeeId,
      employeeName: row.fullName,
      employeeSalary: row.salary,
      month,
      cell,
    })
    setCellForm({
      projectId: cell.projectId || '',
      amount: cell.amount === '0.00' ? '' : cell.amount,
    })
    setAllocationRows(
      cell.allocations && cell.allocations.length > 0
        ? cell.allocations.map((allocation, index) => ({
            localId: `${allocation.projectId}-${index}`,
            projectId: allocation.projectId,
            amount: allocation.amount,
          }))
        : [createEmptyAllocation()]
    )
  }

  const closeCellDialog = () => {
    setSelectedCell(null)
    setCellForm({ projectId: '', amount: '' })
    setAllocationRows([])
  }

  const saveCell = async () => {
    if (!selectedCell || !config.saveType) return

    const normalizedAmount = config.saveType === 'oklad'
      ? formatAmountValue(selectedCell.employeeSalary)
      : formatAmountValue(cellForm.amount)

    const normalizedAllocations = config.saveType === 'nadbavka'
      ? allocationRows
          .filter((allocation) => allocation.projectId || allocation.amount)
          .map((allocation) => ({
            projectId: allocation.projectId,
            amount: formatAmountValue(allocation.amount),
          }))
      : []

    if (config.saveType === 'oklad' && !cellForm.projectId) {
      alert('Выберите проект')
      return
    }

    if (config.saveType === 'oklad' && Number(normalizedAmount) <= 0) {
      alert(config.saveType === 'oklad' ? 'Для сотрудника не задан оклад' : 'Введите сумму больше нуля')
      return
    }

    if (config.saveType === 'nadbavka') {
      if (normalizedAllocations.length === 0) {
        alert('Добавьте хотя бы одно начисление')
        return
      }

      const hasIncompleteAllocation = normalizedAllocations.some((allocation) => !allocation.projectId || Number(allocation.amount) <= 0)

      if (hasIncompleteAllocation) {
        alert('Заполните проект и сумму для каждой строки надбавки')
        return
      }
    }

    try {
      setSaving(true)

      const response = await fetch('/api/finance/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedCell.employeeId,
          year: currentYear,
          month: selectedCell.month,
          type: config.saveType,
          projectId: config.saveType === 'oklad' ? cellForm.projectId : undefined,
          amount: config.saveType === 'oklad' ? normalizedAmount : undefined,
          allocations: config.saveType === 'nadbavka' ? normalizedAllocations : undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || 'Failed to save finance plan cell')
      }

      closeCellDialog()
      await loadFinanceTable()
    } catch (error) {
      console.error('Error saving finance plan cell:', error)
      alert(error instanceof Error ? error.message : 'Ошибка при сохранении значения')
    } finally {
      setSaving(false)
    }
  }

  const clearCell = async () => {
    if (!selectedCell || !config.saveType) return

    try {
      setSaving(true)

      const response = await fetch('/api/finance/plans', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedCell.employeeId,
          year: currentYear,
          month: selectedCell.month,
          type: config.saveType,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || 'Failed to clear finance plan cell')
      }

      closeCellDialog()
      await loadFinanceTable()
    } catch (error) {
      console.error('Error clearing finance plan cell:', error)
      alert(error instanceof Error ? error.message : 'Ошибка при очистке значения')
    } finally {
      setSaving(false)
    }
  }

  const renderCellValue = (cell: FinanceMonthCell) => {
    const amount = Number(cell.amount)
    const hasValue = amount > 0
    const shouldShowProjectLabel = type !== 'nadbavka'
    const projectLabel = shouldShowProjectLabel
      ? (cell.projectLabel?.includes(',') ? '' : (cell.projectLabel || cell.projectCode))
      : ''

    if (!hasValue) {
      return <span className="text-muted-foreground">—</span>
    }

    return (
      <div className="min-w-[110px] text-right">
        <div className="text-sm font-medium text-slate-800">{formatCurrency(cell.amount)}</div>
        {projectLabel ? (
          <div className="mt-1 text-xs text-muted-foreground">{projectLabel}</div>
        ) : null}
      </div>
    )
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

        <div className={cn('rounded-full border px-3 py-1 text-sm font-medium', config.badgeClassName)}>
          {config.modeLabel}
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
                            {config.editable ? (
                              <button
                                type="button"
                                onClick={() => openCellDialog(row, index + 1)}
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
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedCell)} onOpenChange={(open) => !open && closeCellDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{config.title}: {selectedCell ? monthLabels[selectedCell.month - 1] : ''}</DialogTitle>
            <DialogDescription>
              {config.saveType === 'oklad'
                ? 'Выбери проект. Сумма будет автоматически взята из оклада сотрудника и списана из бюджета проекта.'
                : 'Выбери проект и укажи сумму. Эта сумма будет списана из бюджета проекта и отобразится в таблице.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <p className="font-medium text-slate-900">{selectedCell?.employeeName}</p>
              {config.saveType === 'oklad' && (
                <p className="mt-2 text-muted-foreground">
                  Оклад сотрудника: {selectedCell ? formatCurrency(selectedCell.employeeSalary) : '—'}
                </p>
              )}
              {selectedCell?.cell.projectCode ? (
                <p className="mt-2 text-muted-foreground">
                  Текущий проект: {selectedCell.cell.projectLabel || selectedCell.cell.projectCode}
                </p>
              ) : null}
            </div>

            {config.saveType === 'oklad' ? (
              <div className="space-y-2">
                <Label htmlFor="finance-project">Проект</Label>
                <Select value={cellForm.projectId} onValueChange={(value) => setCellForm((prev) => ({ ...prev, projectId: value }))}>
                  <SelectTrigger id="finance-project">
                    <SelectValue placeholder="Выберите проект" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.code} — {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cellForm.projectId && (
                  <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                    {(() => {
                      const project = projects.find((item) => item.id === cellForm.projectId)
                      return project
                        ? `Остаток бюджета: ${formatCurrency(project.remainingBudget)}`
                        : 'Проект не найден'
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Проекты и суммы</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAllocationRows((current) => [...current, createEmptyAllocation()])}>
                    <Plus className="mr-2 h-4 w-4" />
                    Добавить проект
                  </Button>
                </div>

                <div className="space-y-3">
                  {allocationRows.map((allocation, index) => (
                    <div key={allocation.localId} className="rounded-lg border p-4">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_44px] md:items-start">
                        <div className="space-y-3">
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                            <div className="space-y-2">
                              <Label htmlFor={`finance-project-${allocation.localId}`}>Проект {index + 1}</Label>
                              <Select
                                value={allocation.projectId}
                                onValueChange={(value) => setAllocationRows((current) => current.map((row) => row.localId === allocation.localId ? { ...row, projectId: value } : row))}
                              >
                                <SelectTrigger id={`finance-project-${allocation.localId}`}>
                                  <SelectValue placeholder="Выберите проект" />
                                </SelectTrigger>
                                <SelectContent>
                                  {projects.map((project) => (
                                    <SelectItem key={project.id} value={project.id}>
                                      {project.code} — {project.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`finance-amount-${allocation.localId}`}>Сумма</Label>
                              <Input
                                id={`finance-amount-${allocation.localId}`}
                                value={allocation.amount}
                                onChange={(e) => setAllocationRows((current) => current.map((row) => row.localId === allocation.localId ? { ...row, amount: e.target.value.replace(',', '.') } : row))}
                                inputMode="decimal"
                                placeholder="0.00"
                              />
                            </div>
                          </div>

                          {allocation.projectId && (
                            <div className="rounded-md border bg-slate-50 px-4 py-3 text-sm text-muted-foreground">
                              {(() => {
                                const project = projects.find((item) => item.id === allocation.projectId)
                                return project
                                  ? (
                                    <div className="flex items-center justify-between gap-3">
                                      <span>Остаток бюджета:</span>
                                      <span className="font-medium text-slate-700">{formatCurrency(project.remainingBudget)}</span>
                                    </div>
                                  )
                                  : 'Проект не найден'
                              })()}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-end md:pt-8">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-red-500 hover:text-red-700"
                            onClick={() => setAllocationRows((current) => current.length > 1 ? current.filter((row) => row.localId !== allocation.localId) : [createEmptyAllocation()])}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <div>
                {selectedCell?.cell.projectId && (
                  <Button type="button" variant="outline" onClick={clearCell} disabled={saving}>
                    Очистить
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeCellDialog}>
                  Отмена
                </Button>
                <Button type="button" onClick={saveCell} disabled={saving}>
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
