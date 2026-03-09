'use client'

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Task, TaskStatus, TaskStatusLabels } from '@/types'
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

const parseResponsibleList = (value?: string | null) => {
  if (!value) return [] as string[]

  return value
    .replace(/\r/g, '\n')
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function CustomGantt({ tasks, projectId, onTaskEdit, onTaskDelete, onTaskAdd }: CustomGanttProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const minimumRowHeight = 64
  const ganttBarHeight = 21
  const taskBaseWidth = 460
  const [leftPanelWidth, setLeftPanelWidth] = useState(taskBaseWidth)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartXRef = useRef(0)
  const resizeStartWidthRef = useRef(taskBaseWidth)

  const minLeftPanelWidth = taskBaseWidth
  const minRightPanelWidth = 260

  const columns = useMemo(() => {
    const orderedColumns = [
      { key: 'start', width: 120 },
      { key: 'end', width: 120 },
      { key: 'responsible', width: 210 },
      { key: 'status', width: 150 },
      { key: 'actions', width: 120 },
    ] as const

    const widths = {
      start: 0,
      end: 0,
      responsible: 0,
      status: 0,
      actions: 0,
    }

    const available = Math.max(leftPanelWidth - taskBaseWidth, 0)
    let used = 0

    for (const column of orderedColumns) {
      if (available >= used + column.width) {
        widths[column.key] = column.width
        used += column.width
      } else {
        break
      }
    }

    const task = taskBaseWidth + Math.max(available - used, 0)

    return {
      task,
      start: widths.start,
      end: widths.end,
      responsible: widths.responsible,
      status: widths.status,
      actions: widths.actions,
    }
  }, [leftPanelWidth])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = resizeStartWidthRef.current + (event.clientX - resizeStartXRef.current)
      const containerWidth = containerRef.current?.clientWidth ?? window.innerWidth
      const maxLeftPanelWidth = Math.max(minLeftPanelWidth, containerWidth - minRightPanelWidth)
      const clampedWidth = Math.min(Math.max(nextWidth, minLeftPanelWidth), maxLeftPanelWidth)

      setLeftPanelWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  const handleResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeStartXRef.current = event.clientX
    resizeStartWidthRef.current = leftPanelWidth
    setIsResizing(true)
  }
  
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

  const monthSegments = useMemo(() => {
    if (weeks.length === 0) return [] as { key: string; label: string; span: number }[]

    const segments: { key: string; label: string; span: number }[] = []

    weeks.forEach((week) => {
      const month = week.start.getMonth()
      const year = week.start.getFullYear()
      const key = `${year}-${month}`
      const monthLabel = week.start.toLocaleString('ru-RU', { month: 'long' })
      const label = `${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)} ${year}`

      const lastSegment = segments[segments.length - 1]
      if (lastSegment && lastSegment.key === key) {
        lastSegment.span += 1
      } else {
        segments.push({ key, label, span: 1 })
      }
    })

    return segments
  }, [weeks])
  
  // Вычисляем позицию задачи на шкале
  const getTaskPosition = (task: Task) => {
    if (!task.startDate || !task.endDate) return null
    
    const start = new Date(task.startDate)
    const end = new Date(task.endDate)
    
    const left = ((start.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24)) * (100 / timeRange.totalDays)
    const width = ((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) * (100 / timeRange.totalDays)
    
    return { left: `${left}%`, width: `${Math.max(width, 1)}%` }
  }

  const getStatusBadgeClass = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.COMPLETED:
        return 'bg-green-100 text-green-800'
      case TaskStatus.IN_PROGRESS:
        return 'bg-yellow-100 text-yellow-800'
      case TaskStatus.DELAYED:
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-blue-100 text-blue-800'
    }
  }

  const getTaskBarColor = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.COMPLETED:
        return '#22c55e'
      case TaskStatus.IN_PROGRESS:
        return '#eab308'
      case TaskStatus.DELAYED:
        return '#ef4444'
      default:
        return '#3b82f6'
    }
  }

  const estimateLineCount = (value: string, width: number) => {
    if (width <= 0) return 1

    const charsPerLine = Math.max(Math.floor((width - 24) / 5.2), 4)

    return value.split('\n').reduce((sum, rawLine) => {
      const line = rawLine.trim()
      if (line.length === 0) return sum + 1

      let lines = 1
      let currentLength = 0

      line.split(/\s+/).forEach((word) => {
        const wordLength = word.length

        if (wordLength >= charsPerLine) {
          if (currentLength > 0) {
            lines += 1
            currentLength = 0
          }
          lines += Math.ceil(wordLength / charsPerLine) - 1
          currentLength = wordLength % charsPerLine
          return
        }

        const separator = currentLength === 0 ? 0 : 1
        if (currentLength + separator + wordLength <= charsPerLine) {
          currentLength += separator + wordLength
        } else {
          lines += 1
          currentLength = wordLength
        }
      })

      return sum + lines
    }, 0)
  }

  const rowHeights = useMemo(() => {
    return organizedTasks.map((task) => {
      const taskTextWidth = Math.max(columns.task - (48 + (task.level - 1) * 24), 120)
      const taskLines = estimateLineCount(task.name || '', taskTextWidth)
      const taskHeight = taskLines * 28 + 36

      const responsibleEntries = parseResponsibleList(task.responsible)
      const responsibleText = responsibleEntries.length > 0 ? responsibleEntries.join('\n') : '—'
      const responsibleLines = columns.responsible > 0
        ? estimateLineCount(responsibleText, Math.max(columns.responsible - 24, 80))
        : 1
      const responsibleHeight = responsibleLines * 28 + 36

      return Math.max(minimumRowHeight, taskHeight, responsibleHeight)
    })
  }, [organizedTasks, columns])
  
  if (organizedTasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Нет задач для отображения
      </div>
    )
  }

  return (
    <div className="border rounded-lg bg-white shadow-sm h-full" ref={containerRef}>
      <div className="h-full overflow-hidden">
        <div className="flex h-full min-w-0" style={{ boxSizing: 'border-box' }}>
        {/* Левая часть - Таблица задач */}
        <div className="flex-shrink-0 border-r bg-gray-50/50 overflow-hidden" style={{ width: `${leftPanelWidth}px` }}>
          <div>
            {/* Заголовки таблицы */}
            <div className="flex h-24 bg-gray-100 border-b font-semibold text-sm">
              <div className="flex-shrink-0 px-4 border-r flex items-center" style={{ width: `${columns.task}px` }}>Задача</div>
              {columns.start > 0 && (
                <div className="flex-shrink-0 px-3 border-r text-center flex items-center justify-center" style={{ width: `${columns.start}px` }}>Начало</div>
              )}
              {columns.end > 0 && (
                <div className="flex-shrink-0 px-3 border-r text-center flex items-center justify-center" style={{ width: `${columns.end}px` }}>Конец</div>
              )}
              {columns.responsible > 0 && (
                <div className="flex-shrink-0 px-3 border-r flex items-center" style={{ width: `${columns.responsible}px` }}>Исполнитель</div>
              )}
              {columns.status > 0 && (
                <div className="flex-shrink-0 px-3 border-r text-center flex items-center justify-center" style={{ width: `${columns.status}px` }}>Статус</div>
              )}
              {columns.actions > 0 && (
                <div className="flex-shrink-0 px-3 text-center flex items-center justify-center" style={{ width: `${columns.actions}px` }}>Действия</div>
              )}
            </div>
          
            {/* Строки задач */}
            <div className="bg-white">
              {organizedTasks.map((task, idx) => {
                const responsibleEntries = parseResponsibleList(task.responsible)

                return (
                  <div 
                    key={task.id}
                    className="flex border-b hover:bg-blue-50/50 transition-colors"
                    style={{ height: `${rowHeights[idx] || minimumRowHeight}px` }}
                  >
                    <div 
                      className="flex-shrink-0 min-w-0 px-4 border-r flex items-center text-sm"
                      style={{ width: `${columns.task}px`, paddingLeft: `${16 + (task.level - 1) * 24}px` }}
                    >
                      <span 
                        className={`block w-full py-1 text-left whitespace-normal leading-snug ${task.level === 1 ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
                        style={{ overflowWrap: 'anywhere' }}
                        title={task.name}
                      >
                        {task.name}
                      </span>
                    </div>
                    {columns.start > 0 && (
                      <div className="flex-shrink-0 px-3 border-r flex items-center justify-center text-sm text-gray-600 whitespace-nowrap" style={{ width: `${columns.start}px` }}>
                        {task.startDate ? formatDate(task.startDate) : '—'}
                      </div>
                    )}
                    {columns.end > 0 && (
                      <div className="flex-shrink-0 px-3 border-r flex items-center justify-center text-sm text-gray-600 whitespace-nowrap" style={{ width: `${columns.end}px` }}>
                        {task.endDate ? formatDate(task.endDate) : '—'}
                      </div>
                    )}
                    {columns.responsible > 0 && (
                      <div
                        className="flex-shrink-0 px-3 py-1 border-r flex items-center text-left text-sm text-gray-700"
                        style={{ width: `${columns.responsible}px`, overflowWrap: 'anywhere' }}
                      >
                        {responsibleEntries.length > 0 ? (
                          <ol className="w-full list-decimal pl-4 space-y-1 marker:text-gray-500">
                            {responsibleEntries.map((responsibleEntry, responsibleIdx) => (
                              <li key={`${task.id}-responsible-${responsibleIdx}`} className="leading-snug">
                                {responsibleEntry}
                              </li>
                            ))}
                          </ol>
                        ) : (
                          '—'
                        )}
                      </div>
                    )}
                    {columns.status > 0 && (
                      <div className="flex-shrink-0 px-3 border-r flex items-center justify-center" style={{ width: `${columns.status}px` }}>
                        <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${getStatusBadgeClass(task.status)}`}>
                          {TaskStatusLabels[task.status]}
                        </span>
                      </div>
                    )}
                    {columns.actions > 0 && (
                      <div className="flex-shrink-0 px-2 flex items-center justify-center gap-1" style={{ width: `${columns.actions}px` }}>
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
                    )}
                  </div>
                )
              })}
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
        </div>

        <div
          className={`group relative w-2 flex-shrink-0 cursor-col-resize ${isResizing ? 'bg-blue-100' : 'bg-gray-100/80 hover:bg-blue-50'}`}
          onMouseDown={handleResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Изменить ширину таблицы задач"
        >
          <div
            className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ${isResizing ? 'bg-blue-500' : 'bg-gray-300 group-hover:bg-blue-400'}`}
          />
        </div>
        
        {/* Правая часть - Диаграмма Ганта */}
        <div className="flex-1 overflow-x-auto bg-white">
          <div style={{ minWidth: `${weeks.length * 50}px` }}>
            {/* Заголовки недель */}
            <div className="bg-gray-100 border-b">
              <div className="flex border-b">
                {monthSegments.map((segment) => (
                  <div
                    key={segment.key}
                    className="flex-shrink-0 border-r text-center py-3 px-1 text-sm font-semibold text-gray-600 whitespace-nowrap"
                    style={{ width: `${segment.span * 50}px` }}
                  >
                    {segment.label}
                  </div>
                ))}
              </div>
              <div className="flex">
                {weeks.map((week, idx) => (
                <div 
                  key={idx}
                  className="flex-shrink-0 border-r text-center py-4 text-sm text-gray-600"
                  style={{ width: '50px' }}
                >
                  <div className="font-semibold">{week.number}</div>
                </div>
                ))}
              </div>
            </div>
            
            {/* Полосы задач */}
            <div className="relative">
              {organizedTasks.map((task, idx) => {
                const currentRowHeight = rowHeights[idx] || minimumRowHeight
                const position = getTaskPosition(task)
                if (!position) return (
                  <div 
                    key={task.id}
                    style={{ height: `${currentRowHeight}px` }}
                    className="border-b"
                  />
                )
                
                return (
                  <div 
                    key={task.id}
                    className="border-b relative"
                    style={{ height: `${currentRowHeight}px` }}
                  >
                    <div
                      className="absolute rounded-full shadow-sm"
                      style={{
                        top: '50%',
                        transform: 'translateY(-50%)',
                        left: position.left,
                        width: position.width,
                        height: `${ganttBarHeight}px`,
                        backgroundColor: getTaskBarColor(task.status),
                        minWidth: '60px'
                      }}
                      title={`${task.name} — ${TaskStatusLabels[task.status]}`}
                    />
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
