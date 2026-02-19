'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mol, AssetGroup } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImageIcon, Upload, X } from 'lucide-react'

interface AssetFormProps {
  mols: Mol[]
  groups: AssetGroup[]
  projects: { id: string; code: string; name: string }[]
  initialData?: any
}

export function AssetForm({ mols, groups, projects, initialData }: AssetFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [photos, setPhotos] = useState<string[]>(initialData?.photos || [])
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    inventoryNumber: initialData?.inventoryNumber || '',
    unitPrice: initialData?.unitPrice || '',
    unitOfMeasure: initialData?.unitOfMeasure || 'шт',
    quantity: initialData?.quantity || '1',
    molId: initialData?.molId || '',
    groupId: initialData?.groupId || '',
    projectId: initialData?.projectId || '',
    contractCode: initialData?.contractCode || '',
    internalFundingCode: initialData?.internalFundingCode || '',
    isExistingAsset: initialData?.isExistingAsset || false,
    recordingDate: initialData?.recordingDate 
      ? new Date(initialData.recordingDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    documentType: initialData?.documentType || 'Товарная накладная',
    documentDetails: initialData?.documentDetails || '',
    notes: initialData?.notes || '',
    plannedDisposalDate: initialData?.plannedDisposalDate
      ? new Date(initialData.plannedDisposalDate).toISOString().split('T')[0]
      : '',
    plannedDisposalReason: initialData?.plannedDisposalReason || '',
    status: initialData?.status || 'IN_STOCK',
    editReason: '',
  })

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const base64 = reader.result as string
          setPhotos(prev => [...prev, base64])
        }
        reader.readAsDataURL(file)
      })
    }
  }

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // При редактировании проверяем наличие основания
    if (initialData?.id && !formData.editReason.trim()) {
      alert('Необходимо указать основание для редактирования')
      return
    }
    
    setLoading(true)

    try {
      const url = initialData?.id 
        ? `/api/assets/${initialData.id}`
        : '/api/assets'
      
      const method = initialData?.id ? 'PUT' : 'POST'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, photos }),
      })

      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        const error = await res.json()
        alert(error.error || 'Произошла ошибка')
      }
    } catch (error) {
      console.error('Error saving asset:', error)
      alert('Произошла ошибка при сохранении')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Основная информация</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Фото */}
          <div className="space-y-2">
            <Label>Фотографии объекта</Label>
            <div className="flex flex-wrap gap-2">
              {photos.map((photo, index) => (
                <div key={index} className="relative">
                  <img 
                    src={photo} 
                    alt={`Photo ${index + 1}`}
                    className="w-20 h-20 object-cover rounded-lg border"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:border-muted-foreground/50 transition-colors">
                <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Добавить</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </label>
            </div>
          </div>

          {/* Наименование и инв. номер */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Наименование объекта *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventoryNumber">Инвентарный номер *</Label>
              <Input
                id="inventoryNumber"
                value={formData.inventoryNumber}
                onChange={(e) => setFormData({ ...formData, inventoryNumber: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Цена, ед. изм., количество, статус */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unitPrice">Цена *</Label>
              <Input
                id="unitPrice"
                type="number"
                step="1"
                value={formData.unitPrice}
                onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitOfMeasure">Ед. изм. *</Label>
              <Input
                id="unitOfMeasure"
                value={formData.unitOfMeasure}
                onChange={(e) => setFormData({ ...formData, unitOfMeasure: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Кол-во *</Label>
              <Input
                id="quantity"
                type="number"
                step="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Статус *</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN_STOCK">В наличии</SelectItem>
                  <SelectItem value="IN_USE">В эксплуатации</SelectItem>
                  <SelectItem value="UNDER_REPAIR">На ремонте</SelectItem>
                  <SelectItem value="PLANNED_FOR_DISPOSAL">К списанию</SelectItem>
                  <SelectItem value="PARTIALLY_DISPOSED">Частично списан</SelectItem>
                  <SelectItem value="FULLY_DISPOSED">Полностью списан</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* МОЛ и группа */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="molId">МОЛ *</Label>
              <Select
                value={formData.molId}
                onValueChange={(value) => setFormData({ ...formData, molId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите МОЛ" />
                </SelectTrigger>
                <SelectContent>
                  {mols.map((mol) => (
                    <SelectItem key={mol.id} value={mol.id}>
                      {mol.code} - {mol.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="groupId">Группа имущества *</Label>
              <Select
                value={formData.groupId}
                onValueChange={(value) => setFormData({ ...formData, groupId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите группу" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.code} - {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Проект */}
          <div className="space-y-2">
            <Label htmlFor="projectId">Проект</Label>
            <Select
              value={formData.projectId}
              onValueChange={(value) => setFormData({ ...formData, projectId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите проект (необязательно)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Без проекта</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.code} - {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Источник закупки</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contractCode">Код договора</Label>
              <Input
                id="contractCode"
                value={formData.contractCode}
                onChange={(e) => setFormData({ ...formData, contractCode: e.target.value })}
                placeholder="№ договора поставки"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="internalFundingCode">Код внутреннего финансирования</Label>
              <Input
                id="internalFundingCode"
                value={formData.internalFundingCode}
                onChange={(e) => setFormData({ ...formData, internalFundingCode: e.target.value })}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isExistingAsset"
              checked={formData.isExistingAsset}
              onChange={(e) => setFormData({ ...formData, isExistingAsset: e.target.checked })}
              className="rounded border-gray-300"
            />
            <Label htmlFor="isExistingAsset" className="cursor-pointer text-sm">
              Существующее имущество (без документов)
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Документ-основание</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="recordingDate">Дата постановки на баланс *</Label>
              <Input
                id="recordingDate"
                type="date"
                value={formData.recordingDate}
                onChange={(e) => setFormData({ ...formData, recordingDate: e.target.value })}
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
                  <SelectItem value="Товарная накладная">Товарная накладная</SelectItem>
                  <SelectItem value="Акт изготовления">Акт изготовления</SelectItem>
                  <SelectItem value="Приходный ордер">Приходный ордер</SelectItem>
                  <SelectItem value="Акт приемки">Акт приемки</SelectItem>
                  <SelectItem value="Другое">Другое</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="documentDetails">Реквизиты документа *</Label>
            <Input
              id="documentDetails"
              value={formData.documentDetails}
              onChange={(e) => setFormData({ ...formData, documentDetails: e.target.value })}
              placeholder="№ документа, дата, поставщик и т.д."
              required
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Дополнительная информация</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notes">Примечания</Label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Дополнительная информация о объекте..."
              className="w-full min-h-[80px] px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="plannedDisposalDate">Плановая дата списания</Label>
              <Input
                id="plannedDisposalDate"
                type="date"
                value={formData.plannedDisposalDate}
                onChange={(e) => setFormData({ ...formData, plannedDisposalDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plannedDisposalReason">Причина планового списания</Label>
              <Input
                id="plannedDisposalReason"
                value={formData.plannedDisposalReason}
                onChange={(e) => setFormData({ ...formData, plannedDisposalReason: e.target.value })}
                placeholder="Моральный износ, выход из строя и т.д."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {initialData?.id && (
        <Card className="border-yellow-200 bg-yellow-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-yellow-800">Основание редактирования *</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editReason" className="text-yellow-700">
                Укажите причину внесения изменений
              </Label>
              <textarea
                id="editReason"
                value={formData.editReason}
                onChange={(e) => setFormData({ ...formData, editReason: e.target.value })}
                placeholder="Например: Исправление ошибки в наименовании, изменение цены по договору..."
                className="w-full min-h-[80px] px-3 py-2 border border-yellow-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-y bg-white"
                required={!!initialData?.id}
              />
              <p className="text-xs text-yellow-600">
                * Без указания основания сохранение изменений невозможно
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-4">
        <Button type="submit" disabled={loading}>
          {loading ? 'Сохранение...' : (initialData ? 'Сохранить изменения' : 'Создать объект')}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/')}>
          Отмена
        </Button>
      </div>
    </form>
  )
}