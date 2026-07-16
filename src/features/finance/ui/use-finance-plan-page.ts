'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/toast'
import { pageConfig, createEmptyAllocation, emptyCell, formatAmountValue } from '@/features/finance/ui/config'
import {
  FinanceAllocationRow,
  FinancePlanRow,
  FinanceProjectOption,
  FinanceSectionType,
  FinanceSelectedCell,
  SalaryDetailGroup,
} from '@/features/finance/contracts/ui-types'

export function useFinancePlanPage(type: FinanceSectionType) {
  const { toast } = useToast()
  const config = pageConfig[type]
  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const [rows, setRows] = useState<FinancePlanRow[]>([])
  const [projects, setProjects] = useState<FinanceProjectOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedCell, setSelectedCell] = useState<FinanceSelectedCell | null>(null)
  const [cellForm, setCellForm] = useState({
    projectId: '',
    amount: '',
  })
  const [allocationRows, setAllocationRows] = useState<FinanceAllocationRow[]>([])

  const salaryDetailGroups = useMemo(() => {
    if (!selectedCell?.cell.details || selectedCell.cell.details.length === 0) return [] as SalaryDetailGroup[]

    const typeOrder: Record<string, number> = {
      Оклад: 0,
      Надбавка: 1,
    }

    return Array.from(
      selectedCell.cell.details.reduce((groups, detail) => {
        const currentGroup = groups.get(detail.typeLabel)

        if (currentGroup) {
          currentGroup.total += Number(detail.amount)
          currentGroup.items.push({
            projectCode: detail.projectCode,
            amount: detail.amount,
          })
        } else {
          groups.set(detail.typeLabel, {
            typeLabel: detail.typeLabel,
            total: Number(detail.amount),
            items: [
              {
                projectCode: detail.projectCode,
                amount: detail.amount,
              },
            ],
          })
        }

        return groups
      }, new Map<string, SalaryDetailGroup>())
    )
      .map(([, group]) => group)
      .sort((left, right) => (typeOrder[left.typeLabel] ?? 99) - (typeOrder[right.typeLabel] ?? 99))
  }, [selectedCell])

  const loadFinanceTable = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(config.endpoint(currentYear))

      if (!response.ok) {
        throw new Error('Failed to fetch finance table')
      }

      const payload = await response.json()
      const data = payload.data || payload
      setRows(data.rows)
      setProjects(data.projects || [])
    } catch (error) {
      console.error('Error loading finance table:', error)
    } finally {
      setLoading(false)
    }
  }, [config, currentYear])

  useEffect(() => {
    void loadFinanceTable()
  }, [loadFinanceTable])

  const totalRate = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.rate), 0),
    [rows]
  )

  const totalSalary = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.salary), 0),
    [rows]
  )

  const monthTotals = useMemo(
    () => Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => {
        const month = String(index + 1)
        const total = rows.reduce((sum, row) => sum + Number(formatAmountValue(row.months[month]?.amount || '0.00')), 0)
        return [month, total.toFixed(2)]
      })
    ),
    [rows]
  )

  const openCellDialog = useCallback((row: FinancePlanRow, month: number) => {
    const cell = row.months[String(month)] || emptyCell()

    setSelectedCell({
      employeeId: row.employeeId,
      employeeName: row.fullName,
      employeeSalary: row.salary,
      month,
      cell,
    })
    setCellForm({
      projectId: cell.projectId || '',
      amount: cell.amount === '0.00' ? '' : cell.amount,
    })
    setAllocationRows(
      cell.allocations && cell.allocations.length > 0
        ? cell.allocations.map((allocation, index) => ({
            localId: `${allocation.projectId}-${index}`,
            projectId: allocation.projectId,
            amount: allocation.amount,
          }))
        : [createEmptyAllocation()]
    )
  }, [])

  const closeCellDialog = useCallback(() => {
    setSelectedCell(null)
    setCellForm({ projectId: '', amount: '' })
    setAllocationRows([])
  }, [])

  const saveCell = useCallback(async () => {
    if (!selectedCell || !config.saveType) return

    const normalizedAmount = config.saveType === 'oklad'
      ? formatAmountValue(selectedCell.employeeSalary)
      : formatAmountValue(cellForm.amount)

    const normalizedAllocations = config.saveType === 'nadbavka'
      ? allocationRows
          .filter((allocation) => allocation.projectId || allocation.amount)
          .map((allocation) => ({
            projectId: allocation.projectId,
            amount: formatAmountValue(allocation.amount),
          }))
      : []

    if (config.saveType === 'oklad' && !cellForm.projectId) {
      toast.error('Выберите проект')
      return
    }

    if (config.saveType === 'oklad' && Number(normalizedAmount) <= 0) {
      toast.error('Для сотрудника не задан оклад')
      return
    }

    if (config.saveType === 'nadbavka') {
      if (normalizedAllocations.length === 0) {
        toast.error('Добавьте хотя бы одно начисление')
        return
      }

      const hasIncompleteAllocation = normalizedAllocations.some((allocation) => !allocation.projectId || Number(allocation.amount) <= 0)

      if (hasIncompleteAllocation) {
        toast.error('Заполните проект и сумму для каждой строки надбавки')
        return
      }
    }

    try {
      setSaving(true)

      const response = await fetch('/api/finance/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedCell.employeeId,
          year: currentYear,
          month: selectedCell.month,
          type: config.saveType,
          projectId: config.saveType === 'oklad' ? cellForm.projectId : undefined,
          amount: config.saveType === 'oklad' ? normalizedAmount : undefined,
          allocations: config.saveType === 'nadbavka' ? normalizedAllocations : undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || 'Failed to save finance plan cell')
      }

      closeCellDialog()
      await loadFinanceTable()
    } catch (error) {
      console.error('Error saving finance plan cell:', error)
      toast.error(error instanceof Error ? error.message : 'Ошибка при сохранении значения')
    } finally {
      setSaving(false)
    }
  }, [allocationRows, cellForm.amount, cellForm.projectId, closeCellDialog, config.saveType, currentYear, loadFinanceTable, selectedCell, toast])

  const clearCell = useCallback(async () => {
    if (!selectedCell || !config.saveType) return

    try {
      setSaving(true)

      const response = await fetch('/api/finance/plans', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedCell.employeeId,
          year: currentYear,
          month: selectedCell.month,
          type: config.saveType,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || 'Failed to clear finance plan cell')
      }

      closeCellDialog()
      await loadFinanceTable()
    } catch (error) {
      console.error('Error clearing finance plan cell:', error)
      toast.error(error instanceof Error ? error.message : 'Ошибка при очистке значения')
    } finally {
      setSaving(false)
    }
  }, [closeCellDialog, config.saveType, currentYear, loadFinanceTable, selectedCell, toast])

  return {
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
  }
}
