'use client'

import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency, formatDecimal } from '@/lib/utils'
import { personnelActionLabels, type Employee, type StaffSchedule } from '@/features/employees/contracts/types'

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

interface ActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  formData: any
  setFormData: React.Dispatch<React.SetStateAction<any>>
  onSave: (e: React.FormEvent) => void
  employees: Employee[]
  onActionTypeChange: (value: string) => void
  onEmployeeChange: (value: string) => void
  onPositionChange: (value: string) => void
  transferPositionOptions: StaffSchedule[]
  selectedActionEmployee: Employee | null
  selectedActionPosition: StaffSchedule | null | undefined
  availableActionRate: number
  calculatedActionSalary: number
}

export function ActionDialog({
  open,
  onOpenChange,
  formData,
  setFormData,
  onSave,
  employees,
  onActionTypeChange,
  onEmployeeChange,
  onPositionChange,
  transferPositionOptions,
  selectedActionEmployee,
  selectedActionPosition,
  availableActionRate,
  calculatedActionSalary
}: ActionDialogProps) {
  const isPositionAction = formData.type === 'TRANSFER' || formData.type === 'PROMOTE'
  const isDismissAction = formData.type === 'DISMISS'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Кадровое действие</DialogTitle>
          <DialogDescription>
            Выбери тип действия и сотрудника для фиксации события.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSave} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_150px] md:items-start">
            <div className="space-y-2">
              <Label htmlFor="action-type">Тип действия</Label>
              <Select value={formData.type} onValueChange={onActionTypeChange}>
                <SelectTrigger id="action-type">
                  <SelectValue placeholder="Выберите тип" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries({
                    TRANSFER: personnelActionLabels.TRANSFER,
                    EXTEND: personnelActionLabels.EXTEND,
                    PROMOTE: personnelActionLabels.PROMOTE,
                    DISMISS: personnelActionLabels.DISMISS,
                    EDIT: personnelActionLabels.EDIT,
                  }).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="action-employee">Сотрудник</Label>
              <Select value={formData.employeeId} onValueChange={onEmployeeChange}>
                <SelectTrigger id="action-employee">
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
              <Label htmlFor="action-date">Дата</Label>
              <Input
                id="action-date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, date: e.target.value }))}
                required
              />
            </div>
          </div>

          {isPositionAction && (
            <>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
                <div className="space-y-2">
                  <Label htmlFor="action-position">Новая должность</Label>
                  <Select value={formData.staffScheduleId} onValueChange={onPositionChange}>
                    <SelectTrigger id="action-position">
                      <SelectValue placeholder="Выберите должность" />
                    </SelectTrigger>
                    <SelectContent>
                      {transferPositionOptions.map((position) => (
                        <SelectItem key={position.id} value={position.id}>
                          {position.position} ({position.department})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="action-rate">Количество ставок</Label>
                  <Input
                    id="action-rate"
                    type="number"
                    min="0.01"
                    step="any"
                    value={formData.employmentRate}
                    onChange={(e) => setFormData((prev: any) => ({ ...prev, employmentRate: normalizeEmploymentRateInput(e.target.value) }))}
                    disabled={formData.staffScheduleId === 'none'}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {selectedActionPosition
                      ? `Доступно для назначения: ${formatDecimal(availableActionRate)} ст.`
                      : 'Сначала выбери должность'}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailSummaryItem label="Новое подразделение" value={formData.newDepartment || '—'} />
                <DetailSummaryItem
                  label="Оклад за ставку"
                  value={selectedActionPosition ? formatCurrency(selectedActionPosition.salary) : '—'}
                />
                <DetailSummaryItem
                  label="Новые ставки"
                  value={formData.staffScheduleId === 'none' ? '—' : formatDecimal(formData.employmentRate)}
                />
                <DetailSummaryItem
                  label="Новый итоговый оклад"
                  value={selectedActionPosition ? formatCurrency(calculatedActionSalary) : '—'}
                />
              </div>
            </>
          )}

          {formData.type === 'EXTEND' && (
            <div className="space-y-2">
              <Label htmlFor="action-new-end">Продлить до (новый срок действия)</Label>
              <Input
                id="action-new-end"
                type="date"
                value={formData.newContractEndDate}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, newContractEndDate: e.target.value }))}
                required
              />
              <p className="text-[10px] text-muted-foreground">Оставьте без изменений, если договор становится бессрочным, но уберите дату при редактировании карточки</p>
            </div>
          )}

          {isDismissAction && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-medium">Сотрудник будет перенесен в архив</p>
              <p className="mt-1 text-xs leading-relaxed">
                После формирования действия сотрудник исчезнет из активного списка и появится в архиве сотрудников.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="action-description">Комментарий / Примечание</Label>
            <Textarea
              id="action-description"
              value={formData.description}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, description: e.target.value }))}
              placeholder="Приказ № 123 от..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit">Сформировать</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
