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

const getTaskAssigneeNames = (task: Task) => {
  if (task.assignees.length > 0) {
    return task.assignees.map((assignee) => assignee.fullName)
  }

  return parseResponsibleList(task.responsible)
}

const DAY_IN_MS = 24 * 60 * 60 * 1000
const minimumWeekWidth = 80
const minimumGanttBarWidth = 24
const defaultLeftPanelWidth = 460
const minimumLeftPanelWidth = 280
const minimumTaskColumnWidth = 220
const minimumRightPanelWidth = 260
const resizeHandleWidth = 8

const normalizeDate = (value: Date) => {
  const date = new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

const getWeekStart = (date: Date) => {
  const normalizedDate = normalizeDate(date)
  const dayOfWeek = normalizedDate.getDay()
  const diff = normalizedDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)

  normalizedDate.setDate(diff)
  return normalizedDate
}

const getWeekEnd = (date: Date) => addDays(getWeekStart(date), 6)

const getDayDifference = (start: Date, end: Date) => {
  return Math.round((normalizeDate(end).getTime() - normalizeDate(start).getTime()) / DAY_IN_MS)
}

const getIsoWeekNumber = (date: Date) => {
  const d = normalizeDate(date)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const yearStart = new Date(d.getFullYear(), 0, 1)

  return Math.ceil((((d.getTime() - yearStart.getTime()) / DAY_IN_MS) + 1) / 7)
}

export function CustomGantt({ tasks, projectId, onTaskEdit, onTaskDelete, onTaskAdd }: CustomGanttProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const minimumRowHeight = 64
  const ganttBarHeight = 21
  const [containerWidth, setContainerWidth] = useState(0)
  const [leftPanelWidth, setLeftPanelWidth] = useState(defaultLeftPanelWidth)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartXRef = useRef(0)
  const resizeStartWidthRef = useRef(defaultLeftPanelWidth)
  const maxLeftPanelWidth = containerWidth > 0
    ? Math.max(minimumLeftPanelWidth, containerWidth - minimumRightPanelWidth - resizeHandleWidth)
    : defaultLeftPanelWidth
  const currentLeftPanelWidth = Math.min(Math.max(leftPanelWidth, minimumLeftPanelWidth), maxLeftPanelWidth)
  const rightPanelWidth = Math.max(containerWidth - currentLeftPanelWidth - resizeHandleWidth, 0)

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

    const available = Math.max(currentLeftPanelWidth - minimumTaskColumnWidth, 0)
    let used = 0

    for (const column of orderedColumns) {
      if (available >= used + column.width) {
        widths[column.key] = column.width
        used += column.width
      } else {
        break
      }
    }

    const task = Math.max(currentLeftPanelWidth - used, minimumTaskColumnWidth)

    return {
      task,
      start: widths.start,
      end: widths.end,
      responsible: widths.responsible,
      status: widths.status,
      actions: widths.actions,
    }
  }, [currentLeftPanelWidth])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateContainerWidth = () => {
      setContainerWidth(element.clientWidth)
    }

    updateContainerWidth()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateContainerWidth)

      return () => {
        window.removeEventListener('resize', updateContainerWidth)
      }
    }

    const resizeObserver = new ResizeObserver(updateContainerWidth)
    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    setLeftPanelWidth((currentWidth) => Math.min(Math.max(currentWidth, minimumLeftPanelWidth), maxLeftPanelWidth))
  }, [maxLeftPanelWidth])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = resizeStartWidthRef.current + (event.clientX - resizeStartXRef.current)
      const clampedWidth = Math.min(Math.max(nextWidth, minimumLeftPanelWidth), maxLeftPanelWidth)

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
  }, [isResizing, maxLeftPanelWidth])

  const handleResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeStartXRef.current = event.clientX
    resizeStartWidthRef.current = currentLeftPanelWidth
    setIsResizing(true)
  }
  
  // Организуем задачи иерархически (рекурсивно)
  const organizedTasks = useMemo(() => {
    const safeTasks = tasks ?? []
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
  }, [tasks])
  
  // Определяем временной диапазон
  const timeRange = useMemo(() => {
    const taskDates = organizedTasks.flatMap((task) => {
      const dates: Date[] = []

      if (task.startDate) {
        dates.push(normalizeDate(task.startDate))
      }

      if (task.endDate) {
        dates.push(normalizeDate(task.endDate))
      }

      return dates
    })

    if (taskDates.length === 0) {
      const now = normalizeDate(new Date())
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

      return {
        start: monthStart,
        end: monthEnd,
      }
    }

    const minDate = new Date(Math.min(...taskDates.map((date) => date.getTime())))
    const maxDate = new Date(Math.max(...taskDates.map((date) => date.getTime())))

    return {
      start: addDays(minDate, -7),
      end: addDays(maxDate, 7),
    }
  }, [organizedTasks])

  const chartRange = useMemo(() => {
    return {
      start: getWeekStart(timeRange.start),
      end: getWeekEnd(timeRange.end),
    }
  }, [timeRange])

  // Генерируем массив недель
  const weeks = useMemo(() => {
    const result: Array<{
      start: Date
      end: Date
      number: number
      year: number
      label: string
    }> = []
    let current = new Date(chartRange.start)

    while (current <= chartRange.end) {
      const weekStart = normalizeDate(current)
      const weekEnd = getWeekEnd(weekStart)

      result.push({
        start: weekStart,
        end: weekEnd,
        number: getIsoWeekNumber(weekStart),
        year: weekStart.getFullYear(),
        label: `${weekStart.getDate()}-${weekEnd.getDate()}`,
      })

      current = addDays(current, 7)
    }

    return result
  }, [chartRange])

  const naturalChartWidth = weeks.length * minimumWeekWidth
  const chartWidth = Math.max(naturalChartWidth, Math.ceil(rightPanelWidth))
  const weekWidth = weeks.length > 0 ? chartWidth / weeks.length : minimumWeekWidth
  const dayWidth = weekWidth / 7

  /*
   * The old chart mixed a 50px weekly header with percentage bars based on a
   * non-week-aligned range. Keep every timeline element on the same pixel grid.
   */
  const getTaskPosition = (task: Task) => {
    if (!task.startDate || !task.endDate) return null

    const start = normalizeDate(task.startDate)
    const end = normalizeDate(task.endDate)
    const normalizedStart = start <= end ? start : end
    const normalizedEnd = end >= start ? end : start
    const rawLeft = getDayDifference(chartRange.start, normalizedStart) * dayWidth
    const rawWidth = Math.max((getDayDifference(normalizedStart, normalizedEnd) + 1) * dayWidth, minimumGanttBarWidth)
    const left = Math.min(Math.max(rawLeft, 0), Math.max(chartWidth - minimumGanttBarWidth, 0))
    const width = Math.min(rawWidth, Math.max(chartWidth - left, minimumGanttBarWidth))

    return { left: `${left}px`, width: `${width}px` }
  }

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

      const responsibleEntries = getTaskAssigneeNames(task)
      const responsibleText = responsibleEntries.length > 0 ? responsibleEntries.join('\n') : '—'
      const responsibleLines = columns.responsible > 0
        ? estimateLineCount(responsibleText, Math.max(columns.responsible - 24, 80))
        : 1
      const responsibleHeight = responsibleLines * 28 + 36

      return Math.max(minimumRowHeight, taskHeight, responsibleHeight)
    })
  }, [organizedTasks, columns])
  
  return (
    <div className="min-w-0 border rounded-lg bg-white shadow-sm h-full" ref={containerRef}>
      <div className="h-full overflow-hidden">
        {organizedTasks.length === 0 ? (
          <div className="flex h-full min-h-[280px] items-center justify-center px-6 py-10">
            <div className="max-w-sm text-center">
              <h3 className="text-lg font-semibold text-gray-900">Пока нет задач проекта</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Добавьте первую задачу, чтобы запланировать работу и увидеть ее на диаграмме.
              </p>
              {onTaskAdd && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-5"
                  onClick={() => onTaskAdd()}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Добавить задачу
                </Button>
              )}
            </div>
          </div>
        ) : (
        <div className="flex h-full min-w-0" style={{ boxSizing: 'border-box' }}>
        {/* Левая часть - Таблица задач */}
        <div className="flex-shrink-0 border-r bg-gray-50/50 overflow-hidden" style={{ width: `${currentLeftPanelWidth}px` }}>
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
                const responsibleEntries = getTaskAssigneeNames(task)

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
        <div className="min-w-0 flex-1 overflow-x-auto bg-white">
          <div style={{ width: `${chartWidth}px`, minWidth: `${chartWidth}px` }}>
            {/* Заголовки недель */}
            <div className="bg-gray-100 border-b">
              <div className="flex border-b">
                {monthSegments.map((segment) => (
                  <div
                    key={segment.key}
                    className="flex-shrink-0 border-r text-center py-3 px-1 text-sm font-semibold text-gray-600 whitespace-nowrap"
                    style={{ width: `${segment.span * weekWidth}px` }}
                  >
                    {segment.label}
                  </div>
                ))}
              </div>
              <div className="flex">
                {weeks.map((week, idx) => (
                <div 
                  key={idx}
                  className="flex-shrink-0 border-r px-1 py-3 text-center text-sm text-gray-600"
                  style={{ width: `${weekWidth}px` }}
                >
                  <div className="font-semibold">{week.number}</div>
                  <div className="mt-1 text-[11px] leading-none text-gray-500">{week.label}</div>
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
        )}
      </div>
    </div>
  )
}
