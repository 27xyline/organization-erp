'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
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

export function TimekeepingPage({ canManage }: { canManage: boolean }) {
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

  const openCreate = () => {
    setEmployeeId(data?.employees[0]?.id || '')
    setProjectId('')
    setTaskId('')
    setWorkDate(initialDate(month))
    setType('REGULAR')
    setHours('8')
    setNote('')
    setDialogOpen(true)
  }

  const submit = async () => {
    setSaving(true)
    setError('')
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

  const remove = async (id: string) => {
    const response = await fetch(`/api/time-entries/${id}`, { method: 'DELETE' })
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
          {canManage && (
            <Button onClick={openCreate} disabled={!data?.employees.length}>
              <Plus className="mr-2 h-4 w-4" />
              Добавить
            </Button>
          )}
        </div>
      </div>

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
                {canManage && <TableHead className="w-12" />}
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
                  {canManage && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Удалить запись"
                        onClick={() => void remove(entry.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!loading && !data?.entries.length && (
                <TableRow><TableCell colSpan={canManage ? 7 : 6} className="h-24 text-center text-muted-foreground">Нет записей</TableCell></TableRow>
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
                {data?.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} · {employee.code}</option>)}
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
            <Button onClick={() => void submit()} disabled={saving || !employeeId || !workDate || !hours}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
