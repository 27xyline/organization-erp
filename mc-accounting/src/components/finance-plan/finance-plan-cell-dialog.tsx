'use client'

import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatCurrency } from '@/lib/utils'
import { createEmptyAllocation, monthLabels } from '@/components/finance-plan/config'
import {
  FinanceAllocationRow,
  FinanceProjectOption,
  FinanceSelectedCell,
  SalaryDetailGroup,
} from '@/components/finance-plan/types'

interface FinancePlanCellDialogProps {
  title: string
  saveType?: 'oklad' | 'nadbavka'
  selectedCell: FinanceSelectedCell | null
  selectedProjectCaption: string
  isSalarySection: boolean
  projects: FinanceProjectOption[]
  salaryDetailGroups: SalaryDetailGroup[]
  cellForm: {
    projectId: string
    amount: string
  }
  setCellForm: React.Dispatch<React.SetStateAction<{
    projectId: string
    amount: string
  }>>
  allocationRows: FinanceAllocationRow[]
  setAllocationRows: React.Dispatch<React.SetStateAction<FinanceAllocationRow[]>>
  canClearCell: boolean
  saving: boolean
  onClose: () => void
  onSave: () => void
  onClear: () => void
}

const renderBudgetSummary = (
  projects: FinanceProjectOption[],
  projectId: string | null | undefined
) => {
  if (!projectId) return null

  const project = projects.find((item) => item.id === projectId)

  return (
    <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm text-muted-foreground">
      {project ? (
        <div className="flex items-center justify-between gap-3">
          <span>Остаток бюджета</span>
          <span className="font-medium text-slate-700">{formatCurrency(project.remainingBudget)}</span>
        </div>
      ) : (
        'Проект не найден'
      )}
    </div>
  )
}

export function FinancePlanCellDialog({
  title,
  saveType,
  selectedCell,
  selectedProjectCaption,
  isSalarySection,
  projects,
  salaryDetailGroups,
  cellForm,
  setCellForm,
  allocationRows,
  setAllocationRows,
  canClearCell,
  saving,
  onClose,
  onSave,
  onClear,
}: FinancePlanCellDialogProps) {
  return (
    <Dialog open={Boolean(selectedCell)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn('max-w-xl min-h-[620px]', saveType === 'nadbavka' && 'max-w-2xl')}>
        <DialogHeader>
          <DialogTitle>{title}: {selectedCell ? monthLabels[selectedCell.month - 1] : ''}</DialogTitle>
          <DialogDescription className="max-w-2xl leading-relaxed">
            {isSalarySection
              ? 'Здесь показано, из каких проектов и начислений складывается сумма заработной платы за выбранный месяц.'
              : saveType === 'oklad'
              ? 'Выбери проект. Сумма будет автоматически взята из оклада сотрудника и списана из бюджета проекта.'
              : 'Выбери проект и укажи сумму. Эта сумма будет списана из бюджета проекта и отобразится в таблице.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col space-y-4">
          <div className="rounded-xl border bg-slate-50/70 p-4 text-sm">
            <p className="font-medium text-slate-900">{selectedCell?.employeeName}</p>
            {saveType === 'oklad' && (
              <p className="mt-2 text-muted-foreground">
                Оклад сотрудника: {selectedCell ? formatCurrency(selectedCell.employeeSalary) : '—'}
              </p>
            )}
            {selectedProjectCaption ? (
              <p className="mt-2 text-muted-foreground">
                {saveType === 'nadbavka' ? 'Текущие проекты' : 'Текущий проект'}: {selectedProjectCaption}
              </p>
            ) : null}
            {isSalarySection && selectedCell && Number(selectedCell.cell.amount) > 0 && (
              <p className="mt-2 text-muted-foreground">
                Сумма за месяц: {formatCurrency(selectedCell.cell.amount)}
              </p>
            )}
          </div>

          {isSalarySection ? (
            <div className="flex min-h-0 flex-1 flex-col space-y-4">
              {salaryDetailGroups.length > 0 ? (
                <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                  {salaryDetailGroups.map((group) => (
                    <div key={group.typeLabel} className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3 border-b pb-3">
                        <p className="text-sm font-semibold text-slate-900">{group.typeLabel}</p>
                        <p className="text-sm font-semibold text-slate-900">{formatCurrency(group.total)}</p>
                      </div>

                      <div className="mt-3 space-y-3">
                        {group.items.map((item, index) => (
                          <div key={`${group.typeLabel}-${item.projectCode}-${index}`} className="flex items-start justify-between gap-3 rounded-lg border bg-slate-50/70 px-4 py-3">
                            <p className="text-sm text-slate-700">{item.projectCode}</p>
                            <p className="text-sm font-medium text-slate-900">{formatCurrency(item.amount)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Для этого месяца нет проектных начислений.
                </div>
              )}

              <div className="rounded-xl border bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-700">Итого за месяц</span>
                  <span className="text-base font-semibold text-slate-900">{formatCurrency(selectedCell?.cell.amount || '0.00')}</span>
                </div>
              </div>
            </div>
          ) : saveType === 'oklad' ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="finance-project">Проект</Label>
                <Select value={cellForm.projectId} onValueChange={(value) => setCellForm((prev) => ({ ...prev, projectId: value }))}>
                  <SelectTrigger id="finance-project">
                    <SelectValue placeholder="Выберите проект" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {renderBudgetSummary(projects, cellForm.projectId)}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm font-medium text-slate-900">Проекты и суммы</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setAllocationRows((current) => [...current, createEmptyAllocation()])}>
                  <Plus className="mr-2 h-4 w-4" />
                  Добавить проект
                </Button>
              </div>

              <div className="space-y-3">
                {allocationRows.map((allocation, index) => (
                  <div key={allocation.localId} className="rounded-xl border p-4">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_44px] md:items-start">
                      <div className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                          <div className="space-y-2">
                            <Label htmlFor={`finance-project-${allocation.localId}`}>Проект {index + 1}</Label>
                            <Select
                              value={allocation.projectId}
                              onValueChange={(value) => setAllocationRows((current) => current.map((row) => row.localId === allocation.localId ? { ...row, projectId: value } : row))}
                            >
                              <SelectTrigger id={`finance-project-${allocation.localId}`}>
                                <SelectValue placeholder="Выберите проект" />
                              </SelectTrigger>
                              <SelectContent>
                                {projects.map((project) => (
                                  <SelectItem key={project.id} value={project.id}>
                                    {project.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`finance-amount-${allocation.localId}`}>Сумма</Label>
                            <Input
                              id={`finance-amount-${allocation.localId}`}
                              value={allocation.amount}
                              onChange={(e) => setAllocationRows((current) => current.map((row) => row.localId === allocation.localId ? { ...row, amount: e.target.value.replace(',', '.') } : row))}
                              inputMode="decimal"
                              placeholder="0.00"
                            />
                          </div>
                        </div>

                        {renderBudgetSummary(projects, allocation.projectId)}
                      </div>

                      <div className="flex items-center justify-end md:pt-8">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 text-red-500 hover:text-red-700"
                          onClick={() => setAllocationRows((current) => current.length > 1 ? current.filter((row) => row.localId !== allocation.localId) : [createEmptyAllocation()])}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between gap-2 pt-2">
            <div>
              {canClearCell && (
                <Button type="button" variant="outline" onClick={onClear} disabled={saving}>
                  Очистить
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Отмена
              </Button>
              {!isSalarySection && (
                <Button type="button" onClick={onSave} disabled={saving}>
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
