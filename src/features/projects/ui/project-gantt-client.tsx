'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { CustomGantt } from './custom-gantt'
import {
  Task,
  TaskPriority,
  TaskPriorityLabels,
  TaskRisk,
  TaskRiskLabels,
  TaskStatus,
  TaskStatusLabels,
} from '@/features/projects/contracts/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TaskAssigneeSelector } from './task-assignee-selector'
import { useProjectTaskMembers } from './use-project-task-members'
import { calculateCriticalPath } from '../domain/critical-path'

type ChecklistDraft = { title: string; completed: boolean }

function ChecklistEditor({
  value,
  onChange,
}: {
  value: ChecklistDraft[]
  onChange: (value: ChecklistDraft[]) => void
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>Чек-лист</Label>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, { title: '', completed: false }])}>
          Добавить пункт
        </Button>
      </div>
      {value.map((item, index) => (
        <div key={index} className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <input
            type="checkbox"
            checked={item.completed}
            onChange={(event) => onChange(value.map((entry, itemIndex) =>
              itemIndex === index ? { ...entry, completed: event.target.checked } : entry
            ))}
          />
          <Input
            aria-label={`Пункт чек-листа ${index + 1}`}
            value={item.title}
            onChange={(event) => onChange(value.map((entry, itemIndex) =>
              itemIndex === index ? { ...entry, title: event.target.value } : entry
            ))}
          />
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>
            Удалить
          </Button>
        </div>
      ))}
    </div>
  )
}

interface ProjectGanttProps {
  projectId: string
  tasks: Task[]
  canEdit: boolean
}

export function ProjectGantt({ projectId, tasks, canEdit }: ProjectGanttProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { members, loading: membersLoading, error: membersError, refresh: refreshMembers } = useProjectTaskMembers(projectId)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [parentTaskId, setParentTaskId] = useState<string | undefined>(undefined)
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([])
  const [newTaskEmployeeIds, setNewTaskEmployeeIds] = useState<string[]>([])
  const [view, setView] = useState<'gantt' | 'kanban'>('gantt')
  const [editChecklist, setEditChecklist] = useState<ChecklistDraft[]>([])
  const [newChecklist, setNewChecklist] = useState<ChecklistDraft[]>([])
  const [comment, setComment] = useState('')

  const criticalPath = useMemo(() => {
    const parentIds = new Set(tasks.map((task) => task.parentId).filter(Boolean))
    return calculateCriticalPath(tasks.filter((task) => !parentIds.has(task.id)))
  }, [tasks])
  const criticalNames = criticalPath
    .map((id) => tasks.find((task) => task.id === id)?.name)
    .filter(Boolean)
  const workload = useMemo(() => {
    const counts = new Map<string, number>()
    tasks.forEach((task) => task.assignees.forEach((assignee) =>
      counts.set(assignee.fullName, (counts.get(assignee.fullName) || 0) + 1)
    ))
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [tasks])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!editingTask) {
        setSelectedEmployeeIds([])
        return
      }
      const activeEmployeeIds = new Set(members.map((member) => member.employeeId))
      setSelectedEmployeeIds(
        editingTask.assignees
          .map((assignee) => assignee.employeeId)
          .filter((employeeId) => activeEmployeeIds.has(employeeId))
      )
    }, 0)
    return () => window.clearTimeout(timer)
  }, [editingTask, members])

  const unavailableEditingAssignees = useMemo(() => {
    if (!editingTask) {
      return []
    }

    const activeEmployeeIds = new Set(members.map((member) => member.employeeId))
    return editingTask.assignees.filter((assignee) => !activeEmployeeIds.has(assignee.employeeId))
  }, [editingTask, members])

  const handleTaskEdit = async (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId)
    if (!task) {
      return
    }

    setEditingTask(task)
    setEditChecklist((task.checklist || []).map((item) => ({
      title: item.title,
      completed: item.completed,
    })))
    setComment('')
    setIsEditDialogOpen(true)
  }

  const handleTaskDelete = async (taskId: string) => {
    if (!confirm('Удалить задачу?')) return

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        toast.error('Ошибка при удалении задачи')
        return
      }

      await refreshMembers()
      router.refresh()
    } catch (error) {
      console.error('Error deleting task:', error)
      toast.error('Ошибка при удалении задачи')
    }
  }

  const handleTaskAdd = async (parentId?: string) => {
    setParentTaskId(parentId)
    setNewTaskEmployeeIds([])
    setNewChecklist([])
    setIsAddDialogOpen(true)
  }

  const handleSaveTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingTask) return

    const formData = new FormData(event.currentTarget)
    const payload = {
      name: formData.get('name'),
      startDate: formData.get('startDate'),
      endDate: formData.get('endDate'),
      employeeIds: selectedEmployeeIds,
      status: formData.get('status'),
      progress: Number(formData.get('progress')),
      description: formData.get('description'),
      priority: formData.get('priority'),
      risk: formData.get('risk'),
      isMilestone: formData.get('isMilestone') === 'on',
      predecessorIds: formData.get('predecessorId')
        ? [formData.get('predecessorId')]
        : [],
      checklist: editChecklist.filter((item) => item.title.trim()),
    }

    try {
      const response = await fetch(`/api/tasks/${editingTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Ошибка при сохранении задачи' }))
        toast.error(body.error?.message || body.error || 'Ошибка при сохранении задачи')
        return
      }

      setIsEditDialogOpen(false)
      setEditingTask(null)
      await refreshMembers()
      router.refresh()
    } catch (error) {
      console.error('Error saving task:', error)
      toast.error('Ошибка при сохранении задачи')
    }
  }

  const handleCreateTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    let level = 1
    if (parentTaskId) {
      const parentTask = tasks.find((task) => task.id === parentTaskId)
      if (parentTask) {
        level = parentTask.level + 1
      }
    }

    const payload = {
      name: formData.get('name'),
      startDate: formData.get('startDate'),
      endDate: formData.get('endDate'),
      employeeIds: newTaskEmployeeIds,
      status: formData.get('status'),
      progress: 0,
      description: formData.get('description'),
      priority: formData.get('priority'),
      risk: formData.get('risk'),
      isMilestone: formData.get('isMilestone') === 'on',
      predecessorIds: formData.get('predecessorId')
        ? [formData.get('predecessorId')]
        : [],
      checklist: newChecklist.filter((item) => item.title.trim()),
      projectId,
      parentId: parentTaskId || null,
      level,
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Ошибка при создании задачи' }))
        toast.error(body.error?.message || body.error || 'Ошибка при создании задачи')
        return
      }

      setIsAddDialogOpen(false)
      setParentTaskId(undefined)
      setNewTaskEmployeeIds([])
      await refreshMembers()
      router.refresh()
    } catch (error) {
      console.error('Error creating task:', error)
      toast.error('Ошибка при создании задачи')
    }
  }

  const handleAddComment = async () => {
    if (!editingTask || !comment.trim()) return
    const response = await fetch(`/api/tasks/${editingTask.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: comment }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      toast.error(body.error?.message || 'Не удалось добавить комментарий')
      return
    }
    setEditingTask((task) => task
      ? { ...task, comments: [body.data, ...(task.comments || [])] }
      : task
    )
    setComment('')
    router.refresh()
  }

  return (
    <>
      <div className="mb-3 grid gap-3 rounded-lg border bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button size="sm" variant={view === 'gantt' ? 'default' : 'outline'} onClick={() => setView('gantt')}>
              Диаграмма
            </Button>
            <Button size="sm" variant={view === 'kanban' ? 'default' : 'outline'} onClick={() => setView('kanban')}>
              Канбан
            </Button>
          </div>
          {canEdit && <Button size="sm" onClick={() => handleTaskAdd()}>Добавить задачу</Button>}
        </div>
        <div className="grid gap-2 text-sm lg:grid-cols-2">
          <div>
            <span className="font-medium">Критический путь: </span>
            <span className="text-muted-foreground">
              {criticalNames.length ? criticalNames.join(' → ') : 'недостаточно зависимостей'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="font-medium">Загрузка:</span>
            {workload.length
              ? workload.map(([name, count]) => <Badge key={name} variant="outline">{name}: {count}</Badge>)
              : <span className="text-muted-foreground">нет назначений</span>}
          </div>
        </div>
      </div>

      {view === 'gantt' ? (
        <CustomGantt
          tasks={tasks}
          projectId={projectId}
          onTaskEdit={canEdit ? handleTaskEdit : undefined}
          onTaskDelete={canEdit ? handleTaskDelete : undefined}
          onTaskAdd={canEdit ? handleTaskAdd : undefined}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-4">
          {Object.values(TaskStatus).map((status) => (
            <div key={status} className="min-h-48 rounded-lg border bg-muted/20 p-3">
              <div className="mb-3 font-medium">{TaskStatusLabels[status]}</div>
              <div className="grid gap-2">
                {tasks.filter((task) => task.status === status).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="rounded-md border bg-background p-3 text-left shadow-sm hover:bg-accent"
                    onClick={() => canEdit && handleTaskEdit(task.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{task.isMilestone && '◆ '}{task.name}</span>
                      <Badge variant={task.priority === TaskPriority.CRITICAL ? 'destructive' : 'secondary'}>
                        {TaskPriorityLabels[task.priority || TaskPriority.MEDIUM]}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Риск: {TaskRiskLabels[task.risk || TaskRisk.LOW]} · {task.progress}%
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {canEdit && <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Редактировать задачу</DialogTitle>
            <DialogDescription>Параметры, зависимости, чек-лист и обсуждение задачи.</DialogDescription>
          </DialogHeader>
          {editingTask ? (
            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Название</Label>
                <Input id="edit-name" name="name" defaultValue={editingTask.name} required />
              </div>
              <div>
                <Label htmlFor="edit-description">Описание</Label>
                <Textarea id="edit-description" name="description" defaultValue={editingTask.description || ''} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-priority">Приоритет</Label>
                  <select id="edit-priority" name="priority" defaultValue={editingTask.priority || 'MEDIUM'} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                    {Object.values(TaskPriority).map((value) => <option key={value} value={value}>{TaskPriorityLabels[value]}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="edit-risk">Риск</Label>
                  <select id="edit-risk" name="risk" defaultValue={editingTask.risk || 'LOW'} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                    {Object.values(TaskRisk).map((value) => <option key={value} value={value}>{TaskRiskLabels[value]}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isMilestone" defaultChecked={editingTask.isMilestone} />
                Контрольная точка
              </label>
              <div>
                <Label htmlFor="edit-predecessor">Предшествующая задача</Label>
                <select
                  id="edit-predecessor"
                  name="predecessorId"
                  defaultValue={editingTask.predecessors?.[0]?.predecessorId || ''}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Нет зависимости</option>
                  {tasks.filter((task) => task.id !== editingTask.id).map((task) => (
                    <option key={task.id} value={task.id}>{task.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-start">Начало</Label>
                  <Input
                    id="edit-start"
                    name="startDate"
                    type="date"
                    defaultValue={editingTask.startDate ? new Date(editingTask.startDate).toISOString().split('T')[0] : ''}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-end">Конец</Label>
                  <Input
                    id="edit-end"
                    name="endDate"
                    type="date"
                    defaultValue={editingTask.endDate ? new Date(editingTask.endDate).toISOString().split('T')[0] : ''}
                  />
                </div>
              </div>
              <TaskAssigneeSelector
                members={members}
                selectedEmployeeIds={selectedEmployeeIds}
                onChange={setSelectedEmployeeIds}
                loading={membersLoading}
                unavailableAssignees={unavailableEditingAssignees}
              />
              {membersError ? (
                <p className="text-sm text-red-600">{membersError}</p>
              ) : null}
              <div>
                <Label htmlFor="edit-status">Статус</Label>
                <Select name="status" defaultValue={editingTask.status}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NOT_STARTED">Не начата</SelectItem>
                    <SelectItem value="IN_PROGRESS">В работе</SelectItem>
                    <SelectItem value="COMPLETED">Завершена</SelectItem>
                    <SelectItem value="DELAYED">Просрочена</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-progress">Прогресс (%)</Label>
                <Input
                  id="edit-progress"
                  name="progress"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={editingTask.progress}
                />
              </div>
              <ChecklistEditor value={editChecklist} onChange={setEditChecklist} />
              <div className="grid gap-2 border-t pt-3">
                <Label>Комментарии</Label>
                {(editingTask.comments || []).map((entry) => (
                  <div key={entry.id} className="rounded-md bg-muted p-2 text-sm">
                    <div>{entry.body}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {entry.author.name} · {new Date(entry.createdAt).toLocaleString('ru-RU')}
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Добавить комментарий" />
                  <Button type="button" variant="outline" onClick={handleAddComment}>Отправить</Button>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={Boolean(membersError)}>
                  Сохранить
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>}

      {canEdit && <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open)
          if (!open) {
            setParentTaskId(undefined)
            setNewTaskEmployeeIds([])
            setNewChecklist([])
          }
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {parentTaskId ? 'Добавить подзадачу' : 'Добавить задачу'}
            </DialogTitle>
            <DialogDescription>Заполните сроки, приоритет, риски и зависимости.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateTask} className="space-y-4">
            <div>
              <Label htmlFor="add-name">Название</Label>
              <Input id="add-name" name="name" required />
            </div>
            <div>
              <Label htmlFor="add-description">Описание</Label>
              <Textarea id="add-description" name="description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="add-priority">Приоритет</Label>
                <select id="add-priority" name="priority" defaultValue="MEDIUM" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  {Object.values(TaskPriority).map((value) => <option key={value} value={value}>{TaskPriorityLabels[value]}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="add-risk">Риск</Label>
                <select id="add-risk" name="risk" defaultValue="LOW" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  {Object.values(TaskRisk).map((value) => <option key={value} value={value}>{TaskRiskLabels[value]}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isMilestone" />
              Контрольная точка
            </label>
            <div>
              <Label htmlFor="add-predecessor">Предшествующая задача</Label>
              <select id="add-predecessor" name="predecessorId" defaultValue="" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">Нет зависимости</option>
                {tasks.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="add-start">Начало</Label>
                <Input id="add-start" name="startDate" type="date" />
              </div>
              <div>
                <Label htmlFor="add-end">Конец</Label>
                <Input id="add-end" name="endDate" type="date" />
              </div>
            </div>
            <TaskAssigneeSelector
              members={members}
              selectedEmployeeIds={newTaskEmployeeIds}
              onChange={setNewTaskEmployeeIds}
              loading={membersLoading}
            />
            {membersError ? (
              <p className="text-sm text-red-600">{membersError}</p>
            ) : null}
            <ChecklistEditor value={newChecklist} onChange={setNewChecklist} />
            <div>
              <Label htmlFor="add-status">Статус</Label>
              <Select name="status" defaultValue="NOT_STARTED">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOT_STARTED">Не начата</SelectItem>
                  <SelectItem value="IN_PROGRESS">В работе</SelectItem>
                  <SelectItem value="COMPLETED">Завершена</SelectItem>
                  <SelectItem value="DELAYED">Просрочена</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={Boolean(membersError)}>
                Создать
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>}
    </>
  )
}
