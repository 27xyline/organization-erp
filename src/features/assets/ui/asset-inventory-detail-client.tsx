'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, ClipboardCheck, Loader2, Printer, QrCode, Search, ScanLine } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDecimal } from '@/lib/utils'

interface InventoryEntry {
  id: string
  assetId: string | null
  inventoryNumber: string
  assetName: string
  unitOfMeasure: string
  expectedQuantity: string
  foundQuantity: string | null
  note: string | null
  scannedAt: string | null
  scannedBy: { id: string; name: string } | null
}

interface InventoryDetail {
  inventory: {
    id: string
    name: string
    status: 'IN_PROGRESS' | 'COMPLETED'
    createdAt: string
    completedAt: string | null
    mol: { id: string; code: string; fullName: string; storageLocation: string; department: string }
    createdBy: { id: string; name: string }
  }
  entries: InventoryEntry[]
  summary: {
    totalAssets: number
    checkedAssets: number
    missingAssets: number
    quantityDiscrepancies: number
    totalDiscrepancies: number
  }
  page: number
  totalPages: number
  total: number
}

const PAGE_SIZE = 50
const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' })

export function AssetInventoryDetailClient({ inventoryId }: { inventoryId: string }) {
  const router = useRouter()
  const [data, setData] = useState<InventoryDetail | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [inventoryNumber, setInventoryNumber] = useState('')
  const [foundQuantity, setFoundQuantity] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async (nextPage = page, nextSearch = search) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) })
      if (nextSearch.trim()) params.set('search', nextSearch.trim())
      const response = await fetch(`/api/assets/inventories/${inventoryId}?${params}`)
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error?.message || 'Не удалось загрузить ведомость')
      setData(body.data)
      setMessage(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить ведомость')
    } finally {
      setLoading(false)
    }
  }, [inventoryId, page, search])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(page, search), 0)
    return () => window.clearTimeout(timer)
  }, [load, page, search])

  async function recordCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/assets/inventories/${inventoryId}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryNumber, foundQuantity, note: note.trim() || undefined }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error?.message || 'Не удалось сохранить фактический остаток')
      setMessage(`Сохранён факт по позиции ${inventoryNumber}`)
      setInventoryNumber('')
      setFoundQuantity('')
      setNote('')
      await load(page, search)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить фактический остаток')
    } finally {
      setSaving(false)
    }
  }

  async function completeInventory() {
    setCompleting(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/assets/inventories/${inventoryId}/complete`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error?.message || 'Не удалось завершить инвентаризацию')
      setConfirmOpen(false)
      await load(page, search)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось завершить инвентаризацию')
    } finally {
      setCompleting(false)
    }
  }

  function selectEntry(entry: InventoryEntry) {
    setInventoryNumber(entry.inventoryNumber)
    setFoundQuantity(entry.foundQuantity ?? '')
    setNote(entry.note || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <PageHeader
        title={data?.inventory.name || 'Инвентаризация'}
        description={data ? `${data.inventory.mol.department} · ${data.inventory.mol.storageLocation} · ${data.inventory.mol.fullName}` : 'Список ожидаемых остатков и фактические результаты проверки'}
        actions={(
          <>
            <Link href="/assets/inventory"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />К ведомостям</Button></Link>
            <Link href={`/assets/inventory/${inventoryId}/act`}><Button variant="outline"><Printer className="mr-2 h-4 w-4" />Печатный акт</Button></Link>
            {data?.inventory.status === 'IN_PROGRESS' && <Button onClick={() => setConfirmOpen(true)}><ClipboardCheck className="mr-2 h-4 w-4" />Завершить</Button>}
          </>
        )}
      />

      {message && <p role="status" className="rounded-lg border bg-card px-4 py-3 text-sm">{message}</p>}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Позиций в ведомости" value={data.summary.totalAssets} />
            <SummaryCard label="Проверено" value={`${data.summary.checkedAssets} / ${data.summary.totalAssets}`} detail={`${data.summary.missingAssets} ещё не проверено`} />
            <SummaryCard label="Расхождения" value={data.summary.totalDiscrepancies} detail={`${data.summary.quantityDiscrepancies} по количеству`} warning={data.summary.totalDiscrepancies > 0} />
            <SummaryCard label="Состояние" value={data.inventory.status === 'IN_PROGRESS' ? 'В процессе' : 'Завершена'} detail={`Создал: ${data.inventory.createdBy.name}`} />
          </div>

          {data.inventory.status === 'IN_PROGRESS' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Записать фактическое наличие</CardTitle>
                <p className="text-sm text-muted-foreground">Введите номер с клавиатуры или откройте QR-этикетку телефоном. Значение 0 означает, что имущество не найдено.</p>
              </CardHeader>
              <CardContent>
                <form onSubmit={recordCount} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="count-inventory-number">Инвентарный номер</Label>
                    <Input id="count-inventory-number" required maxLength={100} autoComplete="off" value={inventoryNumber} onChange={(event) => setInventoryNumber(event.target.value)} placeholder="INV-000123" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="count-found-quantity">Фактическое количество</Label>
                    <Input id="count-found-quantity" type="number" required min="0" max="99999999.99" step="0.01" inputMode="decimal" value={foundQuantity} onChange={(event) => setFoundQuantity(event.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="count-note">Примечание к расхождению</Label>
                    <Textarea id="count-note" maxLength={1000} rows={1} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Например, передано в кабинет 204" />
                  </div>
                  <div className="flex items-end md:col-span-2 xl:col-span-4">
                    <Button type="submit" disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanLine className="mr-2 h-4 w-4" />}
                      Сохранить результат проверки
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Позиции</h2>
                <p className="text-sm text-muted-foreground">{data.total} результатов</p>
              </div>
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" aria-label="Поиск по позициям" placeholder="Название или инв. номер" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value) }} />
              </div>
            </div>
            {loading ? (
              <div className="flex min-h-32 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Обновляем список…</div>
            ) : data.entries.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {data.entries.map((entry) => {
                  const checked = entry.foundQuantity !== null
                  const discrepancy = checked && Number(entry.foundQuantity) !== Number(entry.expectedQuantity)
                  return (
                    <Card key={entry.id} className={discrepancy ? 'border-amber-400/70' : undefined}>
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words font-medium">{entry.assetName}</p>
                            <p className="mt-1 text-sm text-muted-foreground">Инв. № {entry.inventoryNumber}</p>
                          </div>
                          <Badge variant={!checked ? 'outline' : discrepancy ? 'destructive' : 'secondary'}>
                            {!checked ? 'Не проверено' : discrepancy ? 'Расхождение' : 'Совпадает'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
                          <div><p className="text-xs text-muted-foreground">По учёту</p><p className="font-medium">{formatDecimal(entry.expectedQuantity)} {entry.unitOfMeasure}</p></div>
                          <div><p className="text-xs text-muted-foreground">Фактически</p><p className="font-medium">{checked ? `${formatDecimal(entry.foundQuantity!)} ${entry.unitOfMeasure}` : '—'}</p></div>
                        </div>
                        {entry.note && <p className="text-sm text-muted-foreground">{entry.note}</p>}
                        {entry.scannedAt && <p className="text-xs text-muted-foreground">Проверено {dateTime.format(new Date(entry.scannedAt))}{entry.scannedBy ? ` · ${entry.scannedBy.name}` : ''}</p>}
                        <div className="flex flex-wrap gap-2 border-t pt-3">
                          {data.inventory.status === 'IN_PROGRESS' && <Button size="sm" variant="outline" onClick={() => selectEntry(entry)}><ScanLine className="mr-2 h-4 w-4" />{checked ? 'Изменить результат' : 'Отметить'}</Button>}
                          {entry.assetId && <Link href={`/assets/${entry.assetId}/qr`}><Button size="sm" variant="ghost"><QrCode className="mr-2 h-4 w-4" />QR-этикетка</Button></Link>}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            ) : (
              <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Подходящие позиции не найдены.</CardContent></Card>
            )}
            <div className="flex items-center justify-between border-t pt-4">
              <p className="text-sm text-muted-foreground">Страница {data.page} из {Math.max(1, data.totalPages)}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" aria-label="Предыдущая страница" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" aria-label="Следующая страница" disabled={page >= data.totalPages || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          </section>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Завершить инвентаризацию?</DialogTitle>
            <DialogDescription>
              {data?.summary.missingAssets || 0} непроверенных позиций будут отмечены в акте как не подтверждённые. После закрытия ведомость нельзя будет изменить. Бухгалтерские остатки останутся без изменений.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-amber-600" />Подтверждение не меняет учёт</p>
            <p className="mt-1 text-muted-foreground">Расхождения попадут только в печатный акт и историю действий.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Продолжить проверку</Button>
            <Button onClick={() => void completeInventory()} disabled={completing}>
              {completing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Закрыть ведомость
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function SummaryCard({ label, value, detail, warning = false }: { label: string; value: string | number; detail?: string; warning?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-2 text-2xl font-semibold ${warning ? 'text-amber-600' : ''}`}>{value}</p>
        {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  )
}
