'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, CircleX, Loader2, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type ApprovalStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
type StepStatus = 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED'

interface ApprovalItem {
  id: string
  title: string
  description: string | null
  status: ApprovalStatus
  currentStep: number
  dueAt: string | null
  requestedById: string
  requestedBy: { id: string; name: string }
  document: { id: string; title: string; status: string } | null
  project: { id: string; code: string; name: string } | null
  steps: Array<{
    id: string
    sequence: number
    name: string
    status: StepStatus
    comment: string | null
    approverId: string
    approver: { id: string; name: string }
  }>
}

interface ApproverOption {
  id: string
  name: string
  username: string
}

const statusLabels: Record<ApprovalStatus, string> = {
  DRAFT: 'Черновик',
  PENDING: 'На согласовании',
  APPROVED: 'Согласовано',
  REJECTED: 'Отклонено',
  CANCELLED: 'Отменено',
}

const stepLabels: Record<StepStatus, string> = {
  WAITING: 'Ожидает',
  PENDING: 'Текущий',
  APPROVED: 'Согласовано',
  REJECTED: 'Отклонено',
  SKIPPED: 'Пропущено',
}

const emptyStep = () => ({ name: '', approverId: '' })

export function ApprovalsPageClient({
  currentUserId,
  canCreate,
  canDecide,
  canCancel,
}: {
  currentUserId: string
  canCreate: boolean
  canDecide: boolean
  canCancel: boolean
}) {
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [approvers, setApprovers] = useState<ApproverOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [steps, setSteps] = useState([emptyStep()])

  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch('/api/approvals?pageSize=100')
    const body = await response.json().catch(() => ({}))
    setLoading(false)
    if (!response.ok) {
      setMessage(body.error?.message || 'Не удалось загрузить согласования')
      return
    }
    setItems(body.data)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    if (canCreate) {
      void fetch('/api/approvals/options')
        .then((response) => response.json())
        .then((body) => setApprovers(body.data || []))
        .catch(() => setApprovers([]))
    }
    return () => window.clearTimeout(timer)
  }, [canCreate, load])

  async function createApproval(event: FormEvent) {
    event.preventDefault()
    setMessage(null)
    setBusyId('create')
    const response = await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: description || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        steps,
      }),
    })
    const body = await response.json().catch(() => ({}))
    setBusyId(null)
    if (!response.ok) {
      setMessage(body.error?.message || 'Не удалось создать согласование')
      return
    }
    setDialogOpen(false)
    setTitle('')
    setDescription('')
    setDueAt('')
    setSteps([emptyStep()])
    setMessage('Согласование запущено')
    await load()
  }

  async function mutate(id: string, action: 'APPROVE' | 'REJECT' | 'CANCEL') {
    const comment = action === 'REJECT'
      ? window.prompt('Причина отклонения (необязательно)') ?? undefined
      : undefined
    setMessage(null)
    setBusyId(id)
    const response = await fetch(
      action === 'CANCEL' ? `/api/approvals/${id}/cancel` : `/api/approvals/${id}/decision`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(action === 'CANCEL'
          ? {}
          : { body: JSON.stringify({ decision: action, comment }) }),
      },
    )
    const body = await response.json().catch(() => ({}))
    setBusyId(null)
    if (!response.ok) {
      setMessage(body.error?.message || 'Не удалось сохранить решение')
      return
    }
    setMessage(action === 'CANCEL' ? 'Согласование отменено' : 'Решение сохранено')
    await load()
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Согласования</h1>
          <p className="mt-1 text-muted-foreground">
            Последовательные маршруты согласования документов и решений.
          </p>
        </div>
        {canCreate && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Запустить</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <form onSubmit={createApproval} className="grid gap-4">
                <DialogHeader>
                  <DialogTitle>Новое согласование</DialogTitle>
                  <DialogDescription>Укажите тему и порядок согласующих.</DialogDescription>
                </DialogHeader>
                <Input
                  aria-label="Тема согласования"
                  placeholder="Тема согласования"
                  minLength={3}
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <Textarea
                  aria-label="Описание согласования"
                  placeholder="Описание"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <label className="grid gap-1 text-sm">
                  Срок
                  <Input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(event) => setDueAt(event.target.value)}
                  />
                </label>
                <div className="grid gap-3">
                  <div className="font-medium">Маршрут</div>
                  {steps.map((step, index) => (
                    <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]">
                      <Input
                        aria-label={`Название этапа ${index + 1}`}
                        placeholder={`Этап ${index + 1}`}
                        minLength={2}
                        required
                        value={step.name}
                        onChange={(event) => setSteps((values) => values.map((value, stepIndex) =>
                          stepIndex === index ? { ...value, name: event.target.value } : value
                        ))}
                      />
                      <select
                        aria-label={`Согласующий ${index + 1}`}
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        required
                        value={step.approverId}
                        onChange={(event) => setSteps((values) => values.map((value, stepIndex) =>
                          stepIndex === index ? { ...value, approverId: event.target.value } : value
                        ))}
                      >
                        <option value="">Выберите сотрудника</option>
                        {approvers.map((approver) => (
                          <option
                            key={approver.id}
                            value={approver.id}
                            disabled={steps.some((value, stepIndex) =>
                              stepIndex !== index && value.approverId === approver.id
                            )}
                          >
                            {approver.name} ({approver.username})
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Удалить этап ${index + 1}`}
                        disabled={steps.length === 1}
                        onClick={() => setSteps((values) => values.filter((_, stepIndex) => stepIndex !== index))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={steps.length >= 20}
                    onClick={() => setSteps((values) => [...values, emptyStep()])}
                  >
                    <Plus className="mr-2 h-4 w-4" />Добавить этап
                  </Button>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={busyId === 'create'}>
                    {busyId === 'create' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Запустить
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {message && (
        <div role="status" className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
          {message}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Загрузка…
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Согласований пока нет
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => {
            const currentStep = item.steps.find((step) =>
              step.sequence === item.currentStep && step.status === 'PENDING'
            )
            const canAct = canDecide && currentStep?.approverId === currentUserId
            return (
              <Card key={item.id}>
                <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                      <Badge variant={item.status === 'APPROVED' ? 'default' : 'secondary'}>
                        {statusLabels[item.status]}
                      </Badge>
                    </div>
                    <CardDescription className="mt-1">
                      Инициатор: {item.requestedBy.name}
                      {item.dueAt && ` · срок ${new Date(item.dueAt).toLocaleString('ru-RU')}`}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canAct && (
                      <>
                        <Button size="sm" disabled={busyId === item.id} onClick={() => mutate(item.id, 'APPROVE')}>
                          <Check className="mr-2 h-4 w-4" />Согласовать
                        </Button>
                        <Button size="sm" variant="destructive" disabled={busyId === item.id} onClick={() => mutate(item.id, 'REJECT')}>
                          <CircleX className="mr-2 h-4 w-4" />Отклонить
                        </Button>
                      </>
                    )}
                    {canCancel && item.requestedById === currentUserId && ['DRAFT', 'PENDING'].includes(item.status) && (
                      <Button size="sm" variant="outline" disabled={busyId === item.id} onClick={() => mutate(item.id, 'CANCEL')}>
                        Отменить
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {item.description && <p className="text-sm">{item.description}</p>}
                  {(item.document || item.project) && (
                    <p className="text-sm text-muted-foreground">
                      {item.document && `Документ: ${item.document.title}`}
                      {item.document && item.project && ' · '}
                      {item.project && `Проект: ${item.project.code} — ${item.project.name}`}
                    </p>
                  )}
                  <div className="grid gap-2 md:grid-cols-2">
                    {item.steps.map((step) => (
                      <div key={step.id} className="rounded-md border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{step.sequence}. {step.name}</span>
                          <Badge variant="outline">{stepLabels[step.status]}</Badge>
                        </div>
                        <div className="mt-1 text-muted-foreground">{step.approver.name}</div>
                        {step.comment && <div className="mt-2">{step.comment}</div>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </main>
  )
}
