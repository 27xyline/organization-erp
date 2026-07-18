'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, Lock, Plus, Trash2, Unlock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PAYROLL_ADJUSTMENT_LABELS } from '../contracts/payroll'

type AdjustmentType = keyof typeof PAYROLL_ADJUSTMENT_LABELS

interface PayrollData {
  period: {
    status: 'OPEN' | 'CLOSED'
    closedAt: string | null
    closedBy: { name: string; username: string } | null
  }
  rows: Array<{
    employeeId: string
    code: string
    fullName: string
    department: string
    position: string
    rate: number
    plannedGross: number
    actualBase: number
    allowance: number
    bonus: number
    oneTime: number
    deduction: number
    gross: number
    tax: number
    payable: number
    contributions: number
    employerCost: number
    variance: number
    adjustments: Array<{
      id: string
      type: AdjustmentType
      amount: number
      description: string
      project: { code: string; name: string } | null
    }>
  }>
  totals: {
    planned: number
    gross: number
    tax: number
    contributions: number
    payable: number
    employerCost: number
  }
  departmentTotals: Array<{
    department: string
    planned: number
    gross: number
    payable: number
    employerCost: number
  }>
  projectForecasts: Array<{
    id: string
    code: string
    name: string
    plannedBudget: number
    actualBudget: number
    monthlyPayroll: number
    forecast: number
    variance: number
  }>
  options: {
    employees: Array<{ id: string; code: string; fullName: string }>
    projects: Array<{ id: string; code: string; name: string }>
  }
}

const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' })

function currentMonth() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function PayrollPage({
  canManage,
  canClose,
  canExport,
}: {
  canManage: boolean
  canClose: boolean
  canExport: boolean
}) {
  const [month, setMonth] = useState(currentMonth)
  const [data, setData] = useState<PayrollData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [type, setType] = useState<AdjustmentType>('BONUS')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [year, selectedMonth] = month.split('-').map(Number)

  const load = useCallback(async () => {
    setLoading(true)
    const [selectedYear, monthNumber] = month.split('-')
    const response = await fetch(`/api/payroll?year=${selectedYear}&month=${Number(monthNumber)}`)
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setError(payload?.error?.message || 'Не удалось загрузить расчёт')
      setLoading(false)
      return
    }
    setData(payload.data)
    setError('')
    setLoading(false)
  }, [month])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const openAdjustment = () => {
    setEmployeeId(data?.options.employees[0]?.id || '')
    setProjectId('')
    setType('BONUS')
    setAmount('')
    setDescription('')
    setDialogOpen(true)
  }

  const createAdjustment = async () => {
    setSaving(true)
    const response = await fetch('/api/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId,
        projectId: projectId || null,
        year,
        month: selectedMonth,
        type,
        amount: Number(amount),
        description,
      }),
    })
    const payload = await response.json().catch(() => null)
    setSaving(false)
    if (!response.ok) {
      setError(payload?.error?.message || 'Не удалось сохранить выплату')
      return
    }
    setDialogOpen(false)
    await load()
  }

  const removeAdjustment = async (id: string) => {
    const response = await fetch(`/api/payroll/adjustments/${id}`, { method: 'DELETE' })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.error?.message || 'Не удалось удалить выплату')
      return
    }
    await load()
  }

  const setPeriodStatus = async (status: 'OPEN' | 'CLOSED') => {
    const response = await fetch('/api/payroll/period', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month: selectedMonth, status }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.error?.message || 'Не удалось изменить статус месяца')
      return
    }
    await load()
  }

  const closed = data?.period.status === 'CLOSED'
  const exportUrl = `/api/payroll/export?year=${year}&month=${selectedMonth}`

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Расчёт заработной платы</h1>
          <p className="mt-1 text-muted-foreground">План‑факт, налоги, взносы, премии и удержания</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="payroll-month">Месяц</Label>
            <Input id="payroll-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </div>
          {canExport && <Button asChild variant="outline"><a href={exportUrl}><Download className="mr-2 h-4 w-4" />Excel</a></Button>}
          {canManage && <Button onClick={openAdjustment} disabled={closed || !data?.options.employees.length}><Plus className="mr-2 h-4 w-4" />Выплата</Button>}
          {canClose && (
            <Button variant={closed ? 'outline' : 'default'} onClick={() => void setPeriodStatus(closed ? 'OPEN' : 'CLOSED')}>
              {closed ? <Unlock className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
              {closed ? 'Открыть месяц' : 'Закрыть месяц'}
            </Button>
          )}
        </div>
      </div>

      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <Badge variant={closed ? 'secondary' : 'default'}>{closed ? 'Месяц закрыт' : 'Месяц открыт'}</Badge>
        {closed && data?.period.closedBy && <span className="text-sm text-muted-foreground">Закрыл: {data.period.closedBy.name}</span>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ['План', data?.totals.planned || 0],
          ['Начислено', data?.totals.gross || 0],
          ['НДФЛ', data?.totals.tax || 0],
          ['К выплате', data?.totals.payable || 0],
          ['Взносы', data?.totals.contributions || 0],
          ['Стоимость работодателя', data?.totals.employerCost || 0],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardHeader className="pb-2"><CardTitle className="text-xs">{label}</CardTitle></CardHeader>
            <CardContent className="text-lg font-semibold">{money.format(Number(value))}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Платёжная ведомость</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Сотрудник</TableHead>
                <TableHead>Ставка</TableHead>
                <TableHead>План</TableHead>
                <TableHead>Оклад</TableHead>
                <TableHead>Надбавки</TableHead>
                <TableHead>Премии</TableHead>
                <TableHead>Удержания</TableHead>
                <TableHead>Начислено</TableHead>
                <TableHead>НДФЛ</TableHead>
                <TableHead>К выплате</TableHead>
                <TableHead>Взносы</TableHead>
                <TableHead>Отклонение</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.rows.map((row) => (
                <TableRow key={row.employeeId}>
                  <TableCell>
                    <div className="font-medium">{row.fullName}</div>
                    <div className="text-xs text-muted-foreground">{row.code} · {row.department}</div>
                    {row.adjustments.map((adjustment) => (
                      <div key={adjustment.id} className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        {PAYROLL_ADJUSTMENT_LABELS[adjustment.type]}: {money.format(adjustment.amount)}
                        {canManage && !closed && (
                          <button aria-label="Удалить выплату" onClick={() => void removeAdjustment(adjustment.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </button>
                        )}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell>{row.rate.toLocaleString('ru-RU')}</TableCell>
                  <TableCell>{money.format(row.plannedGross)}</TableCell>
                  <TableCell>{money.format(row.actualBase)}</TableCell>
                  <TableCell>{money.format(row.allowance)}</TableCell>
                  <TableCell>{money.format(row.bonus + row.oneTime)}</TableCell>
                  <TableCell>{money.format(row.deduction)}</TableCell>
                  <TableCell>{money.format(row.gross)}</TableCell>
                  <TableCell>{money.format(row.tax)}</TableCell>
                  <TableCell>{money.format(row.payable)}</TableCell>
                  <TableCell>{money.format(row.contributions)}</TableCell>
                  <TableCell className={row.variance > 0 ? 'text-red-600' : row.variance < 0 ? 'text-green-600' : ''}>{money.format(row.variance)}</TableCell>
                </TableRow>
              ))}
              {!loading && !data?.rows.length && <TableRow><TableCell colSpan={12} className="h-24 text-center">Нет сотрудников</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>ФОТ по подразделениям</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data?.departmentTotals.map((row) => (
              <div key={row.department} className="rounded-lg border p-3">
                <p className="font-medium">{row.department}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <span>План: {money.format(row.planned)}</span>
                  <span>Факт: {money.format(row.gross)}</span>
                  <span>Всего: {money.format(row.employerCost)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Прогноз бюджетов проектов</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data?.projectForecasts.map((project) => (
              <div key={project.id} className="rounded-lg border p-3">
                <p className="font-medium">{project.code} · {project.name}</p>
                <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
                  <span>Текущий расход: {money.format(project.actualBudget)}</span>
                  <span>Месячный ФОТ: {money.format(project.monthlyPayroll)}</span>
                  <span className={project.variance > 0 ? 'text-red-600' : 'text-green-600'}>Прогноз: {money.format(project.forecast)} · отклонение {money.format(project.variance)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Премия, выплата или удержание</DialogTitle>
            <DialogDescription>Операция попадёт в расчёт выбранного месяца.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="payroll-employee">Сотрудник</Label>
              <select id="payroll-employee" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
                {data?.options.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} · {employee.code}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payroll-type">Тип</Label>
              <select id="payroll-type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as AdjustmentType)}>
                {Object.entries(PAYROLL_ADJUSTMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payroll-project">Проект</Label>
              <select id="payroll-project" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <option value="">Без проекта</option>
                {data?.options.projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payroll-amount">Сумма</Label>
              <Input id="payroll-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payroll-description">Основание</Label>
              <Input id="payroll-description" value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={() => void createAdjustment()} disabled={saving || !employeeId || !amount || !description}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
