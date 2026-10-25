'use client'

import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { vacationTypeLabels, type Vacation, type Employee } from '@/features/employees/contracts/types'

interface VacationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingVacation: Vacation | null
  formData: any
  setFormData: React.Dispatch<React.SetStateAction<any>>
  onSave: (e: React.FormEvent) => void
  employees: Employee[]
}

export function VacationDialog({
  open,
  onOpenChange,
  editingVacation,
  formData,
  setFormData,
  onSave,
  employees
}: VacationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingVacation ? 'Редактировать отпуск' : 'Добавить отпуск'}</DialogTitle>
          <DialogDescription>
            Укажите сотрудника и период отпуска/больничного.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vacation-employee">Сотрудник</Label>
            <Select
              value={formData.employeeId}
              onValueChange={(value) => setFormData((prev: any) => ({ ...prev, employeeId: value }))}
            >
              <SelectTrigger id="vacation-employee">
                <SelectValue placeholder="Выберите сотрудника" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.fullName} ({employee.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vacation-type">Вид отсутствия</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData((prev: any) => ({ ...prev, type: value }))}
            >
              <SelectTrigger id="vacation-type">
                <SelectValue placeholder="Выберите вид отсутствия" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(vacationTypeLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vacation-start">Начало</Label>
              <Input
                id="vacation-start"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, startDate: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vacation-end">Окончание</Label>
              <Input
                id="vacation-end"
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, endDate: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit">{editingVacation ? 'Сохранить изменения' : 'Создать'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
