'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Plus, Send, Trash2, Undo2 } from 'lucide-react'
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
import { TIME_ENTRY_TYPE_LABELS } from '../contracts/time-entry'

type EntryType = keyof typeof TIME_ENTRY_TYPE_LABELS

interface TimeEntry {
  id: string
  workDate: string
  type: EntryType
  hours: string
  note: string | null
  employee: { id: string; fullName: string; code: string; department: string }
  project: { id: string; code: string; name: string } | null
  task: { id: string; name: string } | null
}

interface TimekeepingData {
  year: number
  month: number
  normativeHours: number
  entries: TimeEntry[]
  summaries: Array<{
    employeeId: string
    employeeName: string
    department: string
    rate: number
    baseSalary: number
    regularHours: number
    vacationHours: number
    sickHours: number
    tripHours: number
    overtimeHours: number
    calculatedSalary: number
    projectCost: number
  }>
  employees: Array<{ id: string; code: string; fullName: string; department: string }>
  projects: Array<{
    id: string
    code: string
    name: string
    tasksList: Array<{ id: string; name: string }>
  }>
  period: { status: string }
  timesheets: Array<{
    id: string
    employeeId: string
    year: number
    month: number
    status: string
    zeroHoursConfirmed: boolean
    employee: { id: string; fullName: string; code: string; department?: string } | null
    submittedBy: { name?: string; fullName?: string } | string | null
    decidedBy: { name?: string; fullName?: string } | string | null
    decisionReason: string | null
  }>
}

const currency = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
})

function initialMonth() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

function initialDate(month: string) {
  const today = new Date().toISOString().slice(0, 10)
  return today.startsWith(month) ? today : `${month}-01`
}

function timesheetStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: 'Черновик',
    SUBMITTED: 'На согласовании',
    APPROVED: 'Утверждён',
    RETURNED: 'Возвращён на исправление',
  }
  return labels[status] || status
}

function actorName(actor: { name?: string; fullName?: string } | string | null) {
  if (typeof actor === 'string') return actor
  return actor?.name || actor?.fullName || ''
}

export function TimekeepingPage({
  canSubmitOwn,
  canSubmitForOthers,
  canReviewTimesheets,
  canCorrect,
  employeeId: viewerEmployeeId,
}: {
  canSubmitOwn: boolean
  canSubmitForOthers: boolean
  canReviewTimesheets: boolean
  canCorrect: boolean
  employeeId: string | null
}) {
  const [month, setMonth] = useState(initialMonth)
  const [data, setData] = useState<TimekeepingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [workDate, setWorkDate] = useState(() => initialDate(initialMonth()))
  const [type, setType] = useState<EntryType>('REGULAR')
  const [hours, setHours] = useState('8')
  const [note, setNote] = useState('')
  const [zeroHoursConfirmed, setZeroHoursConfirmed] = useState<Record<string, boolean>>({})
  const [workingTimesheetId, setWorkingTimesheetId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [year, selectedMonth] = month.split('-')
    const response = await fetch(`/api/time-entries?year=${year}&month=${Number(selectedMonth)}`)
    const payload = await response.json()
    if (!response.ok) {
      setError(payload.error?.message || 'Не удалось загрузить табель')
      setLoading(false)
      return
    }
    setData(payload.data)
    setLoading(false)
  }, [month])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const selectedProject = useMemo(
    () => data?.projects.find((project) => project.id === projectId),
    [data?.projects, projectId],
  )
  const selectedTimesheets = data?.timesheets || []
  const isPeriodClosed = data?.period.status === 'CLOSED'
  const isEditable = !isPeriodClosed
  const employeeHours = useMemo(() => {
    const totals = new Map<string, number>()
    for (const entry of data?.entries || []) {
      totals.set(entry.employee.id, (totals.get(entry.employee.id) || 0) + Number(entry.hours))
    }
    return totals
  }, [data?.entries])

  const submitTimesheet = async (targetEmployeeId: string) => {
    const hoursForEmployee = employeeHours.get(targetEmployeeId) || 0
    const confirmsZero = hoursForEmployee === 0
    if (confirmsZero && !zeroHoursConfirmed[targetEmployeeId]) {
      setError('Подтвердите, что за месяц нет отработанных часов.')
      return
    }
    setWorkingTimesheetId(targetEmployeeId)
    setError('')
    const [year, selectedMonth] = month.split('-').map(Number)
    const response = await fetch('/api/timekeeping/timesheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: targetEmployeeId,
        year,
        month: selectedMonth,
        zeroHoursConfirmed: confirmsZero && Boolean(zeroHoursConfirmed[targetEmployeeId]),
      }),
    })
    const payload = await response.json()
    setWorkingTimesheetId('')
    if (!response.ok) {
      setError(payload.error?.message || 'Не удалось отправить табель на согласование')
      return
    }
    setZeroHoursConfirmed((previous) => ({ ...previous, [targetEmployeeId]: false }))
    await load()
  }

  const decideTimesheet = async (id: string, decision: 'APPROVE' | 'RETURN') => {
    const reason = decision === 'RETURN'
      ? window.prompt('Укажите причину возврата табеля на исправление:')?.trim()
      : undefined
    if (decision === 'RETURN' && !reason) return
    setWorkingTimesheetId(id)
    setError('')
    const response = await fetch(`/api/timekeeping/timesheets/${id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, ...(reason ? { reason } : {}) }),
    })
    const payload = await response.json()
    setWorkingTimesheetId('')
    if (!response.ok) {
      setError(payload.error?.message || 'Не удалось обработать табель')
      return
    }
    await load()
  }

  const openCreate = () => {
    if (!isEditable) return
    setEmployeeId(
      (canSubmitForOthers ? data?.employees[0]?.id : viewerEmployeeId) || '',
    )
    setProjectId('')
    setTaskId('')
    setWorkDate(initialDate(month))
    setType('REGULAR')
    setHours('8')
    setNote('')
    setDialogOpen(true)
  }

  const submit = async () => {
    if (!isEditable) return
    setSaving(true)
    setError('')
    const approvedSheet = selectedTimesheets.find((sheet) => sheet.employeeId === employeeId && sheet.status === 'APPROVED')
    const correctionReason = approvedSheet && canCorrect
      ? window.prompt('Укажите причину корректировки утверждённого табеля:')?.trim()
      : undefined
    if (approvedSheet && (!canCorrect || !correctionReason)) {
      setSaving(false)
      return
    }
    const response = await fetch('/api/time-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId,
        projectId: projectId || null,
        taskId: taskId || null,
        workDate,
        type,
        hours: Number(hours),
        note: note || null,
        ...(correctionReason ? { correctionReason } : {}),
      }),
    })
    const payload = await response.json()
    setSaving(false)
    if (!response.ok) {
      setError(payload.error?.message || 'Не удалось сохранить запись')
      return
    }
    setDialogOpen(false)
    await load()
  }

  const remove = async (entry: TimeEntry) => {
    const sheet = selectedTimesheets.find((item) => item.employeeId === entry.employee.id)
    const reason = sheet?.status === 'APPROVED'
      ? window.prompt('Укажите причину корректировки утверждённого табеля:')?.trim()
      : undefined
    if (sheet?.status === 'APPROVED' && (!canCorrect || !reason)) return
    const response = await fetch(`/api/time-entries/${entry.id}`, {
      method: 'DELETE',
      ...(reason ? {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correctionReason: reason }),
      } : {}),
    })
    if (!response.ok) {
      const payload = await response.json()
      setError(payload.error?.message || 'Не удалось удалить запись')
      return
    }
    await load()
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Табель рабочего времени</h1>
          <p className="mt-1 text-muted-foreground">
            Часы, отсутствия, переработки и стоимость труда по проектам
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="timekeeping-month">Месяц</Label>
            <Input
              id="timekeeping-month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </div>
          {(canSubmitForOthers || canSubmitOwn) && (
            <Button onClick={openCreate} disabled={!isEditable || !(data?.employees.length || viewerEmployeeId)}>
              <Plus className="mr-2 h-4 w-4" />
              Добавить
            </Button>
          )}
        </div>
      </div>

      {isPeriodClosed && (
        <p role="status" className="rounded-md border bg-muted p-3 text-sm">
          Расчётный месяц закрыт. Записи и отправка табелей недоступны.
        </p>
      )}

      <Card>
        <CardHeader><CardTitle>Согласование табелей</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {data?.employees.filter((employee) =>
            canReviewTimesheets || canSubmitForOthers || (canSubmitOwn && employee.id === viewerEmployeeId),
          ).map((employee) => {
            const sheet = selectedTimesheets.find((item) => item.employeeId === employee.id)
            const employeeHoursForMonth = employeeHours.get(employee.id) || 0
            const canSubmit = isEditable && (!sheet || sheet.status === 'RETURNED' || sheet.status === 'DRAFT')
            const canSubmitThisEmployee = employee.id === viewerEmployeeId
              ? canSubmitOwn
              : canSubmitForOthers
            return (
              <div key={employee.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="font-medium">{employee.fullName}</div>
                  <div className="text-sm text-muted-foreground">
                    {employee.code} · {employeeHoursForMonth.toLocaleString('ru-RU')} ч
                    {employee.department ? ` · ${employee.department}` : ''}
                  </div>
                  {sheet?.decisionReason && <div className="mt-1 text-sm text-destructive">Причина возврата: {sheet.decisionReason}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={sheet?.status === 'APPROVED' ? 'default' : 'outline'}>
                    {sheet ? timesheetStatusLabel(sheet.status) : 'Не отправлен'}
                  </Badge>
                  {sheet && actorName(sheet.submittedBy) && (
                    <span className="text-xs text-muted-foreground">Отправил: {actorName(sheet.submittedBy)}</span>
                  )}
                  {sheet && actorName(sheet.decidedBy) && (
                    <span className="text-xs text-muted-foreground">Решение: {actorName(sheet.decidedBy)}</span>
                  )}
                  {canSubmit && canSubmitThisEmployee && (
                    <>
                      {employeeHoursForMonth === 0 && (
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={Boolean(zeroHoursConfirmed[employee.id])} onChange={(event) => setZeroHoursConfirmed((previous) => ({ ...previous, [employee.id]: event.target.checked }))} />
                          Подтверждаю нулевые часы
                        </label>
                      )}
                      <Button size="sm" onClick={() => void submitTimesheet(employee.id)} disabled={workingTimesheetId === employee.id || (employeeHoursForMonth === 0 && !zeroHoursConfirmed[employee.id])}>
                        <Send className="mr-2 h-4 w-4" />
                        {workingTimesheetId === employee.id ? 'Отправка…' : 'Отправить'}
                      </Button>
                    </>
                  )}
                  {canReviewTimesheets && sheet?.status === 'SUBMITTED' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => void decideTimesheet(sheet.id, 'RETURN')} disabled={workingTimesheetId === sheet.id}>
                        <Undo2 className="mr-2 h-4 w-4" /> Вернуть
                      </Button>
                      <Button size="sm" onClick={() => void decideTimesheet(sheet.id, 'APPROVE')} disabled={workingTimesheetId === sheet.id}>
                        <Check className="mr-2 h-4 w-4" /> Утвердить
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          {!loading && !data?.employees.some((employee) => canReviewTimesheets || canSubmitForOthers || (canSubmitOwn && employee.id === viewerEmployeeId)) && (
            <p className="text-sm text-muted-foreground">Нет доступных для отправки табелей.</p>
          )}
        </CardContent>
      </Card>

      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Норма месяца</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{data?.normativeHours || 0} ч</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Учтено часов</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">
            {data?.entries.reduce((sum, entry) => sum + Number(entry.hours), 0) || 0} ч
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Стоимость по проектам</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">
            {currency.format(data?.summaries.reduce((sum, row) => sum + row.projectCost, 0) || 0)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Сводка по сотрудникам</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Сотрудник</TableHead>
                <TableHead>Ставка</TableHead>
                <TableHead>Работа</TableHead>
                <TableHead>Отпуск</TableHead>
                <TableHead>Больничный</TableHead>
                <TableHead>Командировка</TableHead>
                <TableHead>Переработка</TableHead>
                <TableHead>Расчётная зарплата</TableHead>
                <TableHead>Проектные затраты</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.summaries.map((row) => (
                <TableRow key={row.employeeId}>
                  <TableCell>
                    <div className="font-medium">{row.employeeName}</div>
                    <div className="text-xs text-muted-foreground">{row.department}</div>
                  </TableCell>
                  <TableCell>{row.rate.toLocaleString('ru-RU')}</TableCell>
                  <TableCell>{row.regularHours} ч</TableCell>
                  <TableCell>{row.vacationHours} ч</TableCell>
                  <TableCell>{row.sickHours} ч</TableCell>
                  <TableCell>{row.tripHours} ч</TableCell>
                  <TableCell>{row.overtimeHours} ч</TableCell>
                  <TableCell>{currency.format(row.calculatedSalary)}</TableCell>
                  <TableCell>{currency.format(row.projectCost)}</TableCell>
                </TableRow>
              ))}
              {!loading && !data?.summaries.length && (
                <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">Нет записей за выбранный месяц</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Записи месяца</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Сотрудник</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Часы</TableHead>
                <TableHead>Проект / задача</TableHead>
                <TableHead>Комментарий</TableHead>
                {(canSubmitForOthers || canCorrect) && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{new Date(entry.workDate).toLocaleDateString('ru-RU')}</TableCell>
                  <TableCell>
                    <div className="font-medium">{entry.employee.fullName}</div>
                    <div className="text-xs text-muted-foreground">{entry.employee.code}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{TIME_ENTRY_TYPE_LABELS[entry.type]}</Badge></TableCell>
                  <TableCell>{Number(entry.hours).toLocaleString('ru-RU')} ч</TableCell>
                  <TableCell>
                    <div>{entry.project ? `${entry.project.code} · ${entry.project.name}` : 'Без проекта'}</div>
                    {entry.task && <div className="text-xs text-muted-foreground">{entry.task.name}</div>}
                  </TableCell>
                  <TableCell>{entry.note || '—'}</TableCell>
                  {(canSubmitForOthers || canCorrect) && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Удалить запись"
                        onClick={() => void remove(entry)}
                        disabled={!isEditable || (selectedTimesheets.some((sheet) => sheet.employeeId === entry.employee.id && sheet.status === 'APPROVED') && !canCorrect)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!loading && !data?.entries.length && (
                <TableRow><TableCell colSpan={(canSubmitForOthers || canCorrect) ? 7 : 6} className="h-24 text-center text-muted-foreground">Нет записей</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая запись табеля</DialogTitle>
            <DialogDescription>Укажите рабочее время или причину отсутствия.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="time-employee">Сотрудник</Label>
              <select id="time-employee" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
                {data?.employees.filter((employee) => canSubmitForOthers || employee.id === viewerEmployeeId).map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} · {employee.code}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="time-date">Дата</Label>
                <Input id="time-date" type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time-hours">Часы</Label>
                <Input id="time-hours" type="number" min="0.25" max="24" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="time-type">Тип</Label>
              <select id="time-type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as EntryType)}>
                {Object.entries(TIME_ENTRY_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="time-project">Проект</Label>
              <select id="time-project" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={projectId} onChange={(event) => { setProjectId(event.target.value); setTaskId('') }}>
                <option value="">Без проекта</option>
                {data?.projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
              </select>
            </div>
            {selectedProject && (
              <div className="space-y-2">
                <Label htmlFor="time-task">Задача</Label>
                <select id="time-task" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={taskId} onChange={(event) => setTaskId(event.target.value)}>
                  <option value="">Без задачи</option>
                  {selectedProject.tasksList.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="time-note">Комментарий</Label>
              <Input id="time-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Что было сделано" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={() => void submit()} disabled={saving || !isEditable || !employeeId || !workDate || !hours}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
