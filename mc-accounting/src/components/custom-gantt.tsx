'use client'

import { useMemo, useRef } from 'react'
import { Task, TaskStatusLabels } from '@/types'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Edit2, Trash2, Plus } from 'lucide-react'

interface CustomGanttProps {
  tasks: Task[]
  projectId: string
  onTaskEdit?: (taskId: string) => void
  onTaskDelete?: (taskId: string) => void
  onTaskAdd?: (parentId?: string) => void
}

export function CustomGantt({ tasks, projectId, onTaskEdit, onTaskDelete, onTaskAdd }: CustomGanttProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rowHeight = 64
  
  const safeTasks = tasks || []
  
  // Организуем задачи иерархически (рекурсивно)
  const organizedTasks = useMemo(() => {
    const taskMap = new Map<string, Task & { level: number; childIds: string[] }>()
    
    // Сначала создаём мапу всех задач
    safeTasks.forEach(task => {
      taskMap.set(task.id, { ...task, level: 0, childIds: [] })
    })
    
    // Строим связи родитель-ребенок
    safeTasks.forEach(task => {
      if (task.parentId) {
        const parent = taskMap.get(task.parentId)
        if (parent) {
          parent.childIds.push(task.id)
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
      task.childIds.forEach(childId => {
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
    <div className="border rounded-lg bg-white shadow-sm h-full" ref={containerRef}>
      <div className="h-full overflow-x-auto">
        <div className="flex h-full min-w-[1320px]" style={{ boxSizing: 'border-box' }}>
        {/* Левая часть - Таблица задач */}
        <div className="flex-shrink-0 border-r bg-gray-50/50" style={{ width: '1072px' }}>
          {/* Заголовки таблицы */}
          <div className="flex bg-gray-100 border-b font-semibold text-sm">
            <div className="w-[32rem] flex-shrink-0 px-4 py-3 border-r">Задача</div>
            <div className="w-24 flex-shrink-0 px-3 py-3 border-r text-center">Начало</div>
            <div className="w-24 flex-shrink-0 px-3 py-3 border-r text-center">Конец</div>
            <div className="w-32 flex-shrink-0 px-3 py-3 border-r">Исполнитель</div>
            <div className="w-28 flex-shrink-0 px-3 py-3 border-r text-center">Статус</div>
            <div className="w-32 flex-shrink-0 px-3 py-3 text-center">Действия</div>
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
                  className="w-[32rem] flex-shrink-0 px-4 border-r flex items-center text-sm"
                  style={{ paddingLeft: `${16 + (task.level - 1) * 24}px` }}
                >
                  <span 
                    className={`leading-snug break-words ${task.level === 1 ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                    title={task.name}
                  >
                    {task.name}
                  </span>
                </div>
                <div className="w-24 flex-shrink-0 px-3 border-r flex items-center justify-center text-sm text-gray-600 whitespace-nowrap">
                  {task.startDate ? formatDate(task.startDate) : '—'}
                </div>
                <div className="w-24 flex-shrink-0 px-3 border-r flex items-center justify-center text-sm text-gray-600 whitespace-nowrap">
                  {task.endDate ? formatDate(task.endDate) : '—'}
                </div>
                <div className="w-32 flex-shrink-0 px-3 border-r flex items-center text-sm text-gray-700 truncate">
                  {task.responsible || '—'}
                </div>
                <div className="w-28 flex-shrink-0 px-3 border-r flex items-center justify-center">
                  <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 whitespace-nowrap">
                    {TaskStatusLabels[task.status]}
                  </span>
                </div>
                <div className="w-32 flex-shrink-0 px-2 flex items-center justify-center gap-1">
                  {onTaskAdd && task.level < 3 && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-green-600 hover:text-green-800"
                      onClick={() => onTaskAdd(task.id)}
                      title="Добавить подзадачу"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {onTaskEdit && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={() => onTaskEdit(task.id)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {onTaskDelete && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-red-500 hover:text-red-700"
                      onClick={() => onTaskDelete(task.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Кнопка добавления задачи */}
          {onTaskAdd && (
            <div className="p-3 border-t bg-gray-50">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => onTaskAdd()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Добавить задачу
              </Button>
            </div>
          )}
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
    </div>
  )
}
