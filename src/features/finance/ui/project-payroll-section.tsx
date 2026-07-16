'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarRange, Plus, Trash2, Users, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { FinancePlanTable } from './finance-plan-table'
import { monthLabels } from './config'
import {
  ProjectMemberOption,
  ProjectMemberRow,
  ProjectPayrollCell,
  ProjectPayrollRow,
  ProjectPayrollSelectedCell,
} from '@/features/projects/contracts/ui-types'
import { cn, formatCurrency, formatDecimal } from '@/lib/utils'

interface ProjectPayrollSectionProps {
  projectId: string
}

interface PayrollResponse {
  year: number
  rows: ProjectPayrollRow[]
  summary: {
    totalRate: string
    totalSalary: string
    monthTotals: Record<string, string>
  }
}

interface MembersResponse {
  members: ProjectMemberRow[]
  availableEmployees: ProjectMemberOption[]
}

const emptySummary = {
  totalRate: '0.00',
  totalSalary: '0.00',
  monthTotals: Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [String(index + 1), '0.00'])
  ),
}

function ProjectPayrollCellDialog({
  selectedCell,
  saving,
  onClose,
  onSave,
  onClear,
}: {
  selectedCell: ProjectPayrollSelectedCell | null
  saving: boolean
  onClose: () => void
  onSave: (payload: { okladEnabled: boolean; nadbavkaAmount: string }) => void
  onClear: () => void
}) {
  const [okladEnabled, setOkladEnabled] = useState(false)
  const [nadbavkaAmount, setNadbavkaAmount] = useState('')

  useEffect(() => {
    if (!selectedCell) {
      setOkladEnabled(false)
      setNadbavkaAmount('')
      return
    }

    const okladDetail = selectedCell.cell.details.find((detail) => detail.type === 'OKLAD')
    const nadbavkaDetail = selectedCell.cell.details.find((detail) => detail.type === 'NADBAVKA')

    setOkladEnabled(Boolean(okladDetail))
    setNadbavkaAmount(nadbavkaDetail?.amount || '')
  }, [selectedCell])

  const canClear = Boolean(selectedCell && Number(selectedCell.cell.amount) > 0)

  return (
    <Dialog open={Boolean(selectedCell)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Выплаты: {selectedCell ? monthLabels[selectedCell.month - 1] : ''}
          </DialogTitle>
          <DialogDescription>
            Управление начислениями по сотруднику внутри текущего проекта. Оклад берётся из состава проекта, надбавка вводится вручную.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border bg-slate-50/70 p-4 text-sm">
            <p className="font-medium text-slate-900">{selectedCell?.employeeName}</p>
            <p className="mt-2 text-muted-foreground">
              Базовый оклад в проекте: {selectedCell ? formatCurrency(selectedCell.employeeSalary) : '—'}
            </p>
            <p className="mt-2 text-muted-foreground">
              Сумма за месяц: {selectedCell ? formatCurrency(selectedCell.cell.amount) : '—'}
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex items-start gap-3">
              <input
                id="project-oklad-enabled"
                type="checkbox"
                checked={okladEnabled}
                onChange={(event) => setOkladEnabled(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-primary"
              />
              <div className="space-y-1">
                <Label htmlFor="project-oklad-enabled" className="text-sm font-medium text-slate-900">
                  Начислить оклад
                </Label>
                <p className="text-sm text-muted-foreground">
                  При сохранении будет создана или обновлена запись `OKLAD` на сумму {selectedCell ? formatCurrency(selectedCell.employeeSalary) : '—'}.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border p-4">
            <Label htmlFor="project-nadbavka-amount">Надбавка</Label>
            <Input
              id="project-nadbavka-amount"
              value={nadbavkaAmount}
              onChange={(event) => setNadbavkaAmount(event.target.value.replace(',', '.'))}
              inputMode="decimal"
              placeholder="0.00"
            />
            <p className="text-sm text-muted-foreground">
              Если поле пустое, запись `NADBAVKA` для этого месяца будет удалена.
            </p>
          </div>

          <div className="flex justify-between gap-2">
            <div>
              {canClear ? (
                <Button type="button" variant="outline" onClick={onClear} disabled={saving}>
                  Очистить
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Отмена
              </Button>
              <Button
                type="button"
                onClick={() => onSave({ okladEnabled, nadbavkaAmount })}
                disabled={saving}
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectPayrollSection({ projectId }: ProjectPayrollSectionProps) {
  const { toast } = useToast()
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [members, setMembers] = useState<ProjectMemberRow[]>([])
  const [availableEmployees, setAvailableEmployees] = useState<ProjectMemberOption[]>([])
  const [rows, setRows] = useState<ProjectPayrollRow[]>([])
  const [summary, setSummary] = useState(emptySummary)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedCell, setSelectedCell] = useState<ProjectPayrollSelectedCell | null>(null)

  const totalRate = useMemo(() => Number(summary.totalRate), [summary.totalRate])
  const totalSalary = useMemo(() => Number(summary.totalSalary), [summary.totalSalary])

  const loadMembers = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/members`, { cache: 'no-store' })

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Не удалось загрузить состав проекта' }))
      throw new Error(body.error || 'Не удалось загрузить состав проекта')
    }

    const data = await response.json() as MembersResponse
    setMembers(data.members)
    setAvailableEmployees(data.availableEmployees)
  }, [projectId])

  const loadPayroll = useCallback(async (year: number) => {
    const response = await fetch(`/api/projects/${projectId}/payroll?year=${year}`, { cache: 'no-store' })

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Не удалось загрузить таблицу выплат' }))
      throw new Error(body.error || 'Не удалось загрузить таблицу выплат')
    }

    const data = await response.json() as PayrollResponse
    setRows(data.rows)
    setSummary(data.summary)
  }, [projectId])

  const loadSection = useCallback(async (year: number) => {
    setLoading(true)

    try {
      await Promise.all([loadMembers(), loadPayroll(year)])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось загрузить данные проекта')
    } finally {
      setLoading(false)
    }
  }, [loadMembers, loadPayroll, toast])

  useEffect(() => {
    void loadSection(currentYear)
  }, [currentYear, loadSection])

  const handleAddMember = useCallback(async () => {
    if (!selectedEmployeeId) {
      toast.error('Выберите сотрудника')
      return
    }

    setSaving(true)

    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: selectedEmployeeId }),
      })

      const body = await response.json().catch(() => ({ error: 'Не удалось добавить сотрудника' }))

      if (!response.ok) {
        throw new Error(body.error || 'Не удалось добавить сотрудника')
      }

      setSelectedEmployeeId('')
      await Promise.all([loadMembers(), loadPayroll(currentYear)])
      toast.success('Сотрудник добавлен в состав проекта')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось добавить сотрудника')
    } finally {
      setSaving(false)
    }
  }, [currentYear, loadMembers, loadPayroll, projectId, selectedEmployeeId, toast])

  const handleArchiveMember = useCallback(async (memberId: string) => {
    setSaving(true)

    try {
      const response = await fetch(`/api/projects/${projectId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: true }),
      })

      const body = await response.json().catch(() => ({ error: 'Не удалось архивировать сотрудника' }))

      if (!response.ok) {
        throw new Error(body.error || 'Не удалось архивировать сотрудника')
      }

      await Promise.all([loadMembers(), loadPayroll(currentYear)])
      toast.success('Сотрудник архивирован в составе проекта')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось архивировать сотрудника')
    } finally {
      setSaving(false)
    }
  }, [currentYear, loadMembers, loadPayroll, projectId, toast])

  const openCellDialog = useCallback((row: { employeeId: string; fullName: string; salary: string; months: Record<string, ProjectPayrollCell> }, month: number) => {
    const cell = row.months[String(month)]

    setSelectedCell({
      employeeId: row.employeeId,
      employeeName: row.fullName,
      employeeSalary: row.salary,
      month,
      cell,
    })
  }, [])

  const closeCellDialog = useCallback(() => {
    setSelectedCell(null)
  }, [])

  const handleSaveCell = useCallback(async ({
    okladEnabled,
    nadbavkaAmount,
  }: {
    okladEnabled: boolean
    nadbavkaAmount: string
  }) => {
    if (!selectedCell) {
      return
    }

    setSaving(true)

    try {
      const response = await fetch(`/api/projects/${projectId}/payroll`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: currentYear,
          month: selectedCell.month,
          employeeId: selectedCell.employeeId,
          okladEnabled,
          nadbavkaAmount,
        }),
      })

      const body = await response.json().catch(() => ({ error: 'Не удалось сохранить начисление' }))

      if (!response.ok) {
        throw new Error(body.error || 'Не удалось сохранить начисление')
      }

      await loadPayroll(currentYear)
      closeCellDialog()
      toast.success('Начисление сохранено')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить начисление')
    } finally {
      setSaving(false)
    }
  }, [closeCellDialog, currentYear, loadPayroll, projectId, selectedCell, toast])

  const handleClearCell = useCallback(async () => {
    if (!selectedCell) {
      return
    }

    setSaving(true)

    try {
      const response = await fetch(`/api/projects/${projectId}/payroll`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: currentYear,
          month: selectedCell.month,
          employeeId: selectedCell.employeeId,
        }),
      })

      const body = await response.json().catch(() => ({ error: 'Не удалось очистить начисление' }))

      if (!response.ok) {
        throw new Error(body.error || 'Не удалось очистить начисление')
      }

      await loadPayroll(currentYear)
      closeCellDialog()
      toast.success('Начисления за месяц очищены')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось очистить начисление')
    } finally {
      setSaving(false)
    }
  }, [closeCellDialog, currentYear, loadPayroll, projectId, selectedCell, toast])

  return (
    <div className="space-y-6">
      <CardHeader className="border-b bg-slate-50/80 px-6 py-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" />
          Таблица с планированием выплат заработной платы
        </CardTitle>
        <CardDescription>
          Управление составом команды проекта и начислениями по месяцам на основе общих финансовых данных.
        </CardDescription>
      </CardHeader>

      <div className="space-y-6 px-6 pb-6">
        <div className="rounded-xl border bg-slate-50/60 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <Users className="h-4 w-4" />
                Состав проекта
              </p>
              <p className="text-sm text-muted-foreground">
                Добавляйте сотрудников в команду проекта. Они сразу появятся в таблице выплат, даже без начислений.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-[280px] space-y-2">
                <Label htmlFor="project-member-select">Сотрудник</Label>
                <Select value={selectedEmployeeId || '__none__'} onValueChange={(value) => setSelectedEmployeeId(value === '__none__' ? '' : value)}>
                  <SelectTrigger id="project-member-select">
                    <SelectValue placeholder="Выберите сотрудника" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Не выбрано</SelectItem>
                    {availableEmployees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.fullName} ({employee.position})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={handleAddMember} disabled={saving || availableEmployees.length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                Добавить в проект
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-lg border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Сотрудник</TableHead>
                  <TableHead>Подразделение</TableHead>
                  <TableHead>Должность</TableHead>
                  <TableHead>Ставка</TableHead>
                  <TableHead>Оклад</TableHead>
                  <TableHead className="text-right">Действие</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }, (_, index) => (
                    <TableRow key={`member-skeleton-${index}`}>
                      {Array.from({ length: 6 }, (_, cellIndex) => (
                        <TableCell key={`member-skeleton-${index}-${cellIndex}`}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : members.length > 0 ? (
                  members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{member.employee.fullName}</p>
                          <p className="text-xs text-muted-foreground">{member.employee.code}</p>
                        </div>
                      </TableCell>
                      <TableCell>{member.department}</TableCell>
                      <TableCell>{member.position}</TableCell>
                      <TableCell>{formatDecimal(member.rate)}</TableCell>
                      <TableCell>{formatCurrency(member.salary)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleArchiveMember(member.id)}
                          disabled={saving}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Архивировать
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      В проект ещё не добавлены сотрудники.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-xl border">
          <div className="flex flex-col gap-4 border-b bg-slate-50/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <CalendarRange className="h-4 w-4" />
                Годовой план выплат
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                В таблице отображаются только активные участники проекта.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCurrentYear((value) => value - 1)}
                disabled={loading || saving}
              >
                Назад
              </Button>
              <div className="min-w-[88px] text-center text-sm font-medium text-slate-900">
                {currentYear}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCurrentYear((value) => value + 1)}
                disabled={loading || saving}
              >
                Вперёд
              </Button>
            </div>
          </div>

          <div className={cn('p-4', members.length === 0 && !loading && 'bg-slate-50/30')}>
            <FinancePlanTable
              loading={loading}
              rows={rows}
              totalRate={totalRate}
              totalSalary={totalSalary}
              monthTotals={summary.monthTotals}
              editable
              onCellClick={(row, month) => openCellDialog(row as ProjectPayrollRow, month)}
            />
          </div>
        </div>
      </div>

      <ProjectPayrollCellDialog
        selectedCell={selectedCell}
        saving={saving}
        onClose={closeCellDialog}
        onSave={handleSaveCell}
        onClear={handleClearCell}
      />
    </div>
  )
}
