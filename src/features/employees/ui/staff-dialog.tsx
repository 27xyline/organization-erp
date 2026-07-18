'use client'

import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { type StaffSchedule } from '@/features/employees/contracts/types'

interface StaffDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingStaff: StaffSchedule | null
  formData: any
  setFormData: React.Dispatch<React.SetStateAction<any>>
  onSave: (e: React.FormEvent) => void
  departments: Array<{ id: string; code: string; name: string }>
}

const normalizeEmploymentRateInput = (value: string) => {
  const normalizedValue = value.replace(',', '.').trim()
  if (!normalizedValue) return 0
  const parsedValue = Number(normalizedValue)
  return Number.isFinite(parsedValue) ? parsedValue : 0
}

export function StaffDialog({
  open,
  onOpenChange,
  editingStaff,
  formData,
  setFormData,
  onSave,
  departments,
}: StaffDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingStaff ? 'Редактировать должность' : 'Новая должность'}</DialogTitle>
          <DialogDescription>
            Укажите данные должности для штатного расписания.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="staff-position">Наименование должности</Label>
            <Input
              id="staff-position"
              value={formData.position}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, position: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-department">Подразделение</Label>
            <Select
              value={formData.departmentId}
              onValueChange={(value) => {
                const department = departments.find((item) => item.id === value)
                setFormData((prev: any) => ({
                  ...prev,
                  departmentId: value,
                  department: department?.name || prev.department,
                }))
              }}
            >
              <SelectTrigger id="staff-department">
                <SelectValue placeholder="Выберите подразделение" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name} ({department.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="staff-rate">Количество ставок</Label>
              <Input
                id="staff-rate"
                type="number"
                min="0.01"
                step="any"
                value={formData.rate}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, rate: normalizeEmploymentRateInput(e.target.value) }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-salary">Твердый оклад (₽)</Label>
              <Input
                id="staff-salary"
                type="number"
                min="0"
                step="0.01"
                value={formData.salary}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, salary: Number(e.target.value) }))}
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit">{editingStaff ? 'Сохранить изменения' : 'Создать'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
