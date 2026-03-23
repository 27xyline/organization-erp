'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Archive, ArrowLeft, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatDecimal } from '@/lib/utils'

type EmploymentContractType = 'PRIMARY' | 'INTERNAL' | 'EXTERNAL'

interface Employee {
  id: string
  code: string
  fullName: string
  department: string
  contractType: EmploymentContractType
  contractSignedDate?: Date | null
  contractEndDate?: Date | null
  contractNumber?: string | null
  staffSchedule?: {
    id: string
    position: string
    department: string
    rate: number
  } | null
}

const employmentContractTypeLabels: Record<EmploymentContractType, string> = {
  PRIMARY: 'Основной',
  INTERNAL: 'Внутренний',
  EXTERNAL: 'Внешний',
}

const normalizeEmployee = (employee: any): Employee => ({
  id: employee.id,
  code: employee.code,
  fullName: employee.fullName,
  department: employee.department,
  contractType: employee.contractType || 'PRIMARY',
  contractSignedDate: employee.contractSignedDate ? new Date(employee.contractSignedDate) : null,
  contractEndDate: employee.contractEndDate ? new Date(employee.contractEndDate) : null,
  contractNumber: employee.contractNumber || '',
  staffSchedule: employee.staffSchedule
    ? {
        id: employee.staffSchedule.id,
        position: employee.staffSchedule.position,
        department: employee.staffSchedule.department,
        rate: Number(employee.staffSchedule.rate || 0),
      }
    : null,
})

export default function EmployeeArchivePage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [extendForm, setExtendForm] = useState({
    newContractEndDate: '',
    description: '',
  })

  const loadEmployees = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/employees?scope=expired')

      if (!response.ok) {
        throw new Error('Failed to fetch archived employees')
      }

      const data = await response.json()
      setEmployees(data.map(normalizeEmployee))
    } catch (error) {
      console.error('Error loading archived employees:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEmployees()
  }, [])

  const filteredEmployees = useMemo(() => {
    if (!searchTerm.trim()) return employees

    const value = searchTerm.trim().toLowerCase()

    return employees.filter((employee) => (
      employee.fullName.toLowerCase().includes(value) ||
      employee.code.toLowerCase().includes(value) ||
      employee.department.toLowerCase().includes(value) ||
      (employee.contractNumber || '').toLowerCase().includes(value) ||
      employee.staffSchedule?.position?.toLowerCase().includes(value)
    ))
  }, [employees, searchTerm])

  const openExtendDialog = (employee: Employee) => {
    setSelectedEmployee(employee)
    setExtendForm({
      newContractEndDate: '',
      description: '',
    })
  }

  const handleExtendContract = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedEmployee) return

    if (!extendForm.newContractEndDate) {
      alert('Укажите новую дату окончания договора')
      return
    }

    if (
      selectedEmployee.contractSignedDate &&
      new Date(extendForm.newContractEndDate) <= selectedEmployee.contractSignedDate
    ) {
      alert('Дата подписания договора должна быть раньше срока действия договора')
      return
    }

    try {
      setSaving(true)

      const response = await fetch('/api/personnel-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployee.id,
          type: 'EXTEND',
          date: new Date().toISOString().split('T')[0],
          newContractEndDate: extendForm.newContractEndDate,
          description: extendForm.description || `Продление договора сотрудника ${selectedEmployee.fullName}`,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || 'Failed to extend employee contract')
      }

      setSelectedEmployee(null)
      await loadEmployees()
    } catch (error) {
      console.error('Error extending employee contract:', error)
      alert(error instanceof Error ? error.message : 'Ошибка при продлении договора')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Link href="/employees">
            <Button variant="ghost" className="pl-0">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Назад к сотрудникам
            </Button>
          </Link>

          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Archive className="h-6 w-6" />
              Архив сотрудников
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Сотрудники с истекшим сроком действия трудового договора.
            </p>
          </div>
        </div>

        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Поиск по ФИО, договору, должности"
            className="pl-10"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Архив</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Сотрудников в архиве</p>
              <p className="mt-2 text-sm font-medium">{employees.length}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Найдено по фильтру</p>
              <p className="mt-2 text-sm font-medium">{filteredEmployees.length}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Основных договоров</p>
              <p className="mt-2 text-sm font-medium">
                {employees.filter((employee) => employee.contractType === 'PRIMARY').length}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead>ФИО</TableHead>
                  <TableHead>Должность</TableHead>
                  <TableHead>Доля ставки</TableHead>
                  <TableHead>Вид трудового договора</TableHead>
                  <TableHead>Срок действия трудового договора</TableHead>
                  <TableHead>Дата подписания трудового договора</TableHead>
                  <TableHead>Номер трудового договора</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="w-[120px] text-right">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      Загрузка архива сотрудников...
                    </TableCell>
                  </TableRow>
                ) : filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      Архив сотрудников пуст.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmployees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div className="min-w-[220px]">
                          <p className="font-medium text-slate-900">{employee.fullName}</p>
                          <p className="mt-1 text-xs font-mono text-muted-foreground">{employee.code}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{employee.staffSchedule?.position || '—'}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{employee.department || '—'}</p>
                        </div>
                      </TableCell>
                      <TableCell>{employee.staffSchedule ? formatDecimal(employee.staffSchedule.rate) : '—'}</TableCell>
                      <TableCell>{employmentContractTypeLabels[employee.contractType]}</TableCell>
                      <TableCell>{employee.contractEndDate ? formatDate(employee.contractEndDate) : '—'}</TableCell>
                      <TableCell>{employee.contractSignedDate ? formatDate(employee.contractSignedDate) : '—'}</TableCell>
                      <TableCell>{employee.contractNumber || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                          Договор истек
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openExtendDialog(employee)}>
                          Продлить
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedEmployee)} onOpenChange={(open) => !open && setSelectedEmployee(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Продлить трудовой договор</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleExtendContract} className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <p className="font-medium text-slate-900">{selectedEmployee?.fullName}</p>
              <div className="mt-2 space-y-1 text-muted-foreground">
                <p>Текущий срок: {selectedEmployee?.contractEndDate ? formatDate(selectedEmployee.contractEndDate) : '—'}</p>
                <p>Дата подписания: {selectedEmployee?.contractSignedDate ? formatDate(selectedEmployee.contractSignedDate) : '—'}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="archive-contract-end">Новая дата окончания договора</Label>
              <Input
                id="archive-contract-end"
                type="date"
                value={extendForm.newContractEndDate}
                onChange={(e) => setExtendForm((prev) => ({ ...prev, newContractEndDate: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="archive-contract-description">Описание</Label>
              <Textarea
                id="archive-contract-description"
                value={extendForm.description}
                onChange={(e) => setExtendForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Например: продление договора на 12 месяцев"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setSelectedEmployee(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Сохранение...' : 'Продлить'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
