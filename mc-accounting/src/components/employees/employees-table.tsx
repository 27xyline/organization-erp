'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Edit, Users } from 'lucide-react'
import { formatDate, formatDecimal } from '@/lib/utils'
import { EmployeesTableSkeleton } from './employees-table-skeleton'
import {
  type Employee,
  employeeStatusLabels,
  employmentContractTypeLabels
} from '@/types'

const isContractExpired = (employee: Employee, date: Date) =>
  employee.status !== 'DISMISSED' && Boolean(employee.contractEndDate && employee.contractEndDate < date)

interface EmployeesTableProps {
  loading: boolean
  activeEmployees: Employee[]
  startOfToday: Date
  onEditEmployee: (employee: Employee) => void
  getLiveStatus: (employee: Employee) => { label: string; className: string }
}

export function EmployeesTable({
  loading,
  activeEmployees,
  startOfToday,
  onEditEmployee,
  getLiveStatus
}: EmployeesTableProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredEmployees = useMemo(() => {
    if (!searchTerm.trim()) return activeEmployees

    const value = searchTerm.trim().toLowerCase()

    return activeEmployees.filter((employee) => {
      return (
        employee.fullName.toLowerCase().includes(value) ||
        employee.code.toLowerCase().includes(value) ||
        employee.department.toLowerCase().includes(value) ||
        (employee.contractNumber || '').toLowerCase().includes(value) ||
        employee.staffSchedule?.position?.toLowerCase().includes(value)
      )
    })
  }, [activeEmployees, searchTerm])

  const expiredActiveEmployees = useMemo(
    () => activeEmployees.filter((employee) => isContractExpired(employee, startOfToday)),
    [activeEmployees, startOfToday]
  )

  return (
    <Card className="mt-6">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Сотрудники
            </CardTitle>
          </div>

          <div className="relative w-full lg:w-[320px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Поиск по ФИО, договору, должности"
              className="pl-10"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">В штате</p>
            <p className="mt-2 text-sm font-medium">{activeEmployees.length} чел.</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Основных договоров</p>
            <p className="mt-2 text-sm font-medium">
              {activeEmployees.filter((e) => e.contractType === 'PRIMARY').length}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Договор истек</p>
            <p className="mt-2 text-sm font-medium">{expiredActiveEmployees.length}</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead>ФИО</TableHead>
                <TableHead>Должность</TableHead>
                <TableHead>Количество ставок</TableHead>
                <TableHead>Вид трудового договора</TableHead>
                <TableHead>Срок действия трудового договора</TableHead>
                <TableHead>Дата подписания трудового договора</TableHead>
                <TableHead>Номер трудового договора</TableHead>
                <TableHead className="w-[96px] text-right">&nbsp;</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <EmployeesTableSkeleton />
              ) : filteredEmployees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    Сотрудники по текущему фильтру не найдены.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEmployees.map((employee) => {
                  const liveStatus = getLiveStatus(employee)
                  const expiredContract = isContractExpired(employee, startOfToday)

                  return (
                    <TableRow key={employee.id} className={expiredContract ? 'bg-amber-50/40' : undefined}>
                      <TableCell>
                        <div className="min-w-[220px]">
                          <p className="font-medium text-slate-900">{employee.fullName}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{employee.code}</span>
                            {expiredContract && (
                              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                Договор истек
                              </Badge>
                            )}
                            {liveStatus.label !== employeeStatusLabels.ACTIVE && (
                              <Badge variant="outline" className={liveStatus.className}>
                                {liveStatus.label}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{employee.staffSchedule?.position || '—'}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{employee.department || '—'}</p>
                        </div>
                      </TableCell>
                      <TableCell>{employee.staffSchedule ? formatDecimal(employee.employmentRate) : '—'}</TableCell>
                      <TableCell>{employmentContractTypeLabels[employee.contractType]}</TableCell>
                      <TableCell>{employee.contractEndDate ? formatDate(employee.contractEndDate) : 'Бессрочно'}</TableCell>
                      <TableCell>{employee.contractSignedDate ? formatDate(employee.contractSignedDate) : '—'}</TableCell>
                      <TableCell>{employee.contractNumber || '—'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditEmployee(employee)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
