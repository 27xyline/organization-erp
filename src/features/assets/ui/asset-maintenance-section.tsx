'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, CheckCircle2, CirclePlay, Plus, XCircle } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_TYPE_LABELS,
} from '../contracts/maintenance'

type MaintenanceType = keyof typeof MAINTENANCE_TYPE_LABELS
type MaintenanceStatus = keyof typeof MAINTENANCE_STATUS_LABELS

interface MaintenanceRecord {
  id: string
  type: MaintenanceType
  status: MaintenanceStatus
  title: string
  description: string | null
  scheduledDate: string
  startedAt: string | null
  completedAt: string | null
  nextDueDate: string | null
  provider: string | null
  cost: string
  result: string | null
}

const currency = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' })

function futureDate(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export function AssetMaintenanceSection({
  assetId,
  canManage,
}: {
  assetId: string
  canManage: boolean
}) {
  const router = useRouter()
  const [records, setRecords] = useState<MaintenanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [completeRecord, setCompleteRecord] = useState<MaintenanceRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [type, setType] = useState<MaintenanceType>('CALIBRATION')
  const [title, setTitle] = useState('')
  const [scheduledDate, setScheduledDate] = useState(() => futureDate(30))
  const [nextDueDate, setNextDueDate] = useState('')
  const [provider, setProvider] = useState('')
  const [cost, setCost] = useState('0')
  const [description, setDescription] = useState('')
  const [result, setResult] = useState('')
  const [completionNextDueDate, setCompletionNextDueDate] = useState('')

  const load = useCallback(async () => {
    const response = await fetch(`/api/assets/${assetId}/maintenance`)
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setError(payload?.error?.message || 'Не удалось загрузить обслуживание')
      setLoading(false)
      return
    }
    setRecords(payload.data)
    setLoading(false)
  }, [assetId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const totalCost = useMemo(
    () => records.reduce((sum, record) => sum + Number(record.cost), 0),
    [records],
  )

  const openCreate = () => {
    setType('CALIBRATION')
    setTitle('Плановая поверка')
    setScheduledDate(futureDate(30))
    setNextDueDate('')
    setProvider('')
    setCost('0')
    setDescription('')
    setError('')
    setCreateOpen(true)
  }

  const create = async () => {
    setSaving(true)
    const response = await fetch(`/api/assets/${assetId}/maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        title,
        scheduledDate,
        nextDueDate: nextDueDate || null,
        provider: provider || null,
        cost: Number(cost),
        description: description || null,
      }),
    })
    const payload = await response.json().catch(() => null)
    setSaving(false)
    if (!response.ok) {
      setError(payload?.error?.message || 'Не удалось создать мероприятие')
      return
    }
    setCreateOpen(false)
    await load()
  }

  const update = async (
    record: MaintenanceRecord,
    body: Record<string, unknown>,
  ) => {
    setSaving(true)
    const response = await fetch(`/api/assets/${assetId}/maintenance/${record.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => null)
    setSaving(false)
    if (!response.ok) {
      setError(payload?.error?.message || 'Не удалось обновить мероприятие')
      return false
    }
    await load()
    router.refresh()
    return true
  }

  const openComplete = (record: MaintenanceRecord) => {
    setResult('')
    setCompletionNextDueDate(record.nextDueDate?.slice(0, 10) || '')
    setCompleteRecord(record)
  }

  const complete = async () => {
    if (!completeRecord) return
    const done = await update(completeRecord, {
      status: 'COMPLETED',
      result: result || null,
      nextDueDate: completionNextDueDate || null,
    })
    if (done) setCompleteRecord(null)
  }

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Обслуживание и поверки
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Плановые осмотры, поверки, ремонт и история затрат · {currency.format(totalCost)}
          </p>
        </div>
        {canManage && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Запланировать</Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {records.map((record) => {
          const overdue =
            record.status === 'PLANNED' &&
            new Date(record.scheduledDate) < new Date(new Date().toDateString())
          return (
            <div key={record.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{record.title}</p>
                    <Badge variant="outline">{MAINTENANCE_TYPE_LABELS[record.type]}</Badge>
                    <Badge variant={overdue ? 'destructive' : 'secondary'}>
                      {overdue ? 'Просрочено' : MAINTENANCE_STATUS_LABELS[record.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {new Date(record.scheduledDate).toLocaleDateString('ru-RU')}
                    {record.provider ? ` · ${record.provider}` : ''}
                    {Number(record.cost) ? ` · ${currency.format(Number(record.cost))}` : ''}
                  </p>
                  {record.description && <p className="mt-2 text-sm">{record.description}</p>}
                  {record.result && <p className="mt-2 text-sm"><span className="font-medium">Результат:</span> {record.result}</p>}
                  {record.nextDueDate && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Следующий срок: {new Date(record.nextDueDate).toLocaleDateString('ru-RU')}
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    {record.status === 'PLANNED' && (
                      <Button size="sm" variant="outline" onClick={() => void update(record, { status: 'IN_PROGRESS' })} disabled={saving}>
                        <CirclePlay className="mr-1 h-4 w-4" />Начать
                      </Button>
                    )}
                    {record.status === 'IN_PROGRESS' && (
                      <Button size="sm" onClick={() => openComplete(record)} disabled={saving}>
                        <CheckCircle2 className="mr-1 h-4 w-4" />Завершить
                      </Button>
                    )}
                    {(record.status === 'PLANNED' || record.status === 'IN_PROGRESS') && (
                      <Button size="sm" variant="ghost" onClick={() => void update(record, { status: 'CANCELED' })} disabled={saving}>
                        <XCircle className="mr-1 h-4 w-4" />Отменить
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {!loading && !records.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">Мероприятия ещё не запланированы</p>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Запланировать обслуживание</DialogTitle>
            <DialogDescription>Создайте поверку, осмотр, ремонт или сервисное мероприятие.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="maintenance-type">Тип</Label>
              <select id="maintenance-type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as MaintenanceType)}>
                {Object.entries(MAINTENANCE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maintenance-title">Название</Label>
              <Input id="maintenance-title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="maintenance-date">Дата</Label>
                <Input id="maintenance-date" type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maintenance-next-date">Следующий срок</Label>
                <Input id="maintenance-next-date" type="date" value={nextDueDate} onChange={(event) => setNextDueDate(event.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="maintenance-provider">Исполнитель</Label>
                <Input id="maintenance-provider" value={provider} onChange={(event) => setProvider(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maintenance-cost">Стоимость</Label>
                <Input id="maintenance-cost" type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maintenance-description">Описание</Label>
              <Textarea id="maintenance-description" value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button onClick={() => void create()} disabled={saving || !title || !scheduledDate}>
              {saving ? 'Сохранение…' : 'Запланировать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(completeRecord)} onOpenChange={(open) => !open && setCompleteRecord(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Завершить мероприятие</DialogTitle>
            <DialogDescription>Зафиксируйте результат и следующий срок обслуживания.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="maintenance-result">Результат</Label>
              <Textarea id="maintenance-result" value={result} onChange={(event) => setResult(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maintenance-completion-next">Следующий срок</Label>
              <Input id="maintenance-completion-next" type="date" value={completionNextDueDate} onChange={(event) => setCompletionNextDueDate(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteRecord(null)}>Отмена</Button>
            <Button onClick={() => void complete()} disabled={saving}>
              {saving ? 'Сохранение…' : 'Завершить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
