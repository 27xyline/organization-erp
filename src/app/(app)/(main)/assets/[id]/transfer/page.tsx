'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, ArrowRightLeft } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency, formatDecimal } from '@/lib/utils'

interface MolSummary {
  id: string
  code: string
  fullName: string
  department: string
}

interface AssetHoldingSummary {
  molId: string
  quantity: string
  mol: MolSummary
}

interface TransferAssetSummary {
  id: string
  name: string
  inventoryNumber: string
  unitOfMeasure: string
  unitPrice: string
  totalCost: string
  holdings: AssetHoldingSummary[]
}

async function getAsset(id: string): Promise<TransferAssetSummary> {
  const res = await fetch(`/api/assets/${id}`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch asset')
  const body = await res.json() as { data: TransferAssetSummary }
  return body.data
}

async function getMols(): Promise<MolSummary[]> {
  const res = await fetch('/api/mols', {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch MOLs')
  const body = await res.json() as { data: MolSummary[] }
  return body.data
}

export default function TransferPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params)
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [asset, setAsset] = useState<TransferAssetSummary | null>(null)
  const [mols, setMols] = useState<MolSummary[]>([])
  const [formData, setFormData] = useState({
    fromMolId: '',
    toMolId: '',
    quantity: '',
    date: new Date().toISOString().split('T')[0],
    documentType: 'Акт передачи',
    documentDetails: '',
    reason: '',
  })

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      try {
        const [assetData, molsData] = await Promise.all([getAsset(params.id), getMols()])

        if (!isMounted) {
          return
        }

        setAsset(assetData)
        const initialHolding = assetData.holdings[0]
        setMols(molsData)
        setFormData(prev => ({
          ...prev,
          fromMolId: initialHolding?.molId || '',
          quantity: initialHolding?.quantity || '',
        }))
      } catch (error) {
        console.error('Error loading transfer page:', error)
        toast.error('Не удалось загрузить данные для передачи')
      }
    }

    void loadData()

    return () => {
      isMounted = false
    }
  }, [params.id, toast])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch(`/api/assets/${params.id}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'TRANSFER',
          assetId: params.id,
          fromMolId: formData.fromMolId,
          toMolId: formData.toMolId,
          quantity: parseFloat(formData.quantity),
          date: formData.date,
          documentType: formData.documentType,
          documentDetails: formData.documentDetails,
          reason: formData.reason,
        }),
      })

      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        const error = await res.json()
        toast.error(error.error || 'Произошла ошибка')
      }
    } catch (error) {
      console.error('Error transferring asset:', error)
      toast.error('Произошла ошибка при передаче')
    } finally {
      setLoading(false)
    }
  }

  if (!asset) {
    return (
      <main className="container mx-auto py-8 px-4 max-w-2xl space-y-6">
        <Skeleton className="h-10 w-[160px]" />
        <Skeleton className="h-8 w-[280px]" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </main>
    )
  }

  const sourceHolding = asset.holdings.find((holding) => holding.molId === formData.fromMolId)
  const availableQuantity = Number(sourceHolding?.quantity || 0)
  const totalCost = parseFloat(formData.quantity || '0') * Number(asset.unitPrice)

  return (
    <main className="container mx-auto py-8 px-4 max-w-2xl">
      <div className="mb-6">
        <Link href={`/assets/${params.id}`}>
          <Button variant="ghost" className="pl-0">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к объекту
          </Button>
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-8">Передача объекта</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Текущий объект</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-medium">{asset.name}</p>
          <p className="text-sm text-muted-foreground">
            Инв. номер: {asset.inventoryNumber} | 
            Остатки: {asset.holdings.map((holding) => `${holding.mol.fullName}: ${formatDecimal(holding.quantity)}`).join('; ')}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Всего: {formatDecimal(asset.holdings.reduce((sum, holding) => sum + Number(holding.quantity), 0))} {asset.unitOfMeasure} ({formatCurrency(asset.totalCost)})
          </p>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Параметры передачи</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fromMolId">Отправитель (МОЛ) *</Label>
              <Select
                value={formData.fromMolId}
                onValueChange={(value) => {
                  const holding = asset.holdings.find((item) => item.molId === value)
                  setFormData({
                    ...formData,
                    fromMolId: value,
                    toMolId: formData.toMolId === value ? '' : formData.toMolId,
                    quantity: holding?.quantity || '',
                  })
                }}
              >
                <SelectTrigger><SelectValue placeholder="Выберите отправителя" /></SelectTrigger>
                <SelectContent>
                  {asset.holdings.map((holding) => (
                    <SelectItem key={holding.molId} value={holding.molId}>
                      {holding.mol.code} — {holding.mol.fullName} ({formatDecimal(holding.quantity)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="toMolId">Получатель (МОЛ) *</Label>
              <Select
                value={formData.toMolId}
                onValueChange={(value) => setFormData({ ...formData, toMolId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите получателя" />
                </SelectTrigger>
                <SelectContent>
                  {mols.filter((mol) => mol.id !== formData.fromMolId).map((mol) => (
                    <SelectItem key={mol.id} value={mol.id}>
                      {mol.code} - {mol.fullName} ({mol.department})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Количество *</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={availableQuantity}
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Максимум: {formatDecimal(availableQuantity)}
                </p>
              </div>
            </div>

            <div className="p-4 bg-muted rounded-md">
              <p className="text-sm text-muted-foreground">Общая стоимость передачи:</p>
              <p className="text-lg font-medium">{formatCurrency(totalCost)}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Дата передачи *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="documentType">Вид документа *</Label>
              <Select
                value={formData.documentType}
                onValueChange={(value) => setFormData({ ...formData, documentType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Акт передачи">Акт передачи</SelectItem>
                  <SelectItem value="Накладная на внутреннее перемещение">Накладная на внутреннее перемещение</SelectItem>
                  <SelectItem value="Распоряжение">Распоряжение</SelectItem>
                  <SelectItem value="Другое">Другое</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="documentDetails">Реквизиты документа *</Label>
              <Input
                id="documentDetails"
                value={formData.documentDetails}
                onChange={(e) => setFormData({ ...formData, documentDetails: e.target.value })}
                placeholder="№ документа, дата"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Основание / примечание</Label>
              <Input
                id="reason"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Причина передачи"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button type="submit" disabled={loading} className="flex-1">
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            {loading ? 'Выполнение...' : 'Выполнить передачу'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push(`/assets/${params.id}`)}>
            Отмена
          </Button>
        </div>
      </form>
    </main>
  )
}
