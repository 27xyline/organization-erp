'use client'

import { useState } from 'react'
import { Task, TaskStatus, TaskStatusLabels } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, ChevronDown, Plus, Trash2, Edit2 } from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

interface TaskTreeProps {
  tasks: Task[]
  projectId: string
  onTaskAdded: () => void
}

// Helper type for tasks from API that might not have all relations loaded
type ApiTask = Task & { children?: Task[] }

function TaskItem({ 
  task, 
  level, 
  projectId, 
  onTaskAdded,
  allTasks 
}: { 
  task: Task
  level: number
  projectId: string
  onTaskAdded: () => void
  allTasks: Task[]
}) {
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTaskName, setNewTaskName] = useState('')
  const [editingDates, setEditingDates] = useState(false)
  const [startDate, setStartDate] = useState(task.startDate ? format(new Date(task.startDate), 'yyyy-MM-dd') : '')
  const [endDate, setEndDate] = useState(task.endDate ? format(new Date(task.endDate), 'yyyy-MM-dd') : '')
  const [responsible, setResponsible] = useState(task.responsible || '')

  const children = allTasks.filter(t => t.parentId === task.id)
  const hasChildren = children.length > 0
  const canAddChild = level < 3

  const handleAddSubtask = async () => {
    if (!newTaskName.trim()) return

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTaskName,
          level: level + 1,
          parentId: task.id,
        }),
      })

      if (response.ok) {
        setNewTaskName('')
        setShowAddForm(false)
        onTaskAdded()
      }
    } catch (error) {
      console.error('Error creating task:', error)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Удалить задачу?')) return

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        onTaskAdded()
      }
    } catch (error) {
      console.error('Error deleting task:', error)
    }
  }

  const handleUpdateDates = async () => {
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: startDate || null,
          endDate: endDate || null,
          responsible: responsible || null,
        }),
      })

      if (response.ok) {
        setEditingDates(false)
        onTaskAdded()
      }
    } catch (error) {
      console.error('Error updating task:', error)
    }
  }

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-100 text-green-800'
      case 'IN_PROGRESS': return 'bg-blue-100 text-blue-800'
      case 'DELAYED': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="task-item">
      <div 
        className="flex items-center gap-2 py-2 px-2 hover:bg-muted/50 rounded-lg group"
        style={{ paddingLeft: `${level * 24}px` }}
      >
        {hasChildren ? (
          <button 
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-muted rounded"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-6" />
        )}

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{task.name}</span>
            <Badge variant="secondary" className={getStatusColor(task.status)}>
              {TaskStatusLabels[task.status]}
            </Badge>
            {task.progress > 0 && (
              <span className="text-sm text-muted-foreground">{task.progress}%</span>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            {task.responsible && <span>Отв: {task.responsible}</span>}
            {task.startDate && task.endDate && (
              <span>
                {format(new Date(task.startDate), 'dd.MM.yyyy', { locale: ru })} - {format(new Date(task.endDate), 'dd.MM.yyyy', { locale: ru })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setEditingDates(!editingDates)}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          {canAddChild && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>

      {editingDates && (
        <div 
          className="flex flex-col gap-2 py-2 px-2 bg-muted/30 rounded-lg"
          style={{ paddingLeft: `${level * 24}px` }}
        >
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="Дата начала"
              className="flex-1"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="Дата окончания"
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              placeholder="Ответственный"
              className="flex-1"
            />
            <Button size="sm" onClick={handleUpdateDates}>Сохранить</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingDates(false)}>Отмена</Button>
          </div>
        </div>
      )}

      {showAddForm && canAddChild && (
        <div 
          className="flex items-center gap-2 py-2 px-2"
          style={{ paddingLeft: `${(level + 1) * 24}px` }}
        >
          <Input
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
            placeholder={`Новая ${level === 1 ? 'подзадача' : 'под-подзадача'}`}
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask()}
          />
          <Button size="sm" onClick={handleAddSubtask}>Добавить</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Отмена</Button>
        </div>
      )}

      {expanded && hasChildren && (
        <div>
          {children.map(child => (
            <TaskItem
              key={child.id}
              task={child}
              level={level + 1}
              projectId={projectId}
              onTaskAdded={onTaskAdded}
              allTasks={allTasks}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function TaskTree({ tasks, projectId, onTaskAdded }: TaskTreeProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTaskName, setNewTaskName] = useState('')

  // Get only root level tasks (level 1 with no parent)
  const rootTasks = tasks.filter(t => t.level === 1 && !t.parentId)

  const handleAddTask = async () => {
    if (!newTaskName.trim()) return

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTaskName,
          level: 1,
        }),
      })

      if (response.ok) {
        setNewTaskName('')
        setShowAddForm(false)
        onTaskAdded()
      }
    } catch (error) {
      console.error('Error creating task:', error)
    }
  }

  return (
    <div className="space-y-2">
      {rootTasks.map(task => (
        <TaskItem
          key={task.id}
          task={task}
          level={1}
          projectId={projectId}
          onTaskAdded={onTaskAdded}
          allTasks={tasks}
        />
      ))}

      {showAddForm ? (
        <div className="flex items-center gap-2 py-2">
          <Input
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
            placeholder="Новая задача"
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
          />
          <Button size="sm" onClick={handleAddTask}>Добавить</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Отмена</Button>
        </div>
      ) : (
        <Button 
          variant="outline" 
          className="w-full mt-4"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Добавить задачу
        </Button>
      )}
    </div>
  )
}
