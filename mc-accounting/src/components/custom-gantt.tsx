'use client'

import { useMemo, useRef, useState } from 'react'
import { Task, TaskStatus, TaskStatusLabels } from '@/types'
import { formatDate } from '@/lib/utils'

interface CustomGanttProps {
  tasks: Task[]
}

export function CustomGantt({ tasks }: CustomGanttProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [rowHeight, setRowHeight] = useState(50)
  
  const safeTasks = tasks || []
  
  // Организуем задачи иерархически (рекурсивно)
  const organizedTasks = useMemo(() => {
    const taskMap = new Map<string, Task & { level: number; children: string[] }>()
    
    // Сначала создаём мапу всех задач
    safeTasks.forEach(task => {
      taskMap.set(task.id, { ...task, level: 0, children: [] })
    })
    
    // Строим связи родитель-ребенок
    safeTasks.forEach(task => {
      if (task.parentId) {
        const parent = taskMap.get(task.parentId)
        if (parent) {
          parent.children.push(task.id)
        }
      }
    })
    
    // Рекурсивно обходим дерево
    const result: (Task & { level: number })[] = []
    const processed = new Set<string>()
    
    const addTaskRecursively = (taskId: string, level: number) => {
      if (processed.has(taskId)) return
      
      const task = taskMap.get(taskId)
      if (!task) return
      
      task.level = level
      result.push(task)
      processed.add(taskId)
      
      // Добавляем детей
      task.children.forEach(childId => {
        addTaskRecursively(childId, level + 1)
      })
    }
    
    // Находим корневые задачи (без родителей) и начинаем с них
    safeTasks.forEach(task => {
      if (!task.parentId && !processed.has(task.id)) {
        addTaskRecursively(task.id, 1)
      }
    })
    
    // Добавляем оставшиеся задачи (если есть orphaned)
    safeTasks.forEach(task => {
      if (!processed.has(task.id)) {
        addTaskRecursively(task.id, 1)
      }
    })
    
    return result
  }, [safeTasks])
  
  // Определяем временной диапазон
  const timeRange = useMemo(() => {
    if (organizedTasks.length === 0) {
      const now = new Date()
      return {
        start: new Date(now.getFullYear(), 0, 1),
        end: new Date(now.getFullYear(), 11, 31),
        totalDays: 365
      }
    }
    
    let minDate = new Date(organizedTasks[0].startDate || new Date())
    let maxDate = new Date(organizedTasks[0].endDate || new Date())
    
    organizedTasks.forEach(task => {
      if (task.startDate) {
        const start = new Date(task.startDate)
        if (start < minDate) minDate = start
      }
      if (task.endDate) {
        const end = new Date(task.endDate)
        if (end > maxDate) maxDate = end
      }
    })
    
    // Добавляем отступы по неделям
    minDate = new Date(minDate.getTime() - 7 * 24 * 60 * 60 * 1000)
    maxDate = new Date(maxDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    
    const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
    
    return { start: minDate, end: maxDate, totalDays }
  }, [organizedTasks])
  
  // Генерируем массив недель
  const weeks = useMemo(() => {
    const result = []
    let current = new Date(timeRange.start)
    
    // Находим начало недели (понедельник)
    const dayOfWeek = current.getDay()
    const diff = current.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
    current = new Date(current.setDate(diff))
    
    while (current <= timeRange.end) {
      const weekStart = new Date(current)
      const weekEnd = new Date(current.getTime() + 6 * 24 * 60 * 60 * 1000)
      
      // Получаем номер недели (ISO 8601)
      const d = new Date(weekStart)
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() + 4 - (d.getDay() || 7))
      const yearStart = new Date(d.getFullYear(), 0, 1)
      const weekNumber = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
      
      result.push({
        start: weekStart,
        end: weekEnd,
        number: weekNumber,
        year: weekStart.getFullYear()
      })
      
      current = new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000)
    }
    
    return result
  }, [timeRange])
  
  // Вычисляем позицию задачи на шкале
  const getTaskPosition = (task: Task) => {
    if (!task.startDate || !task.endDate) return null
    
    const start = new Date(task.startDate)
    const end = new Date(task.endDate)
    
    const left = ((start.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24)) * (100 / timeRange.totalDays)
    const width = ((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) * (100 / timeRange.totalDays)
    
    return { left: `${left}%`, width: `${Math.max(width, 1)}%` }
  }
  
  if (organizedTasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Нет задач для отображения
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm h-full" ref={containerRef}>
      <div className="flex h-full" style={{ boxSizing: 'border-box' }}>
        {/* Левая часть - Таблица задач */}
        <div className="flex-shrink-0 border-r bg-gray-50/50" style={{ width: '600px' }}>
          {/* Заголовки таблицы */}
          <div className="flex bg-gray-100 border-b font-semibold text-sm">
            <div className="flex-1 px-4 py-3 border-r">Задача</div>
            <div className="w-28 px-3 py-3 border-r text-center">Начало</div>
            <div className="w-28 px-3 py-3 border-r text-center">Конец</div>
            <div className="w-32 px-3 py-3 border-r">Исполнитель</div>
            <div className="w-28 px-3 py-3 text-center">Статус</div>
          </div>
          
          {/* Строки задач */}
          <div className="bg-white">
            {organizedTasks.map((task) => (
              <div 
                key={task.id}
                className="flex border-b hover:bg-blue-50/50 transition-colors"
                style={{ height: `${rowHeight}px` }}
              >
                <div 
                  className="flex-1 px-4 border-r flex items-center text-sm"
                  style={{ paddingLeft: `${16 + (task.level - 1) * 24}px` }}
                >
                  <span className={task.level === 1 ? 'font-semibold text-gray-900' : 'text-gray-700'}>
                    {task.name}
                  </span>
                </div>
                <div className="w-28 px-3 border-r flex items-center justify-center text-sm text-gray-600">
                  {task.startDate ? formatDate(task.startDate) : '—'}
                </div>
                <div className="w-28 px-3 border-r flex items-center justify-center text-sm text-gray-600">
                  {task.endDate ? formatDate(task.endDate) : '—'}
                </div>
                <div className="w-32 px-3 border-r flex items-center text-sm text-gray-700">
                  {task.responsible || '—'}
                </div>
                <div className="w-28 px-3 flex items-center justify-center">
                  <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                    {TaskStatusLabels[task.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Правая часть - Диаграмма Ганта */}
        <div className="flex-1 overflow-x-auto bg-white">
          <div style={{ minWidth: `${weeks.length * 50}px` }}>
            {/* Заголовки недель */}
            <div className="flex border-b bg-gray-100">
              {weeks.map((week, idx) => (
                <div 
                  key={idx}
                  className="flex-shrink-0 border-r text-center py-3 text-xs text-gray-600"
                  style={{ width: '50px' }}
                >
                  <div className="font-semibold text-sm">{week.number}</div>
                </div>
              ))}
            </div>
            
            {/* Полосы задач */}
            <div className="relative">
              {organizedTasks.map((task, idx) => {
                const position = getTaskPosition(task)
                if (!position) return (
                  <div 
                    key={task.id}
                    style={{ height: `${rowHeight}px` }}
                    className="border-b"
                  />
                )
                
                return (
                  <div 
                    key={task.id}
                    className="border-b relative"
                    style={{ height: `${rowHeight}px` }}
                  >
                    <div
                      className="absolute top-2 h-8 rounded-md flex items-center px-3 text-xs text-white overflow-hidden whitespace-nowrap shadow-sm"
                      style={{
                        left: position.left,
                        width: position.width,
                        backgroundColor: task.level === 1 ? '#f59e0b' : task.level === 2 ? '#64748b' : '#94a3b8',
                        minWidth: '60px'
                      }}
                      title={task.name}
                    >
                      {task.progress > 0 && (
                        <div 
                          className="absolute left-0 top-0 bottom-0 bg-black bg-opacity-20"
                          style={{ width: `${task.progress}%` }}
                        />
                      )}
                      <span className="relative z-10 font-medium">
                        {task.name}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
