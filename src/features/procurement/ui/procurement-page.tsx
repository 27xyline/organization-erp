'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ClipboardCheck, FileText, PackageCheck, Plus, RefreshCw, Truck } from 'lucide-react'
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

type Status =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'CONTRACTED'
  | 'PARTIALLY_DELIVERED'
  | 'DELIVERED'
  | 'CAPITALIZED'
  | 'REJECTED'
  | 'CANCELLED'

interface ProcurementItem {
  id: string
  name: string
  quantity: number
  deliveredQuantity: number
  unit: string
  unitPrice: number
  group: { id: string; code: string; name: string } | null
}

interface Procurement {
  id: string
  number: string
  title: string
  description: string | null
  status: Status
  budgetLimit: number
  totalPlanned: number
  neededBy: string | null
  project: { id: string; code: string; name: string } | null
  document: { id: string; title: string; status: string } | null
  approvalRequest: { id: string; status: string; currentStep: number } | null
  requestedBy: { id: string; name: string }
  items: ProcurementItem[]
  contract: {
    id: string
    number: string
    amount: number
    signedAt: string
    deliveryDueAt: string
    supplier: { id: string; name: string; taxId: string | null }
    document: { id: string; title: string; status: string } | null
  } | null
  deliveries: Array<{
    id: string
    number: string
    receivedAt: string
    note: string | null
    document: { id: string; title: string; status: string } | null
    items: Array<{
      id: string
      quantity: number
      procurementItem: { id: string; name: string; unit: string; unitPrice: number }
      asset: { id: string; inventoryNumber: string; name: string } | null
    }>
  }>
}

interface Options {
  projects: Array<{ id: string; code: string; name: string }>
  suppliers: Array<{ id: string; name: string; taxId: string | null }>
  approvers: Array<{ id: string; name: string; username: string }>
  groups: Array<{ id: string; code: string; name: string }>
  mols: Array<{ id: string; code: string; fullName: string; storageLocation: string }>
  documents: Array<{ id: string; title: string; category: string; status: string; projectId: string | null }>
}

type DialogName = 'create' | 'supplier' | 'submit' | 'contract' | 'delivery' | 'capitalize' | 'details' | null
interface ProcurementSummary {
  active: number
  awaiting: number
  overdue: number
  budget: number
}
interface ProcurementPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}
const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' })
const date = (value: string | null) => value ? new Intl.DateTimeFormat('ru-RU').format(new Date(value)) : '—'

const labels: Record<Status, string> = {
  DRAFT: 'Черновик',
  SUBMITTED: 'На согласовании',
  APPROVED: 'Согласовано',
  CONTRACTED: 'Договор',
  PARTIALLY_DELIVERED: 'Частичная поставка',
  DELIVERED: 'Поставлено',
  CAPITALIZED: 'На учёте',
  REJECTED: 'Отклонено',
  CANCELLED: 'Отменено',
}

const emptyLine = () => ({ name: '', quantity: '1', unit: 'шт.', unitPrice: '', groupId: '' })

export function ProcurementPage({
  canCreate,
  canSubmit,
  canContract,
  canDeliver,
  canCapitalize,
  canManageSuppliers,
}: {
  canCreate: boolean
  canSubmit: boolean
  canContract: boolean
  canDeliver: boolean
  canCapitalize: boolean
  canManageSuppliers: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const search = searchParams.get('search') || ''
  const rawStatus = searchParams.get('status') || ''
  const status = Object.hasOwn(labels, rawStatus) ? rawStatus as Status : ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const [items, setItems] = useState<Procurement[]>([])
  const [options, setOptions] = useState<Options>({
    projects: [], suppliers: [], approvers: [], groups: [], mols: [], documents: [],
  })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [searchInput, setSearchInput] = useState(search)
  const [summary, setSummary] = useState<ProcurementSummary>({ active: 0, awaiting: 0, overdue: 0, budget: 0 })
  const [pagination, setPagination] = useState<ProcurementPagination>({ page: 1, pageSize: 25, total: 0, totalPages: 1 })
  const [dialog, setDialog] = useState<DialogName>(null)
  const [selected, setSelected] = useState<Procurement | null>(null)
  const [deliveryItemId, setDeliveryItemId] = useState('')
  const [lines, setLines] = useState([emptyLine()])

  const updateQuery = useCallback((updates: { search?: string | null; status?: Status | '' | null; page?: number | null }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (updates.search !== undefined) {
      if (updates.search) params.set('search', updates.search)
      else params.delete('search')
    }
    if (updates.status !== undefined) {
      if (updates.status) params.set('status', updates.status)
      else params.delete('status')
    }
    if (updates.page !== undefined) {
      if (updates.page && updates.page > 1) params.set('page', String(updates.page))
      else params.delete('page')
    }
    const query = params.toString()
    router.replace(query ? `/procurement?${query}` : '/procurement', { scroll: false })
  }, [router, searchParams])

  const load = useCallback(async () => {
    setLoading(true)
    const query = new URLSearchParams({ page: String(page), pageSize: '25' })
    if (search) query.set('search', search)
    if (status) query.set('status', status)
    const requestsResponse = await fetch(`/api/procurement?${query.toString()}`, { cache: 'no-store' })
    const requestsBody = await requestsResponse.json().catch(() => ({}))
    setLoading(false)
    if (!requestsResponse.ok) {
      setMessage(requestsBody.error?.message || 'Не удалось загрузить закупки')
      return
    }
    setItems(requestsBody.data || [])
    setSummary(requestsBody.summary || { active: 0, awaiting: 0, overdue: 0, budget: 0 })
    setPagination(requestsBody.pagination || { page, pageSize: 25, total: 0, totalPages: 1 })
    setMessage('')
  }, [page, search, status])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchInput(search), 0)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput !== search) updateQuery({ search: searchInput.trim() || null, page: 1 })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [search, searchInput, updateQuery])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/procurement/options', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => { if (!cancelled && body.data) setOptions(body.data) })
      .catch(() => { if (!cancelled) setMessage('Не удалось загрузить справочники закупок') })
    return () => { cancelled = true }
  }, [])

  const open = (name: DialogName, procurement: Procurement | null = null, itemId = '') => {
    setSelected(procurement)
    setDeliveryItemId(itemId)
    if (name === 'create') setLines([emptyLine()])
    setDialog(name)
    setMessage('')
  }

  async function request(url: string, body: unknown) {
    setBusy(true)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({}))
    setBusy(false)
    if (!response.ok) {
      setMessage(payload.error?.message || 'Не удалось выполнить действие')
      return false
    }
    setDialog(null)
    setMessage('Изменения сохранены')
    await load()
    return true
  }

  async function createProcurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await request('/api/procurement', {
      number: form.get('number'),
      title: form.get('title'),
      description: form.get('description') || null,
      budgetLimit: Number(form.get('budgetLimit')),
      neededBy: form.get('neededBy') || null,
      projectId: form.get('projectId') || null,
      documentId: form.get('documentId') || null,
      items: lines.map((line) => ({
        ...line,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        groupId: line.groupId || null,
      })),
    })
  }

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await request('/api/procurement/suppliers', {
      name: form.get('name'),
      taxId: form.get('taxId') || null,
      email: form.get('email') || null,
      phone: form.get('phone') || null,
      address: form.get('address') || null,
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    await request(`/api/procurement/${selected.id}/submit`, {
      dueAt: form.get('dueAt') || null,
      steps: [{
        name: 'Согласование закупки',
        approverId: form.get('approverId'),
      }],
    })
  }

  async function createContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    await request(`/api/procurement/${selected.id}/contract`, {
      supplierId: form.get('supplierId'),
      number: form.get('number'),
      amount: Number(form.get('amount')),
      signedAt: form.get('signedAt'),
      deliveryDueAt: form.get('deliveryDueAt'),
      documentId: form.get('documentId') || null,
    })
  }

  async function createDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    const deliveredItems = selected.items
      .map((item) => ({
        procurementItemId: item.id,
        quantity: Number(form.get(`quantity-${item.id}`) || 0),
      }))
      .filter((item) => item.quantity > 0)
    await request(`/api/procurement/${selected.id}/deliveries`, {
      number: form.get('number'),
      receivedAt: form.get('receivedAt'),
      note: form.get('note') || null,
      documentId: form.get('documentId') || null,
      items: deliveredItems,
    })
  }

  async function capitalize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await request(`/api/procurement/delivery-items/${deliveryItemId}/capitalize`, {
      inventoryNumber: form.get('inventoryNumber'),
      molId: form.get('molId'),
      groupId: form.get('groupId') || null,
      accountingForm: form.get('accountingForm'),
      notes: form.get('notes') || null,
    })
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Закупки</h1>
          <p className="mt-1 text-muted-foreground">От заявки и согласования до поставки и постановки имущества на учёт</p>
        </div>
        <div className="flex gap-2">
          {canManageSuppliers && <Button variant="outline" onClick={() => open('supplier')}><Plus className="mr-2 h-4 w-4" />Поставщик</Button>}
          {canCreate && <Button onClick={() => open('create')}><Plus className="mr-2 h-4 w-4" />Заявка</Button>}
        </div>
      </div>

      {message && <p role="status" className="rounded-md bg-muted p-3 text-sm">{message}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Summary title="Активные" value={String(summary.active)} />
        <Summary title="На согласовании" value={String(summary.awaiting)} />
        <Summary title="Просрочено поставок" value={String(summary.overdue)} />
        <Summary title="Бюджет заявок" value={money.format(summary.budget)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px_auto]">
        <Input aria-label="Поиск закупок" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Номер, заявка, договор или поставщик" />
        <select
          aria-label="Фильтр статуса закупки"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={status}
          onChange={(event) => updateQuery({ status: event.target.value as Status | '', page: 1 })}
        >
          <option value="">Все статусы</option>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Button variant="outline" aria-label="Обновить закупки" onClick={() => void load()}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {loading ? <p className="text-muted-foreground">Загрузка…</p> : items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Закупок пока нет</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {items.map((item) => (
                <div key={item.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_160px_150px_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.number} · {item.title}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {item.project ? `${item.project.code} · ${item.project.name}` : 'Без проекта'} · {item.requestedBy.name}
                    </p>
                  </div>
                  <Badge className="w-fit" variant={item.status === 'REJECTED' ? 'destructive' : 'secondary'}>{labels[item.status]}</Badge>
                  <div className="text-sm md:text-right">
                    <p>{money.format(item.totalPlanned)}</p>
                    <p className="text-xs text-muted-foreground">Нужно к {date(item.neededBy)}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => open('details', item)}>Подробнее</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && pagination.total > 0 && (
        <nav aria-label="Страницы закупок" className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">Страница {pagination.page} из {pagination.totalPages} · всего {pagination.total}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => updateQuery({ page: page - 1 })}>Назад</Button>
            <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => updateQuery({ page: page + 1 })}>Далее</Button>
          </div>
        </nav>
      )}

      <Dialog open={dialog !== null} onOpenChange={(value) => !value && setDialog(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {dialog === 'details' && selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.number} · {selected.title}</DialogTitle>
                <DialogDescription>{labels[selected.status]} · {selected.project ? `${selected.project.code} · ${selected.project.name}` : 'Без проекта'}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div><span className="text-muted-foreground">Лимит:</span> {money.format(selected.budgetLimit)}</div>
                <div><span className="text-muted-foreground">План:</span> {money.format(selected.totalPlanned)}</div>
                <div><span className="text-muted-foreground">Инициатор:</span> {selected.requestedBy.name}</div>
                <div><span className="text-muted-foreground">Нужно к:</span> {date(selected.neededBy)}</div>
              </div>
              {selected.description && <p className="whitespace-pre-wrap text-sm">{selected.description}</p>}
              <div className="grid gap-2">
                <h3 className="font-medium">Позиции</h3>
                {selected.items.map((line) => (
                  <div key={line.id} className="flex flex-wrap justify-between gap-2 rounded-md border p-2 text-sm">
                    <span>{line.name} {line.group && <span className="text-muted-foreground">({line.group.code})</span>}</span>
                    <span>{line.deliveredQuantity}/{line.quantity} {line.unit} · {money.format(line.unitPrice)}</span>
                  </div>
                ))}
              </div>
              {selected.contract && (
                <div className="rounded-md border p-3 text-sm">
                  <div className="font-medium">Договор {selected.contract.number} · {selected.contract.supplier.name}</div>
                  <div className="text-muted-foreground">{money.format(selected.contract.amount)} · поставка до {date(selected.contract.deliveryDueAt)}</div>
                </div>
              )}
              {selected.deliveries.map((delivery) => (
                <div key={delivery.id} className="rounded-md border p-3 text-sm">
                  <div className="font-medium">Поставка {delivery.number} от {date(delivery.receivedAt)}</div>
                  <div className="mt-2 grid gap-2">
                    {delivery.items.map((deliveryItem) => (
                      <div key={deliveryItem.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>{deliveryItem.procurementItem.name} · {deliveryItem.quantity} {deliveryItem.procurementItem.unit}</span>
                        {deliveryItem.asset ? (
                          <Button asChild size="sm" variant="outline"><Link href={`/assets/${deliveryItem.asset.id}`}>{deliveryItem.asset.inventoryNumber}</Link></Button>
                        ) : canCapitalize ? (
                          <Button size="sm" onClick={() => open('capitalize', selected, deliveryItem.id)}><PackageCheck className="mr-2 h-4 w-4" />На учёт</Button>
                        ) : <Badge variant="outline">Не оприходовано</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                {selected.document && <Button asChild size="sm" variant="outline"><Link href={`/documents/${selected.document.id}`}><FileText className="mr-2 h-4 w-4" />Заявка</Link></Button>}
                {selected.approvalRequest && <Button asChild size="sm" variant="outline"><Link href={`/approvals/${selected.approvalRequest.id}`}><ClipboardCheck className="mr-2 h-4 w-4" />Согласование</Link></Button>}
                {canSubmit && selected.status === 'DRAFT' && <Button size="sm" onClick={() => open('submit', selected)}><ClipboardCheck className="mr-2 h-4 w-4" />Согласовать</Button>}
                {canContract && selected.status === 'APPROVED' && <Button size="sm" onClick={() => open('contract', selected)}><FileText className="mr-2 h-4 w-4" />Договор</Button>}
                {canDeliver && ['CONTRACTED', 'PARTIALLY_DELIVERED'].includes(selected.status) && <Button size="sm" onClick={() => open('delivery', selected)}><Truck className="mr-2 h-4 w-4" />Поставка</Button>}
              </div>
            </>
          )}
          {dialog === 'create' && (
            <Form title="Новая заявка" description="Сумма позиций не должна превышать бюджетный лимит" onSubmit={createProcurement} busy={busy}>
              <Field label="Номер"><Input name="number" placeholder="ЗК-2026-001" required /></Field>
              <Field label="Название"><Input name="title" required /></Field>
              <Field label="Описание"><Textarea name="description" /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Бюджетный лимит"><Input name="budgetLimit" type="number" min="0.01" step="0.01" required /></Field>
                <Field label="Нужно к"><Input name="neededBy" type="date" /></Field>
                <Field label="Проект"><NativeSelect name="projectId" options={options.projects.map((item) => [item.id, `${item.code} · ${item.name}`])} empty="Без проекта" /></Field>
                <Field label="Документ заявки"><NativeSelect name="documentId" options={options.documents.map((item) => [item.id, item.title])} empty="Не выбран" /></Field>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label>Позиции</Label><Button type="button" size="sm" variant="outline" onClick={() => setLines((current) => [...current, emptyLine()])}>Добавить</Button></div>
                {lines.map((line, index) => (
                  <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-6">
                    <Input className="sm:col-span-2" value={line.name} onChange={(event) => setLines((current) => current.map((value, i) => i === index ? { ...value, name: event.target.value } : value))} placeholder="Наименование" required />
                    <Input value={line.quantity} onChange={(event) => setLines((current) => current.map((value, i) => i === index ? { ...value, quantity: event.target.value } : value))} type="number" min="0.01" step="0.01" placeholder="Кол-во" required />
                    <Input value={line.unit} onChange={(event) => setLines((current) => current.map((value, i) => i === index ? { ...value, unit: event.target.value } : value))} placeholder="Ед." required />
                    <Input value={line.unitPrice} onChange={(event) => setLines((current) => current.map((value, i) => i === index ? { ...value, unitPrice: event.target.value } : value))} type="number" min="0.01" step="0.01" placeholder="Цена" required />
                    <select className="rounded-md border bg-background px-2 text-sm" value={line.groupId} onChange={(event) => setLines((current) => current.map((value, i) => i === index ? { ...value, groupId: event.target.value } : value))}>
                      <option value="">Группа позже</option>
                      {options.groups.map((group) => <option key={group.id} value={group.id}>{group.code}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </Form>
          )}
          {dialog === 'supplier' && (
            <Form title="Новый поставщик" description="Реквизиты используются в договорах закупки" onSubmit={createSupplier} busy={busy}>
              <Field label="Название"><Input name="name" required /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ИНН"><Input name="taxId" inputMode="numeric" /></Field>
                <Field label="Телефон"><Input name="phone" /></Field>
                <Field label="Email"><Input name="email" type="email" /></Field>
                <Field label="Адрес"><Input name="address" /></Field>
              </div>
            </Form>
          )}
          {dialog === 'submit' && (
            <Form title="Запустить согласование" description={selected?.number || ''} onSubmit={submit} busy={busy}>
              <Field label="Согласующий"><NativeSelect name="approverId" required options={options.approvers.map((item) => [item.id, `${item.name} (${item.username})`])} /></Field>
              <Field label="Срок решения"><Input name="dueAt" type="date" /></Field>
            </Form>
          )}
          {dialog === 'contract' && (
            <Form title="Зарегистрировать договор" description={`Лимит: ${money.format(selected?.budgetLimit || 0)}`} onSubmit={createContract} busy={busy}>
              <Field label="Поставщик"><NativeSelect name="supplierId" required options={options.suppliers.map((item) => [item.id, item.name])} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Номер"><Input name="number" required /></Field>
                <Field label="Сумма"><Input name="amount" type="number" min="0.01" step="0.01" required /></Field>
                <Field label="Дата подписания"><Input name="signedAt" type="date" required /></Field>
                <Field label="Срок поставки"><Input name="deliveryDueAt" type="date" required /></Field>
              </div>
              <Field label="Локальный документ"><NativeSelect name="documentId" options={options.documents.map((item) => [item.id, item.title])} empty="Не выбран" /></Field>
            </Form>
          )}
          {dialog === 'delivery' && selected && (
            <Form title="Зарегистрировать поставку" description={selected.contract?.number || ''} onSubmit={createDelivery} busy={busy}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Номер накладной/акта"><Input name="number" required /></Field>
                <Field label="Дата получения"><Input name="receivedAt" type="date" required /></Field>
              </div>
              {selected.items.filter((item) => item.deliveredQuantity < item.quantity).map((item) => (
                <Field key={item.id} label={`${item.name} (остаток ${item.quantity - item.deliveredQuantity} ${item.unit})`}>
                  <Input name={`quantity-${item.id}`} type="number" min="0" max={item.quantity - item.deliveredQuantity} step="0.01" defaultValue={item.quantity - item.deliveredQuantity} />
                </Field>
              ))}
              <Field label="Документ поставки"><NativeSelect name="documentId" options={options.documents.map((item) => [item.id, item.title])} empty="Не выбран" /></Field>
              <Field label="Примечание"><Textarea name="note" /></Field>
            </Form>
          )}
          {dialog === 'capitalize' && (
            <Form title="Поставить имущество на учёт" description="Будет создана карточка имущества и операция поступления" onSubmit={capitalize} busy={busy}>
              <Field label="Инвентарный номер"><Input name="inventoryNumber" required /></Field>
              <Field label="МОЛ"><NativeSelect name="molId" required options={options.mols.map((item) => [item.id, `${item.code} · ${item.fullName} · ${item.storageLocation}`])} /></Field>
              <Field label="Группа"><NativeSelect name="groupId" options={options.groups.map((item) => [item.id, `${item.code} · ${item.name}`])} empty="Из позиции заявки" /></Field>
              <Field label="Форма учёта"><NativeSelect name="accountingForm" required options={[['145', '145'], ['367', '367']]} /></Field>
              <Field label="Примечание"><Textarea name="notes" /></Field>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}

function Summary({ title, value }: { title: string; value: string }) {
  return <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{value}</CardContent></Card>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>
}

function NativeSelect({
  name,
  options,
  empty,
  required,
}: {
  name: string
  options: Array<[string, string]>
  empty?: string
  required?: boolean
}) {
  return (
    <select name={name} required={required} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
      {empty && <option value="">{empty}</option>}
      {!empty && <option value="">Выберите</option>}
      {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
  )
}

function Form({
  title,
  description,
  onSubmit,
  busy,
  children,
}: {
  title: string
  description: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  busy: boolean
  children: React.ReactNode
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      {children}
      <DialogFooter><Button type="submit" disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить'}</Button></DialogFooter>
    </form>
  )
}
