'use client'

import { useEffect, useMemo, useState } from 'react'
import { Task, TaskStatus, TaskStatusLabels } from '@/features/projects/contracts/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, ChevronDown, Plus, Trash2, Edit2 } from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { TaskAssigneeSelector } from '@/features/projects/ui/task-assignee-selector'
import { useProjectTaskMembers } from '@/features/projects/ui/use-project-task-members'

interface TaskTreeProps {
  tasks: Task[]
  projectId: string
  onTaskAdded: () => void
}

function TaskItem({
  task,
  level,
  projectId,
  onTaskAdded,
  allTasks,
  memberOptions,
  membersLoading,
  membersError,
}: {
  task: Task
  level: number
  projectId: string
  onTaskAdded: () => void
  allTasks: Task[]
  memberOptions: ReturnType<typeof useProjectTaskMembers>['members']
  membersLoading: boolean
  membersError: string | null
}) {
  const [expanded, setExpanded] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTaskName, setNewTaskName] = useState('')
  const [editingDates, setEditingDates] = useState(false)
  const [startDate, setStartDate] = useState(task.startDate ? format(new Date(task.startDate), 'yyyy-MM-dd') : '')
  const [endDate, setEndDate] = useState(task.endDate ? format(new Date(task.endDate), 'yyyy-MM-dd') : '')
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState(() => {
    const activeEmployeeIds = new Set(memberOptions.map((member) => member.employeeId))
    return task.assignees
      .map((assignee) => assignee.employeeId)
      .filter((employeeId) => activeEmployeeIds.has(employeeId))
  })

  const safeAllTasks = allTasks || []
  const children = safeAllTasks.filter((item) => item.parentId === task.id)
  const hasChildren = children.length > 0
  const canAddChild = level < 3

  const unavailableAssignees = useMemo(() => {
    const activeEmployeeIds = new Set(memberOptions.map((member) => member.employeeId))
    return task.assignees.filter((assignee) => !activeEmployeeIds.has(assignee.employeeId))
  }, [memberOptions, task.assignees])

  useEffect(() => {
    const activeEmployeeIds = new Set(memberOptions.map((member) => member.employeeId))
    setSelectedEmployeeIds(
      task.assignees
        .map((assignee) => assignee.employeeId)
        .filter((employeeId) => activeEmployeeIds.has(employeeId))
    )
  }, [memberOptions, task.assignees])

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
          employeeIds: [],
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
          employeeIds: selectedEmployeeIds,
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

  const assigneeLabel = task.assignees.length > 0
    ? task.assignees.map((assignee) => assignee.fullName).join(', ')
    : (task.responsible || '')

  return (
    <div className="task-item">
      <div
        className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/50 group"
        style={{ paddingLeft: `${level * 24}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded p-1 hover:bg-muted"
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
            {task.progress > 0 ? (
              <span className="text-sm text-muted-foreground">{task.progress}%</span>
            ) : null}
          </div>

          <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
            {assigneeLabel ? <span>Отв: {assigneeLabel}</span> : null}
            {task.startDate && task.endDate ? (
              <span>
                {format(new Date(task.startDate), 'dd.MM.yyyy', { locale: ru })} - {format(new Date(task.endDate), 'dd.MM.yyyy', { locale: ru })}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingDates(!editingDates)}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          {canAddChild ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>

      {editingDates ? (
        <div
          className="space-y-3 rounded-lg bg-muted/30 px-2 py-3"
          style={{ paddingLeft: `${level * 24}px` }}
        >
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              placeholder="Дата начала"
              className="flex-1"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              placeholder="Дата окончания"
              className="flex-1"
            />
          </div>
          <TaskAssigneeSelector
            members={memberOptions}
            selectedEmployeeIds={selectedEmployeeIds}
            onChange={setSelectedEmployeeIds}
            loading={membersLoading}
            unavailableAssignees={unavailableAssignees}
          />
          {membersError ? (
            <p className="text-sm text-red-600">{membersError}</p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleUpdateDates} disabled={Boolean(membersError)}>
              Сохранить
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingDates(false)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}

      {showAddForm && canAddChild ? (
        <div
          className="flex items-center gap-2 px-2 py-2"
          style={{ paddingLeft: `${(level + 1) * 24}px` }}
        >
          <Input
            value={newTaskName}
            onChange={(event) => setNewTaskName(event.target.value)}
            placeholder={`Новая ${level === 1 ? 'подзадача' : 'под-подзадача'}`}
            className="flex-1"
            onKeyDown={(event) => event.key === 'Enter' && handleAddSubtask()}
          />
          <Button size="sm" onClick={handleAddSubtask}>Добавить</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Отмена</Button>
        </div>
      ) : null}

      {expanded && hasChildren ? (
        <div>
          {children.map((child) => (
            <TaskItem
              key={child.id}
              task={child}
              level={level + 1}
              projectId={projectId}
              onTaskAdded={onTaskAdded}
              allTasks={safeAllTasks}
              memberOptions={memberOptions}
              membersLoading={membersLoading}
              membersError={membersError}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function TaskTree({ tasks, projectId, onTaskAdded }: TaskTreeProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTaskName, setNewTaskName] = useState('')
  const { members, loading: membersLoading, error: membersError } = useProjectTaskMembers(projectId)

  const safeTasks = tasks || []
  const rootTasks = safeTasks.filter((task) => task.level === 1 && !task.parentId)

  const handleAddTask = async () => {
    if (!newTaskName.trim()) return

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTaskName,
          level: 1,
          employeeIds: [],
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
      {rootTasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          level={1}
          projectId={projectId}
          onTaskAdded={onTaskAdded}
          allTasks={safeTasks}
          memberOptions={members}
          membersLoading={membersLoading}
          membersError={membersError}
        />
      ))}

      {showAddForm ? (
        <div className="flex items-center gap-2 py-2">
          <Input
            value={newTaskName}
            onChange={(event) => setNewTaskName(event.target.value)}
            placeholder="Новая задача"
            className="flex-1"
            onKeyDown={(event) => event.key === 'Enter' && handleAddTask()}
          />
          <Button size="sm" onClick={handleAddTask}>Добавить</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Отмена</Button>
        </div>
      ) : (
        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Добавить задачу
        </Button>
      )}
    </div>
  )
}
