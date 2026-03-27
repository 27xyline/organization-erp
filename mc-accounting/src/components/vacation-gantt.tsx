'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'

type VacationType = 'VACATION' | 'SICK_LEAVE' | 'BUSINESS_TRIP' | 'UNPAID_LEAVE'

interface VacationEmployee {
  id: string
  fullName: string
  department?: string
}

interface Vacation {
  id: string
  employeeId: string
  employee?: VacationEmployee
  startDate: Date
  endDate: Date
  type: VacationType
}

interface Employee {
  id: string
  fullName: string
}

interface VacationGanttProps {
  vacations: Vacation[]
  employees: Employee[]
  year?: number
  onVacationClick?: (vacation: Vacation) => void
  expiredEmployeeIds?: string[]
}

const vacationTypeConfig: Record<VacationType, { label: string; className: string }> = {
  VACATION: { label: 'Отпуск', className: 'bg-blue-500' },
  SICK_LEAVE: { label: 'Больничный', className: 'bg-red-500' },
  BUSINESS_TRIP: { label: 'Командировка', className: 'bg-emerald-500' },
  UNPAID_LEAVE: { label: 'Без содержания', className: 'bg-slate-500' },
}

const getDayIndex = (date: Date, yearStart: Date) => {
  const diff = date.getTime() - yearStart.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function VacationGantt({ vacations, employees, year = new Date().getFullYear(), onVacationClick, expiredEmployeeIds = [] }: VacationGanttProps) {
  const yearStart = useMemo(() => new Date(year, 0, 1), [year])
  const yearEnd = useMemo(() => new Date(year, 11, 31, 23, 59, 59, 999), [year])
  const totalDaysInYear = useMemo(() => getDayIndex(yearEnd, yearStart) + 1, [yearEnd, yearStart])
  const currentMonth = new Date().getFullYear() === year ? new Date().getMonth() : null
  const expiredEmployeeIdSet = useMemo(() => new Set(expiredEmployeeIds), [expiredEmployeeIds])
  const monthSegments = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) => {
      const startDate = new Date(year, index, 1)
      const endDate = new Date(year, index + 1, 0)
      const startIndex = getDayIndex(startDate, yearStart)
      const endIndex = getDayIndex(endDate, yearStart)

      return {
        index,
        label: startDate.toLocaleString('ru-RU', { month: 'short' }),
        left: (startIndex / totalDaysInYear) * 100,
        width: ((endIndex - startIndex + 1) / totalDaysInYear) * 100,
      }
    })
  }, [year, yearStart, totalDaysInYear])

  const monthBoundaries = useMemo(
    () => monthSegments.slice(1).map((month) => month.left),
    [monthSegments]
  )

  const currentMonthSegment = currentMonth !== null ? monthSegments[currentMonth] : null

  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <div className="min-w-[1280px]">
        <div className="flex border-b bg-slate-50">
          <div className="flex h-12 w-56 flex-shrink-0 items-center border-r px-4 text-sm font-medium text-slate-700">
            <span>Сотрудник</span>
          </div>
          <div className="relative h-12 flex-1 overflow-hidden">
            {monthBoundaries.map((boundary, index) => (
              <div
                key={`header-boundary-${index}`}
                className="absolute inset-y-0 z-20 w-[2px] bg-slate-300/90"
                style={{ left: `calc(${boundary}% - 1px)` }}
              />
            ))}
            {monthSegments.map((month) => (
              <div
                key={month.index}
                className={`absolute inset-y-0 flex items-center justify-center px-2 text-center text-xs font-medium uppercase text-slate-500 ${currentMonth === month.index ? 'bg-amber-50/70' : ''}`}
                style={{
                  left: `${month.left}%`,
                  width: `${month.width}%`,
                }}
              >
                {month.label}
              </div>
            ))}
          </div>
        </div>

        <div className="divide-y">
          {employees.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              Нет сотрудников для отображения графика отпусков.
            </div>
          ) : (
            employees.map((employee) => {
              const isExpired = expiredEmployeeIdSet.has(employee.id)

              return (
              <div key={employee.id} className={cn('flex h-14', isExpired && 'bg-amber-50/30')}>
                <div className={cn('flex w-56 flex-shrink-0 items-center border-r px-4 text-sm font-medium text-slate-700', isExpired ? 'bg-amber-50/70' : 'bg-slate-50/70')}>
                  <div className="min-w-0">
                    <span className="line-clamp-1 block">{employee.fullName}</span>
                    {isExpired && (
                      <span className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        Договор истек
                      </span>
                    )}
                  </div>
                </div>

                <div className="relative h-14 flex-1 overflow-hidden">
                  {isExpired && (
                    <div className="absolute inset-0 bg-amber-50/20" />
                  )}
                  {currentMonthSegment && (
                    <div
                      className="absolute inset-y-0 bg-amber-100/35"
                      style={{
                        left: `${currentMonthSegment.left}%`,
                        width: `${currentMonthSegment.width}%`,
                      }}
                    />
                  )}

                  <div className="absolute inset-0 pointer-events-none">
                    {monthBoundaries.map((boundary, index) => (
                      <div
                        key={`${employee.id}-month-boundary-${index}`}
                        className="absolute inset-y-0 z-[2] w-[2px] bg-slate-300/90"
                        style={{ left: `calc(${boundary}% - 1px)` }}
                      />
                    ))}
                  </div>

                  {vacations
                    .filter((vacation) => vacation.employeeId === employee.id)
                    .map((vacation) => {
                      const startDate = vacation.startDate
                      const endDate = vacation.endDate
                      const clampedStart = startDate < yearStart ? yearStart : startDate
                      const clampedEnd = endDate > yearEnd ? yearEnd : endDate
                      const left = (getDayIndex(clampedStart, yearStart) / totalDaysInYear) * 100
                      const width = ((getDayIndex(clampedEnd, yearStart) - getDayIndex(clampedStart, yearStart) + 1) / totalDaysInYear) * 100
                      const config = vacationTypeConfig[vacation.type]

                      return (
                        <button
                          key={vacation.id}
                          type="button"
                          onClick={() => onVacationClick?.(vacation)}
                          className={`absolute top-1/2 z-10 h-[14px] -translate-y-1/2 rounded-[4px] shadow-sm ${config.className} ${onVacationClick ? 'cursor-pointer transition-opacity hover:opacity-90' : 'cursor-default'}`}
                          style={{
                            left: `${left}%`,
                            width: `${Math.max(width, 1.5)}%`,
                          }}
                          title={`${config.label}: ${startDate.toLocaleDateString('ru-RU')} - ${endDate.toLocaleDateString('ru-RU')}`}
                        />
                      )
                    })}
                </div>
              </div>
            )})
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t bg-slate-50 px-4 py-3 text-xs text-slate-500">
          {Object.values(vacationTypeConfig).map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className={`h-3.5 w-3.5 rounded-full ${item.className}`} />
              <span>{item.label}</span>
            </div>
          ))}
          {currentMonth !== null && (
            <div className="ml-auto flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-sm border border-amber-200 bg-amber-100/70" />
              <span>Текущий месяц</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
