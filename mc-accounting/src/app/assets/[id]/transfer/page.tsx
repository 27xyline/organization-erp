'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, ArrowRightLeft } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency, formatDecimal } from '@/lib/utils'

interface TransferPageProps {
  params: { id: string }
}

async function getAsset(id: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/assets/${id}`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch asset')
  return res.json()
}

async function getMols() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/mols`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch MOLs')
  return res.json()
}

export default function TransferPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [asset, setAsset] = useState<any>(null)
  const [mols, setMols] = useState<any[]>([])
  const [formData, setFormData] = useState({
    toMolId: '',
    quantity: '',
    unitPrice: '',
    date: new Date().toISOString().split('T')[0],
    documentType: 'Акт передачи',
    documentDetails: '',
    reason: '',
  })

  // Load data on mount
  useState(() => {
    Promise.all([getAsset(params.id), getMols()]).then(([assetData, molsData]) => {
      setAsset(assetData)
      setMols(molsData.filter((m: any) => m.id !== assetData.molId))
      setFormData(prev => ({
        ...prev,
        quantity: assetData.quantity.toString(),
        unitPrice: assetData.unitPrice.toString(),
      }))
    })
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'TRANSFER',
          assetId: params.id,
          fromMolId: asset?.molId,
          toMolId: formData.toMolId,
          quantity: parseFloat(formData.quantity),
          unitPrice: parseFloat(formData.unitPrice),
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
    return <div className="container mx-auto py-8">Загрузка...</div>
  }

  const totalCost = parseFloat(formData.quantity || '0') * parseFloat(formData.unitPrice || '0')

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
            Текущий МОЛ: {asset.mol?.fullName}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Доступно: {formatDecimal(asset.quantity)} {asset.unitOfMeasure} ({formatCurrency(asset.totalCost)})
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
              <Label htmlFor="toMolId">Получатель (МОЛ) *</Label>
              <Select
                value={formData.toMolId}
                onValueChange={(value) => setFormData({ ...formData, toMolId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите получателя" />
                </SelectTrigger>
                <SelectContent>
                  {mols.map((mol) => (
                    <SelectItem key={mol.id} value={mol.id}>
                      {mol.code} - {mol.fullName} ({mol.department})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Количество *</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.01"
                  max={asset.quantity}
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Максимум: {formatDecimal(asset.quantity)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="unitPrice">Цена за единицу *</Label>
                <Input
                  id="unitPrice"
                  type="number"
                  step="0.01"
                  value={formData.unitPrice}
                  onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
                  required
                />
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