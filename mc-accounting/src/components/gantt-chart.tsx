'use client'

import { useMemo } from 'react'
import { format, differenceInDays, addDays, isSameMonth, startOfMonth, endOfMonth } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Task, TaskStatusLabels } from '@/types'
import { cn } from '@/lib/utils'

interface GanttChartProps {
  tasks: Task[]
  startDate?: Date
  endDate?: Date
}

export function GanttChart({ tasks, startDate: projectStart, endDate: projectEnd }: GanttChartProps) {
  // Filter only level 1 tasks for the chart
  const level1Tasks = useMemo(() => {
    return tasks.filter(t => t.level === 1 && t.startDate && t.endDate)
  }, [tasks])

  // Calculate chart timeline
  const { start, end, totalDays } = useMemo(() => {
    if (level1Tasks.length === 0) {
      const start = projectStart || new Date()
      const end = projectEnd || addDays(start, 30)
      return { start, end, totalDays: 30 }
    }

    const dates = level1Tasks.flatMap(t => [t.startDate!, t.endDate!])
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
    
    // Add some padding
    const start = projectStart || addDays(minDate, -7)
    const end = projectEnd || addDays(maxDate, 7)
    
    return {
      start,
      end,
      totalDays: differenceInDays(end, start)
    }
  }, [level1Tasks, projectStart, projectEnd])

  // Generate month headers
  const months = useMemo(() => {
    const months = []
    let current = startOfMonth(start)
    while (current <= end) {
      const monthEnd = endOfMonth(current)
      const daysInMonth = Math.min(differenceInDays(monthEnd, current) + 1, differenceInDays(end, current) + 1)
      months.push({
        date: current,
        days: daysInMonth,
        label: format(current, 'LLLL yyyy', { locale: ru })
      })
      current = addDays(monthEnd, 1)
    }
    return months
  }, [start, end])

  if (level1Tasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Нет задач для отображения на диаграмме Ганта
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        {/* Timeline Header */}
        <div className="flex border-b">
          <div className="w-64 flex-shrink-0 p-2 font-medium border-r bg-muted/50">
            Задача
          </div>
          <div className="flex-1 flex">
            {months.map((month, idx) => (
              <div
                key={idx}
                className="border-r bg-muted/30 text-center py-1 text-sm text-muted-foreground"
                style={{ width: `${(month.days / totalDays) * 100}%` }}
              >
                {month.label}
              </div>
            ))}
          </div>
        </div>

        {/* Tasks */}
        {level1Tasks.map((task) => {
          const taskStart = task.startDate!
          const taskEnd = task.endDate!
          const offsetDays = differenceInDays(taskStart, start)
          const duration = differenceInDays(taskEnd, taskStart) + 1
          const assigneeLabel = task.assignees.length > 0
            ? task.assignees.map((assignee) => assignee.fullName).join(', ')
            : task.responsible
          
          return (
            <div key={task.id} className="flex border-b hover:bg-muted/20">
              <div className="w-64 flex-shrink-0 p-2 border-r text-sm">
                <div className="font-medium truncate">{task.name}</div>
                <div className="text-xs text-muted-foreground">
                  {assigneeLabel && `Отв: ${assigneeLabel}`}
                </div>
              </div>
              <div className="flex-1 relative h-12">
                {/* Grid lines for months */}
                {months.map((month, idx) => (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 border-r"
                    style={{
                      left: `${months.slice(0, idx).reduce((acc, m) => acc + m.days, 0) / totalDays * 100}%`,
                      width: `${(month.days / totalDays) * 100}%`
                    }}
                  />
                ))}
                
                {/* Task bar */}
                <div
                  className={cn(
                    "absolute top-2 h-8 rounded-md flex items-center px-2 text-xs text-white font-medium shadow-sm",
                    task.status === 'COMPLETED' && "bg-green-500",
                    task.status === 'IN_PROGRESS' && "bg-blue-500",
                    task.status === 'DELAYED' && "bg-red-500",
                    task.status === 'NOT_STARTED' && "bg-gray-400"
                  )}
                  style={{
                    left: `${(offsetDays / totalDays) * 100}%`,
                    width: `${Math.max((duration / totalDays) * 100, 2)}%`
                  }}
                >
                  {duration > 5 && `${task.progress}%`}
                </div>
              </div>
            </div>
          )
        })}

        {/* Legend */}
        <div className="flex gap-4 mt-4 text-sm">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span>Завершена</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-500" />
            <span>В работе</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-gray-400" />
            <span>Не начата</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500" />
            <span>Просрочена</span>
          </div>
        </div>
      </div>
    </div>
  )
}
