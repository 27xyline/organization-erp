'use client'

import { useMemo, useEffect } from 'react'
import { Gantt, Task as GanttTask, ViewMode } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'
import { Task } from '@/types'

interface SvarGanttChartProps {
  tasks: Task[]
  projectStart?: Date
  projectEnd?: Date
}

export function SvarGanttChart({ tasks }: SvarGanttChartProps) {
  // Стабильная мемоизация задач
  const ganttTasks = useMemo(() => {
    const safeTasks = tasks || []
    
    if (!Array.isArray(safeTasks) || safeTasks.length === 0) {
      return []
    }
    
    const result: GanttTask[] = []
    const taskMap = new Map<string, GanttTask>()
    
    // Сначала создаём все задачи
    safeTasks.forEach((task, index) => {
      if (!task || !task.id) return
      
      const startDate = task.startDate ? new Date(task.startDate) : new Date()
      const endDate = task.endDate ? new Date(task.endDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      
      const ganttTask: GanttTask = {
        id: task.id,
        name: task.name || 'Без названия',
        start: startDate,
        end: endDate,
        progress: task.progress || 0,
        type: 'task',
        hideChildren: false,
        displayOrder: index,
        isDisabled: true, // Фиксированные задачи
      }
      
      result.push(ganttTask)
      taskMap.set(task.id, ganttTask)
    })
    
    // Устанавливаем связи родитель-потомок
    safeTasks.forEach((task) => {
      if (task.parentId && taskMap.has(task.parentId)) {
        const childTask = taskMap.get(task.id)
        if (childTask) {
          childTask.project = task.parentId
        }
      }
    })
    
    return result
  }, [tasks])

  // Фиксируем номера недель после рендера
  useEffect(() => {
    const timer = setTimeout(() => {
      const ganttContainer = document.querySelector('.gantt-week-view')
      if (!ganttContainer) return
      
      const allTexts = ganttContainer.querySelectorAll('text')
      allTexts.forEach((text) => {
        const content = text.textContent || ''
        const y = parseFloat(text.getAttribute('y') || '0')
        if (y < 50 && content.match(/^W\d{2}$/)) {
          text.textContent = content.substring(1)
        }
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [ganttTasks])

  if (ganttTasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Нет задач для отображения на диаграмме Ганта
      </div>
    )
  }

  return (
    <div className="h-[600px] border rounded-lg overflow-hidden bg-white gantt-week-view">
      <Gantt
        tasks={ganttTasks}
        viewMode={ViewMode.Week}
        listCellWidth=""
        columnWidth={60}
        rowHeight={50}
        headerHeight={50}
        fontSize="12px"
        locale="ru"
        barFill={60}
        barCornerRadius={3}
        arrowColor="#94a3b8"
        arrowIndent={15}
      />
    </div>
  )
}
