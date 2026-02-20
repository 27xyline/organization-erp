'use client'

import { useMemo } from 'react'
import { Gantt, Task as GanttTask, ViewMode } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'
import { Task } from '@/types'

interface SvarGanttChartProps {
  tasks: Task[]
  projectStart?: Date
  projectEnd?: Date
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void
}

// Transform our Task format to gantt-task-react format
function transformTasksToGanttFormat(tasks: Task[]): GanttTask[] {
  const result: GanttTask[] = []
  const taskMap = new Map<string, GanttTask>()
  
  // Ensure tasks is a valid array
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return result
  }
  
  // First pass: create all tasks
  tasks.forEach((task) => {
    if (!task || !task.id) return
    
    const startDate = task.startDate ? new Date(task.startDate) : new Date()
    const endDate = task.endDate ? new Date(task.endDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    
    const ganttTask: GanttTask = {
      id: task.id,
      name: task.name || 'Без названия',
      start: startDate,
      end: endDate,
      progress: task.progress || 0,
      type: task.level === 1 ? 'project' : 'task',
      hideChildren: false,
      displayOrder: 0,
    }
    
    result.push(ganttTask)
    taskMap.set(task.id, ganttTask)
  })
  
  // Second pass: set up parent-child relationships
  tasks.forEach((task) => {
    if (task.parentId && taskMap.has(task.parentId)) {
      const childTask = taskMap.get(task.id)
      const parentTask = taskMap.get(task.parentId)
      if (childTask && parentTask) {
        childTask.type = 'task'
        childTask.project = parentTask.id
      }
    }
  })
  
  // Set display order
  result.forEach((task, index) => {
    task.displayOrder = index
  })
  
  return result
}

export function SvarGanttChart({ tasks, projectStart, projectEnd, onTaskUpdate }: SvarGanttChartProps) {
  const safeTasks = tasks || []
  
  const ganttTasks = useMemo(() => {
    return transformTasksToGanttFormat(safeTasks)
  }, [safeTasks])

  if (!safeTasks || safeTasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Нет задач для отображения на диаграмме Ганта
      </div>
    )
  }

  if (!ganttTasks || ganttTasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Нет валидных задач для диаграммы Ганта
      </div>
    )
  }

  const handleTaskChange = (task: GanttTask) => {
    if (onTaskUpdate) {
      onTaskUpdate(task.id.toString(), {
        startDate: task.start,
        endDate: task.end,
        progress: task.progress,
      })
    }
  }

  return (
    <div className="h-[600px] border rounded-lg overflow-hidden bg-white">
      <Gantt
        tasks={ganttTasks}
        viewMode={ViewMode.Day}
        onDateChange={handleTaskChange}
        onProgressChange={handleTaskChange}
        listCellWidth=""
        columnWidth={60}
        rowHeight={50}
        fontSize="14px"
        locale="ru"
      />
    </div>
  )
}
