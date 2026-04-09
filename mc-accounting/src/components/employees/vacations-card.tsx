'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { VacationGantt } from '@/components/vacation-gantt'
import { Skeleton } from '@/components/ui/skeleton'
import { type Employee, type Vacation } from '@/types'

const isContractExpired = (employee: Employee, date: Date) =>
  employee.status !== 'DISMISSED' && Boolean(employee.contractEndDate && employee.contractEndDate < date)

interface VacationsCardProps {
  vacationsLoading: boolean
  vacations: Vacation[]
  activeEmployees: Employee[]
  startOfToday: Date
  selectedYear: number
  onYearChange: (year: number) => void
  onVacationClick: (vacation: Vacation) => void
}

export function VacationsCard({
  vacationsLoading,
  vacations,
  activeEmployees,
  startOfToday,
  selectedYear,
  onYearChange,
  onVacationClick
}: VacationsCardProps) {
  const actualCurrentYear = useMemo(() => new Date().getFullYear(), [])

  const employeesWithVacations = useMemo(
    () => activeEmployees.filter((employee) => vacations.some((vacation) => vacation.employeeId === employee.id)),
    [activeEmployees, vacations]
  )

  const expiredActiveEmployees = useMemo(
    () => activeEmployees.filter((employee) => isContractExpired(employee, startOfToday)),
    [activeEmployees, startOfToday]
  )

  return (
    <Card className="flex h-full flex-col xl:col-span-3">
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5" />
              График отпусков {selectedYear}
            </CardTitle>
          </div>

          <div className="flex items-center gap-2 self-start">
            {selectedYear !== actualCurrentYear && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onYearChange(actualCurrentYear)}
                disabled={vacationsLoading}
              >
                Текущий год
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => onYearChange(selectedYear - 1)}
              disabled={vacationsLoading}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[92px] rounded-md border bg-muted/30 px-3 py-2 text-center text-sm font-semibold text-slate-700">
              {selectedYear}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => onYearChange(selectedYear + 1)}
              disabled={vacationsLoading}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Сотрудников в штате</p>
            <p className="mt-2 text-sm font-medium">{activeEmployees.length}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Записей в графике</p>
            <p className="mt-2 text-sm font-medium">{vacations.length}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Сотрудников с отпусками</p>
            <p className="mt-2 text-sm font-medium">{employeesWithVacations.length}</p>
          </div>
        </div>

        <div className="flex-1">
          {vacationsLoading ? (
            <div className="space-y-4 rounded-xl border p-4">
              <Skeleton className="h-10 w-full" />
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </div>
          ) : (
            <VacationGantt
              vacations={vacations}
              employees={activeEmployees}
              year={selectedYear}
              expiredEmployeeIds={expiredActiveEmployees.map((employee) => employee.id)}
              onVacationClick={onVacationClick}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
