'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Loader2, QrCode, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDecimal } from '@/lib/utils'

interface ResolvedEntry {
  id: string
  inventoryNumber: string
  assetName: string
  unitOfMeasure: string
  expectedQuantity: string
  foundQuantity: string | null
  note: string | null
  inventory: {
    id: string
    name: string
    mol: { id: string; code: string; fullName: string; departmentId: string }
  }
}

export function AssetInventoryScanClient({ inventoryNumber }: { inventoryNumber: string }) {
  const router = useRouter()
  const [matches, setMatches] = useState<ResolvedEntry[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function resolve() {
      if (!inventoryNumber.trim()) {
        setMessage('В QR-коде нет инвентарного номера. Откройте этикетку из карточки имущества.')
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const response = await fetch(`/api/assets/inventories/resolve?number=${encodeURIComponent(inventoryNumber)}`)
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error?.message || 'Не удалось найти позицию')
        if (!active) return
        setMatches(body.data || [])
        if (!body.data?.length) setMessage('Для этого имущества нет активной инвентаризации. Создайте ведомость и откройте QR-код ещё раз.')
        else {
          setMessage(null)
          if (body.data.length === 1) {
            setSelectedId(body.data[0].inventory.id)
            setQuantity(body.data[0].foundQuantity ?? '')
            setNote(body.data[0].note || '')
          }
        }
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'Не удалось найти позицию')
      } finally {
        if (active) setLoading(false)
      }
    }
    void resolve()
    return () => { active = false }
  }, [inventoryNumber])

  const selected = matches.find((match) => match.inventory.id === selectedId) || null

  function chooseInventory(id: string) {
    setSelectedId(id)
    const entry = matches.find((match) => match.inventory.id === id)
    setQuantity(entry?.foundQuantity ?? '')
    setNote(entry?.note || '')
    setMessage(null)
  }

  async function saveCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/assets/inventories/${selected.inventory.id}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryNumber: selected.inventoryNumber,
          foundQuantity: quantity,
          note: note.trim() || undefined,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error?.message || 'Не удалось сохранить фактическое количество')
      setMessage('Проверка сохранена. Учётный остаток не изменён.')
      window.setTimeout(() => router.push(`/assets/inventory/${selected.inventory.id}`), 700)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить фактическое количество')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Link href="/assets/inventory"><Button variant="ghost" className="-ml-3"><ArrowLeft className="mr-2 h-4 w-4" />К инвентаризациям</Button></Link>
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><QrCode className="h-4 w-4" />Проверка по QR-коду</p>
        <h1 className="text-3xl font-semibold tracking-tight">{inventoryNumber ? `Инв. № ${inventoryNumber}` : 'QR-инвентаризация'}</h1>
        <p className="mt-2 text-muted-foreground">Укажите фактическое количество. Результат попадёт в акт проверки и не спишет имущество автоматически.</p>
      </div>
      {loading ? (
        <div className="flex min-h-40 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Ищем активную ведомость…</div>
      ) : matches.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Выберите ведомость</CardTitle>
            <CardDescription>Эта позиция включена в несколько незавершённых проверок.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {matches.map((match) => (
              <Button key={match.inventory.id} variant={selectedId === match.inventory.id ? 'default' : 'outline'} className="h-auto justify-start whitespace-normal py-3 text-left" onClick={() => chooseInventory(match.inventory.id)}>
                <span><span className="block">{match.inventory.name}</span><span className="mt-1 block text-xs font-normal opacity-80">{match.inventory.mol.fullName} · по учёту {formatDecimal(match.expectedQuantity)} {match.unitOfMeasure}</span></span>
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {message && <p role="status" className="rounded-lg border bg-card px-4 py-3 text-sm">{message}</p>}
      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>{selected.assetName}</CardTitle>
            <CardDescription>{selected.inventory.name} · {selected.inventory.mol.fullName}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-5 flex items-center justify-between rounded-xl bg-muted/50 p-4">
              <span className="text-sm text-muted-foreground">Количество по учёту</span>
              <span className="text-lg font-semibold">{formatDecimal(selected.expectedQuantity)} {selected.unitOfMeasure}</span>
            </div>
            <form onSubmit={saveCount} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="scan-found-quantity">Нашли фактически</Label>
                <Input id="scan-found-quantity" autoFocus type="number" required min="0" max="99999999.99" step="0.01" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" />
                <p className="text-xs text-muted-foreground">Введите 0, если имущество не удалось найти.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="scan-note">Примечание</Label>
                <Textarea id="scan-note" rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="При необходимости опишите найденное расхождение" />
              </div>
              <Button className="w-full" type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : message?.startsWith('Проверка сохранена') ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <ScanLine className="mr-2 h-4 w-4" />}
                Сохранить результат
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
