'use client'

import { Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { FinancePlanCellDialog } from '@/components/finance-plan/finance-plan-cell-dialog'
import { FinancePlanTable } from '@/components/finance-plan/finance-plan-table'
import { useFinancePlanPage } from '@/components/finance-plan/use-finance-plan-page'
import { FinanceSectionType } from '@/components/finance-plan/types'

export function FinancePlanPage({ type }: { type: FinanceSectionType }) {
  const {
    config,
    currentYear,
    rows,
    projects,
    loading,
    saving,
    selectedCell,
    cellForm,
    setCellForm,
    allocationRows,
    setAllocationRows,
    salaryDetailGroups,
    totalRate,
    totalSalary,
    monthTotals,
    openCellDialog,
    closeCellDialog,
    saveCell,
    clearCell,
  } = useFinancePlanPage(type)

  const selectedProjectCaption = selectedCell?.cell.projectLabel || selectedCell?.cell.projectCode || ''
  const isSalarySection = type === 'salary'
  const canClearCell = Boolean(selectedCell && Number(selectedCell.cell.amount) > 0 && config.editable)

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold">
            <span className={cn('inline-flex rounded-xl p-2', config.iconClassName)}>
              <Wallet className="h-6 w-6" />
            </span>
            {config.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Текущий год: {currentYear}</p>
        </div>

        <div className={cn('rounded-full border px-3 py-1 text-sm font-medium', config.badgeClassName)}>
          {config.modeLabel}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{config.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <FinancePlanTable
            loading={loading}
            rows={rows}
            totalRate={totalRate}
            totalSalary={totalSalary}
            monthTotals={monthTotals}
            editable={config.editable}
            onCellClick={openCellDialog}
          />
        </CardContent>
      </Card>

      <FinancePlanCellDialog
        title={config.title}
        saveType={config.saveType}
        selectedCell={selectedCell}
        selectedProjectCaption={selectedProjectCaption}
        isSalarySection={isSalarySection}
        projects={projects}
        salaryDetailGroups={salaryDetailGroups}
        cellForm={cellForm}
        setCellForm={setCellForm}
        allocationRows={allocationRows}
        setAllocationRows={setAllocationRows}
        canClearCell={canClearCell}
        saving={saving}
        onClose={closeCellDialog}
        onSave={saveCell}
        onClear={clearCell}
      />
    </div>
  )
}
