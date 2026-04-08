'use client'

import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDecimal } from '@/lib/utils'
import { employmentContractTypeLabels, type Employee, type StaffSchedule } from '@/types'

// Mocking the normalize function logic since we use it directly or via props
const normalizeEmploymentRateInput = (value: string) => {
  const normalizedValue = value.replace(',', '.').trim()
  if (!normalizedValue) return 0
  const parsedValue = Number(normalizedValue)
  return Number.isFinite(parsedValue) ? parsedValue : 0
}

interface DetailSummaryItemProps {
  label: string
  value: string
}

const DetailSummaryItem = ({ label, value }: DetailSummaryItemProps) => (
  <div className="rounded-lg border bg-slate-50/80 px-4 py-3">
    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
    <p className="mt-2 text-sm font-medium leading-snug text-slate-900">{value}</p>
  </div>
)

interface EmployeeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingEmployee: Employee | null
  formData: any
  setFormData: React.Dispatch<React.SetStateAction<any>>
  positionOptions: StaffSchedule[]
  onPositionChange: (value: string) => void
  onSave: (e: React.FormEvent) => void
  selectedPosition?: StaffSchedule | null
  availableRate: number
  calculatedSalary: number
}

export function EmployeeDialog({
  open,
  onOpenChange,
  editingEmployee,
  formData,
  setFormData,
  positionOptions,
  onPositionChange,
  onSave,
  selectedPosition,
  availableRate,
  calculatedSalary
}: EmployeeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editingEmployee ? 'Редактировать сотрудника' : 'Новый сотрудник'}</DialogTitle>
          <DialogDescription>
            Заполни карточку сотрудника и выбери должность из штатного расписания.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSave} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)_220px] md:items-start">
            <div className="space-y-2">
              <Label htmlFor="employee-code">Табельный номер</Label>
              <Input
                id="employee-code"
                value={formData.code}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, code: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-position">Должность</Label>
              <Select value={formData.staffScheduleId} onValueChange={onPositionChange}>
                <SelectTrigger id="employee-position">
                  <SelectValue placeholder="Выберите должность" />
                </SelectTrigger>
                <SelectContent>
                  {positionOptions.map((position) => (
                    <SelectItem key={position.id} value={position.id}>
                      {position.position} ({position.department})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-rate">Количество ставок</Label>
              <Input
                id="employee-rate"
                type="number"
                min="0.01"
                step="any"
                value={formData.employmentRate}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, employmentRate: normalizeEmploymentRateInput(e.target.value) }))}
                disabled={formData.staffScheduleId === 'none'}
                required
              />
              <p className="text-xs text-muted-foreground">
                {selectedPosition
                  ? `Доступно: ${formatDecimal(availableRate)} ст.`
                  : 'Сначала выбери должность'}
              </p>
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailSummaryItem label="Подразделение" value={formData.department || '—'} />
            <DetailSummaryItem
              label="Оклад за ставку"
              value={selectedPosition ? formatCurrency(selectedPosition.salary) : '—'}
            />
            <DetailSummaryItem
              label="Количество ставок"
              value={formData.staffScheduleId === 'none' ? '—' : formatDecimal(formData.employmentRate)}
            />
            <DetailSummaryItem
              label="Итоговый оклад"
              value={selectedPosition ? formatCurrency(calculatedSalary) : '—'}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="employee-name">ФИО полностью</Label>
              <Input
                id="employee-name"
                value={formData.fullName}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, fullName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-4 md:col-span-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="employee-phone">Телефон</Label>
                  <Input
                    id="employee-phone"
                    value={formData.phone}
                    onChange={(e) => setFormData((prev: any) => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee-email">Почта</Label>
                  <Input
                    id="employee-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((prev: any) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="employee-contract-type">Вид трудового договора</Label>
                <Select
                  value={formData.contractType}
                  onValueChange={(value) => setFormData((prev: any) => ({ ...prev, contractType: value }))}
                >
                  <SelectTrigger id="employee-contract-type">
                    <SelectValue placeholder="Выберите вид договора" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(employmentContractTypeLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="employee-contract-signed">Дата подписания</Label>
                  <Input
                    id="employee-contract-signed"
                    type="date"
                    value={formData.contractSignedDate}
                    onChange={(e) => setFormData((prev: any) => ({ ...prev, contractSignedDate: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee-contract-end">Срок действия (по)</Label>
                  <Input
                    id="employee-contract-end"
                    type="date"
                    value={formData.contractEndDate}
                    onChange={(e) => setFormData((prev: any) => ({ ...prev, contractEndDate: e.target.value }))}
                  />
                  <p className="text-[10px] text-muted-foreground">Оставь пустым, если бессрочный</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-contract-number">Номер трудового договора</Label>
              <Input
                id="employee-contract-number"
                value={formData.contractNumber}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, contractNumber: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit">{editingEmployee ? 'Сохранить изменения' : 'Создать'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
