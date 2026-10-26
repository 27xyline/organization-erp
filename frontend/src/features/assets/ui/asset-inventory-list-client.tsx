'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Loader2, Plus, Warehouse } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
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
import { Label } from '@/components/ui/label'

interface MolOption {
  id: string
  code: string
  fullName: string
  storageLocation: string
  departmentId: string
  department: string
}

interface InventoryListItem {
  id: string
  name: string
  status: 'IN_PROGRESS' | 'COMPLETED'
  createdAt: string
  completedAt: string | null
  mol: { id: string; code: string; fullName: string; storageLocation: string; department: string }
  createdBy: { id: string; name: string }
  _count: { entries: number }
}

const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })

export function AssetInventoryListClient() {
  const [inventories, setInventories] = useState<InventoryListItem[]>([])
  const [mols, setMols] = useState<MolOption[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [molId, setMolId] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async (nextPage = 1, pageSize = 50) => {
    setLoading(true)
    try {
      const [inventoryResponse, molResponse] = await Promise.all([
        fetch(`/api/assets/inventories?page=${nextPage}&pageSize=${pageSize}`),
        fetch('/api/assets/inventories/options'),
      ])
      const [inventoryBody, molBody] = await Promise.all([
        inventoryResponse.json().catch(() => ({})),
        molResponse.json().catch(() => ({})),
      ])
      if (!inventoryResponse.ok) throw new Error(inventoryBody.error?.message || 'Не удалось загрузить инвентаризации')
      if (!molResponse.ok) throw new Error(molBody.error?.message || 'Не удалось загрузить список МОЛ')
      setInventories(inventoryBody.data || [])
      setPage(nextPage)
      setTotalPages(inventoryBody.pagination?.totalPages || 1)
      setMols(molBody.data || [])
      setMolId((current) => current || molBody.data?.[0]?.id || '')
      setLoadError(false)
      setMessage(null)
    } catch (error) {
      setLoadError(true)
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить инвентаризации')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function createInventory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/assets/inventories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, molId }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error?.message || 'Не удалось создать инвентаризацию')
      setName('')
      setOpen(false)
      await load(1)
      setMessage('Инвентаризация создана. Список имущества зафиксирован на момент начала проверки.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось создать инвентаризацию')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <PageHeader
        title="Инвентаризация имущества"
        description="Сверяйте фактическое наличие по QR-коду или инвентарному номеру. Результаты проверки не изменяют бухгалтерские остатки."
        actions={(
          <>
            <Link href="/assets"><Button variant="outline">К имуществу</Button></Link>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button disabled={!mols.length}><Plus className="mr-2 h-4 w-4" />Новая инвентаризация</Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={createInventory}>
                  <DialogHeader>
                    <DialogTitle>Начать инвентаризацию</DialogTitle>
                    <DialogDescription>
                      В ведомость попадут активные позиции выбранного МОЛ с положительным остатком.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-5">
                    <div className="space-y-2">
                      <Label htmlFor="asset-inventory-name">Название проверки</Label>
                      <Input id="asset-inventory-name" autoFocus minLength={3} maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, инвентаризация кабинета 204" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="asset-inventory-mol">МОЛ и место хранения</Label>
                      <select id="asset-inventory-mol" required value={molId} onChange={(event) => setMolId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        {mols.map((mol) => (
                          <option key={mol.id} value={mol.id}>{mol.code} · {mol.fullName} · {mol.storageLocation}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={saving || !molId}>
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Создать ведомость
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </>
        )}
      />

      {message && <p role="status" className="rounded-lg border bg-card px-4 py-3 text-sm">{message}</p>}

      {loading ? (
        <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Загружаем инвентаризации…</div>
      ) : loadError ? (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center text-center">
            <h2 className="font-semibold">Список недоступен</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">Не удалось получить ведомости. Проверьте соединение и повторите попытку.</p>
            <Button className="mt-4" variant="outline" onClick={() => void load(page)}>Повторить загрузку</Button>
          </CardContent>
        </Card>
      ) : inventories.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {inventories.map((inventory) => (
            <Link key={inventory.id} href={`/assets/inventory/${inventory.id}`} className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="h-full transition-colors group-hover:border-primary/40">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base leading-6">{inventory.name}</CardTitle>
                    <Badge variant={inventory.status === 'IN_PROGRESS' ? 'default' : 'secondary'}>
                      {inventory.status === 'IN_PROGRESS' ? 'В процессе' : 'Завершена'}
                    </Badge>
                  </div>
                  <CardDescription>{inventory.mol.department} · {inventory.mol.storageLocation}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground"><Warehouse className="h-4 w-4" />{inventory.mol.fullName} · {inventory.mol.code}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><ClipboardCheck className="h-4 w-4" />{inventory._count.entries} позиций</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-4 w-4" />{dateTime.format(new Date(inventory.createdAt))}</div>
                  <p className="border-t pt-3 text-xs text-muted-foreground">Ответственный: {inventory.createdBy.name}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
            <ClipboardCheck className="mb-3 h-9 w-9 text-muted-foreground" />
            <h2 className="font-semibold">Пока нет инвентаризаций</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">Создайте ведомость для места хранения. В ней будут зафиксированы ожидаемые остатки, чтобы затем сравнить их с фактическими.</p>
          </CardContent>
        </Card>
      )}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">Страница {page} из {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" aria-label="Предыдущая страница" disabled={page <= 1 || loading} onClick={() => {
              const nextPage = Math.max(1, page - 1)
              setPage(nextPage)
              void load(nextPage)
            }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" aria-label="Следующая страница" disabled={page >= totalPages || loading} onClick={() => {
              const nextPage = page + 1
              setPage(nextPage)
              void load(nextPage)
            }}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}
