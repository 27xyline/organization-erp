'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Archive, BookmarkPlus, Check, ChevronLeft, ChevronRight, CircleX, Loader2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
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

interface ApprovalTemplate {
  id: string
  name: string
  steps: Array<{ name: string; approverId: string }>
  isActive: boolean
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
const PAGE_SIZE = 20

interface ApprovalPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export function ApprovalsPageClient({
  currentUserId,
  canCreate,
  canDecide,
  canCancel,
  canManageTemplates,
}: {
  currentUserId: string
  canCreate: boolean
  canDecide: boolean
  canCancel: boolean
  canManageTemplates: boolean
}) {
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [pagination, setPagination] = useState<ApprovalPagination>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  })
  const [page, setPage] = useState(1)
  const [approvers, setApprovers] = useState<ApproverOption[]>([])
  const [templates, setTemplates] = useState<ApprovalTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [templateMessage, setTemplateMessage] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templateBusyId, setTemplateBusyId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [steps, setSteps] = useState([emptyStep()])

  const load = useCallback(async (targetPage = page) => {
    setLoading(true)
    const response = await fetch(`/api/approvals?page=${targetPage}&pageSize=${PAGE_SIZE}`)
    const body = await response.json().catch(() => ({}))
    setLoading(false)
    if (!response.ok) {
      setMessage(body.error?.message || 'Не удалось загрузить согласования')
      return
    }
    setItems(body.data)
    setPagination(body.pagination)
  }, [page])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    if (canCreate) {
      void fetch('/api/approvals/options')
        .then((response) => response.json())
        .then((body) => setApprovers(body.data || []))
        .catch(() => setApprovers([]))
    }
    if (canCreate || canManageTemplates) {
      void fetch('/api/approvals/templates')
        .then((response) => response.json())
        .then((body) => setTemplates(Array.isArray(body.data) ? body.data : []))
        .catch(() => setTemplates([]))
    }
    return () => window.clearTimeout(timer)
  }, [canCreate, canManageTemplates, load])

  function applyTemplate(templateId: string) {
    const template = templates.find((candidate) => candidate.id === templateId && candidate.isActive)
    setEditingTemplateId(null)
    setSelectedTemplateId(template?.id || '')
    if (template) setSteps(template.steps.map((step) => ({ ...step })))
    else setSteps([emptyStep()])
  }

  async function saveTemplate() {
    setMessage(null)
    setTemplateMessage(null)
    setTemplateBusyId('create')
    try {
      const response = await fetch(
        editingTemplateId
          ? `/api/approvals/templates/${editingTemplateId}`
          : '/api/approvals/templates',
        {
          method: editingTemplateId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: templateName, steps }),
        },
      )
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        const errorMessage = body.error?.message || 'Не удалось сохранить шаблон маршрута'
        setTemplateMessage(errorMessage)
        setMessage(errorMessage)
        return
      }
      setTemplates((current) => {
        const next = editingTemplateId
          ? current.map((template) => template.id === editingTemplateId ? body.data : template)
          : [...current, body.data]
        return next.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      })
      if (editingTemplateId) {
        setEditingTemplateId(null)
        setSelectedTemplateId('')
        setTemplateName('')
        setDialogOpen(false)
        setTemplateMessage('Шаблон маршрута обновлён')
        setMessage('Шаблон маршрута обновлён')
      } else {
        setTemplateName('')
        setSelectedTemplateId(body.data.id)
        setTemplateMessage('Шаблон маршрута сохранён')
        setMessage('Шаблон маршрута сохранён')
      }
    } catch {
      setTemplateMessage('Не удалось сохранить шаблон маршрута')
      setMessage('Не удалось сохранить шаблон маршрута')
    } finally {
      setTemplateBusyId(null)
    }
  }

  async function setTemplateActive(template: ApprovalTemplate, isActive: boolean) {
    setMessage(null)
    setTemplateMessage(null)
    setTemplateBusyId(template.id)
    try {
      const response = await fetch(`/api/approvals/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        const errorMessage = body.error?.message || 'Не удалось изменить шаблон маршрута'
        setTemplateMessage(errorMessage)
        setMessage(errorMessage)
        return
      }
      setTemplates((current) => current.map((candidate) =>
        candidate.id === template.id ? body.data : candidate
      ))
      if (!isActive && selectedTemplateId === template.id) {
        setSelectedTemplateId('')
      }
      if (!isActive && editingTemplateId === template.id) {
        setEditingTemplateId(null)
        setTemplateName('')
        setDialogOpen(false)
      }
      const successMessage = isActive ? 'Шаблон возвращён в работу' : 'Шаблон перемещён в архив'
      setTemplateMessage(successMessage)
      setMessage(successMessage)
    } catch {
      setTemplateMessage('Не удалось изменить шаблон маршрута')
      setMessage('Не удалось изменить шаблон маршрута')
    } finally {
      setTemplateBusyId(null)
    }
  }

  function editTemplate(template: ApprovalTemplate) {
    setTemplateMessage(null)
    setEditingTemplateId(template.id)
    setSelectedTemplateId(template.id)
    setTemplateName(template.name)
    setSteps(template.steps.map((step) => ({ ...step })))
    setTemplatesOpen(false)
    setDialogOpen(true)
  }

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
    setSelectedTemplateId('')
    setTemplateName('')
    setEditingTemplateId(null)
    setMessage('Согласование запущено')
    if (page === 1) await load(1)
    else setPage(1)
  }

  async function mutate(id: string, action: 'APPROVE' | 'REJECT' | 'CANCEL') {
    let comment: string | undefined
    if (action === 'REJECT') {
      const answer = window.prompt('Причина отклонения (необязательно)')
      if (answer === null) return
      comment = answer.trim() || undefined
    }
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
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open)
              if (open) setTemplateMessage(null)
              if (!open && editingTemplateId) {
                setEditingTemplateId(null)
                setTemplateName('')
                setSelectedTemplateId('')
              }
            }}
          >
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Запустить</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <form
                onSubmit={editingTemplateId ? (event) => event.preventDefault() : createApproval}
                className="grid gap-4"
              >
                <DialogHeader>
                  <DialogTitle>
                    {editingTemplateId ? 'Изменение шаблона маршрута' : 'Новое согласование'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingTemplateId
                      ? 'Обновите имя и последовательность этапов. Это не запустит новое согласование.'
                      : 'Укажите тему и порядок согласующих.'}
                  </DialogDescription>
                </DialogHeader>
                {templateMessage && (
                  <div role="status" className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    {templateMessage}
                  </div>
                )}
                {editingTemplateId ? (
                  <Input
                    aria-label="Название шаблона"
                    placeholder="Название шаблона"
                    maxLength={120}
                    required
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                  />
                ) : (
                  <>
                    <label className="grid gap-1 text-sm">
                      Шаблон маршрута
                      <select
                        aria-label="Шаблон маршрута"
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={selectedTemplateId}
                        onChange={(event) => applyTemplate(event.target.value)}
                      >
                        <option value="">Без шаблона — настроить вручную</option>
                        {templates.filter((template) => template.isActive).map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                    </label>
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
                  </>
                )}
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
                        onChange={(event) => {
                          setSelectedTemplateId('')
                          setSteps((values) => values.map((value, stepIndex) =>
                            stepIndex === index ? { ...value, name: event.target.value } : value
                          ))
                        }}
                      />
                      <select
                        aria-label={`Согласующий ${index + 1}`}
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        required
                        value={step.approverId}
                        onChange={(event) => {
                          setSelectedTemplateId('')
                          setSteps((values) => values.map((value, stepIndex) =>
                            stepIndex === index ? { ...value, approverId: event.target.value } : value
                          ))
                        }}
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
                        onClick={() => {
                          setSelectedTemplateId('')
                          setSteps((values) => values.filter((_, stepIndex) => stepIndex !== index))
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={steps.length >= 20}
                      onClick={() => {
                        setSelectedTemplateId('')
                        setSteps((values) => [...values, emptyStep()])
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />Добавить этап
                    </Button>
                    {canManageTemplates && !editingTemplateId && (
                      <Input
                        aria-label="Название нового шаблона"
                        placeholder="Название нового шаблона"
                        maxLength={120}
                        value={templateName}
                        onChange={(event) => setTemplateName(event.target.value)}
                      />
                    )}
                    {canManageTemplates && !editingTemplateId && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!templateName.trim() || steps.some((step) => !step.name.trim() || !step.approverId) || templateBusyId !== null || busyId !== null}
                        onClick={() => void saveTemplate()}
                      >
                        {templateBusyId === 'create'
                          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          : <BookmarkPlus className="mr-2 h-4 w-4" />}
                        Сохранить маршрут
                      </Button>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  {editingTemplateId ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={templateBusyId !== null}
                        onClick={() => {
                          setEditingTemplateId(null)
                          setTemplateName('')
                          setSelectedTemplateId('')
                          setDialogOpen(false)
                        }}
                      >
                        Отмена
                      </Button>
                      <Button
                        type="button"
                        disabled={
                          !templateName.trim()
                          || steps.some((step) => !step.name.trim() || !step.approverId)
                          || templateBusyId !== null
                        }
                        onClick={() => void saveTemplate()}
                      >
                        {templateBusyId === 'create'
                          && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Сохранить шаблон
                      </Button>
                    </>
                  ) : (
                    <Button type="submit" disabled={busyId === 'create' || templateBusyId !== null}>
                      {busyId === 'create' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Запустить
                    </Button>
                  )}
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
        {canManageTemplates && (
          <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline">Шаблоны маршрутов</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Шаблоны маршрутов</DialogTitle>
                <DialogDescription>
                  Шаблоны доступны создателям согласований. Архивные можно восстановить.
                </DialogDescription>
              </DialogHeader>
              {templateMessage && (
                <div role="status" className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  {templateMessage}
                </div>
              )}
              {templates.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Шаблонов пока нет. Создайте согласование и сохраните его маршрут.
                </p>
              ) : (
                <div className="grid gap-2">
                  {templates.map((template) => (
                    <div key={template.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0">
                        <p className="font-medium">{template.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {template.steps.length} {template.steps.length === 1 ? 'этап' : 'этапа'}
                          {!template.isActive && ' · в архиве'}
                        </p>
                      </div>
                      {canCreate && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label={`Изменить маршрут ${template.name}`}
                          disabled={!template.isActive || templateBusyId !== null}
                          onClick={() => editTemplate(template)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />Изменить
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={templateBusyId !== null}
                        aria-label={template.isActive ? `Архивировать ${template.name}` : `Восстановить ${template.name}`}
                        onClick={() => void setTemplateActive(template, !template.isActive)}
                      >
                        {templateBusyId === template.id
                          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          : template.isActive
                            ? <Archive className="mr-2 h-4 w-4" />
                            : <RotateCcw className="mr-2 h-4 w-4" />}
                        {template.isActive ? 'В архив' : 'Восстановить'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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

      {!loading && pagination.totalPages > 1 && (
        <nav
          aria-label="Навигация по страницам согласований"
          className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
        >
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Страница {pagination.page} из {pagination.totalPages} · всего {pagination.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="Предыдущая страница"
              disabled={pagination.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />Назад
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="Следующая страница"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
            >
              Далее<ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </nav>
      )}
    </main>
  )
}
