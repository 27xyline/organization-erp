'use client'

import { useMemo } from 'react'

interface Vacation {
  id: string
  employeeId: string
  employeeName: string
  startDate: Date
  endDate: Date
  type: 'vacation' | 'sick' | 'business'
}

interface VacationGanttProps {
  vacations: Vacation[]
  employees: any[]
}

export function VacationGantt({ vacations, employees }: VacationGanttProps) {
  // Генерируем месяцы текущего года
  const months = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const result = []
    for (let i = 0; i < 12; i++) {
      const month = new Date(currentYear, i, 1)
      result.push({
        name: month.toLocaleString('ru', { month: 'short' }),
        days: new Date(currentYear, i + 1, 0).getDate()
      })
    }
    return result
  }, [])

  // Текущий год для отображения
  const currentYear = new Date().getFullYear()

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      {/* Заголовки месяцев */}
      <div className="flex border-b bg-gray-50">
        <div className="w-48 p-2 border-r font-medium text-sm bg-gray-100">
          Сотрудник
        </div>
        <div className="flex-1 flex">
          {months.map((month, idx) => (
            <div 
              key={idx} 
              className="flex-1 p-2 text-center text-xs font-medium border-r last:border-r-0"
            >
              {month.name}
            </div>
          ))}
        </div>
      </div>

      {/* Строки сотрудников */}
      <div className="divide-y">
        {employees.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Нет данных о сотрудниках
          </div>
        ) : (
          employees.map((employee) => (
            <div key={employee.id} className="flex">
              {/* Имя сотрудника */}
              <div className="w-48 p-2 border-r bg-gray-50/50 text-sm truncate">
                {employee.fullName}
              </div>
              
              {/* Полоса времени */}
              <div className="flex-1 relative h-10">
                {/* Сетка месяцев */}
                <div className="absolute inset-0 flex">
                  {months.map((_, idx) => (
                    <div 
                      key={idx} 
                      className="flex-1 border-r last:border-r-0"
                    />
                  ))}
                </div>

                {/* Отпуска сотрудника */}
                {vacations
                  .filter((v) => v.employeeId === employee.id)
                  .map((vacation) => {
                    const startMonth = vacation.startDate.getMonth()
                    const startDay = vacation.startDate.getDate()
                    const endMonth = vacation.endDate.getMonth()
                    const endDay = vacation.endDate.getDate()
                    
                    const left = (startMonth / 12) * 100 + (startDay / 30 / 12) * 100
                    const width = ((endMonth - startMonth + 1) / 12) * 100
                    
                    return (
                      <div
                        key={vacation.id}
                        className={`absolute top-2 h-6 rounded text-xs text-white flex items-center px-2 overflow-hidden whitespace-nowrap ${
                          vacation.type === 'vacation' 
                            ? 'bg-blue-500' 
                            : vacation.type === 'sick' 
                              ? 'bg-red-500' 
                              : 'bg-green-500'
                        }`}
                        style={{
                          left: `${left}%`,
                          width: `${Math.max(width, 2)}%`,
                        }}
                        title={`${vacation.employeeName}: ${vacation.startDate.toLocaleDateString()} - ${vacation.endDate.toLocaleDateString()}`}
                      >
                        {width > 5 ? 'Отпуск' : ''}
                      </div>
                    )
                  })}

                {/* Текущий месяц (подсветка) */}
                <div 
                  className="absolute top-0 bottom-0 bg-yellow-100/50 border-x border-yellow-200"
                  style={{
                    left: `${(new Date().getMonth() / 12) * 100}%`,
                    width: `${100/12}%`
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Легенда */}
      <div className="flex gap-4 p-3 border-t bg-gray-50 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-500 rounded"></div>
          <span>Отпуск</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500 rounded"></div>
          <span>Больничный</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span>Командировка</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-4 h-4 bg-yellow-100 border border-yellow-200 rounded"></div>
          <span>Текущий месяц</span>
        </div>
      </div>
    </div>
  )
}
