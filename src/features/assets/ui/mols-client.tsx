'use client'

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Plus, Edit, Trash2, Upload, User, Search, X } from "lucide-react"
import type { Mol } from '@/features/assets/contracts/types'

export function MolsClient({ initialMols, canEdit }: { initialMols: Mol[]; canEdit: boolean }) {
  const [mols, setMols] = useState<Mol[]>(initialMols)
  const [loading, setLoading] = useState(false)
  const [editingMol, setEditingMol] = useState<Mol | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [formData, setFormData] = useState({
    code: '',
    department: '',
    fullName: '',
    storageLocation: '',
    photo: '',
  })
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const loadMols = async () => {
    try {
      const res = await fetch('/api/mols')
      const data = await res.json()
      setMols(data.data || [])
      setLoading(false)
    } catch (error) {
      console.error('Error loading MOLs:', error)
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = reader.result as string
        setPreviewImage(base64)
        setFormData({ ...formData, photo: base64 })
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const url = editingMol 
        ? `/api/mols/${editingMol.id}`
        : '/api/mols'
      const method = editingMol ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        setIsDialogOpen(false)
        setEditingMol(null)
        setFormData({ code: '', department: '', fullName: '', storageLocation: '', photo: '' })
        setPreviewImage(null)
        loadMols()
      }
    } catch (error) {
      console.error('Error saving MOL:', error)
    }
  }

  const handleEdit = (mol: Mol) => {
    setEditingMol(mol)
    setFormData({
      code: mol.code,
      department: mol.department,
      fullName: mol.fullName,
      storageLocation: mol.storageLocation,
      photo: mol.photo || '',
    })
    setPreviewImage(mol.photo || null)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Вы уверены, что хотите удалить этого МОЛ?')) return
    
    try {
      const res = await fetch(`/api/mols/${id}`, { method: 'DELETE' })
      if (res.ok) {
        loadMols()
      }
    } catch (error) {
      console.error('Error deleting MOL:', error)
    }
  }

  const handleAddNew = () => {
    setEditingMol(null)
    setFormData({ code: '', department: '', fullName: '', storageLocation: '', photo: '' })
    setPreviewImage(null)
    setIsDialogOpen(true)
  }

  const filteredMols = mols.filter((mol) => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()
    return (
      mol.fullName.toLowerCase().includes(searchLower) ||
      mol.code.toLowerCase().includes(searchLower) ||
      mol.department.toLowerCase().includes(searchLower)
    )
  })

  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">МОЛ (Материально-ответственные лица)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Управление ответственными лицами и их подразделениями
          </p>
        </div>
        {canEdit && <Button onClick={handleAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          Добавить МОЛ
        </Button>}
      </div>

      {/* Поиск */}
      <div className="mb-4 flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по ФИО, коду или отделу..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        {searchTerm && (
          <Button variant="ghost" onClick={() => setSearchTerm('')}>
            <X className="mr-2 h-4 w-4" />
            Сбросить
          </Button>
        )}
        <span className="text-sm text-muted-foreground">
          Показано {filteredMols.length} из {mols.length}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Фото</TableHead>
                <TableHead>Код</TableHead>
                <TableHead>ФИО</TableHead>
                <TableHead>Подразделение</TableHead>
                <TableHead>Место хранения</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={`cell-${i}-${j}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredMols.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? 'Ничего не найдено' : 'Нет МОЛ'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredMols.map((mol) => (
                  <TableRow key={mol.id}>
                    <TableCell>
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={mol.photo || undefined} alt={mol.fullName} />
                        <AvatarFallback>
                          <User className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-mono font-medium">{mol.code}</TableCell>
                    <TableCell className="font-medium">{mol.fullName}</TableCell>
                    <TableCell>{mol.department}</TableCell>
                    <TableCell className="text-muted-foreground">{mol.storageLocation}</TableCell>
                    <TableCell className="text-right">
                      {canEdit && <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleEdit(mol)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDelete(mol.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingMol ? 'Редактирование МОЛ' : 'Новый МОЛ'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex gap-6">
              {/* Фото слева */}
              <div className="flex-shrink-0">
                <Label className="block mb-2">Фото</Label>
                <div className="relative">
                  <Avatar className="h-32 w-32">
                    <AvatarImage src={previewImage || ''} alt="Preview" />
                    <AvatarFallback className="bg-muted">
                      <User className="h-16 w-16 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <label className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-2 cursor-pointer hover:bg-primary/90">
                    <Upload className="h-4 w-4" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Нажмите для загрузки
                </p>
              </div>

              {/* Поля справа */}
              <div className="flex-1 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Код МОЛ *</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      placeholder="MOL-001"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">ФИО *</Label>
                    <Input
                      id="fullName"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="Иванов Иван Иванович"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Подразделение *</Label>
                  <Input
                    id="department"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    placeholder="Отдел информационных технологий"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storageLocation">Место хранения *</Label>
                  <Input
                    id="storageLocation"
                    value={formData.storageLocation}
                    onChange={(e) => setFormData({ ...formData, storageLocation: e.target.value })}
                    placeholder="Кабинет 101, 1 этаж"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit">
                {editingMol ? 'Сохранить' : 'Создать'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
