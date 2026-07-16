'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { CustomGantt } from './custom-gantt'
import { Task } from '@/features/projects/contracts/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TaskAssigneeSelector } from './task-assignee-selector'
import { useProjectTaskMembers } from './use-project-task-members'

interface ProjectGanttProps {
  projectId: string
  tasks: Task[]
}

export function ProjectGantt({ projectId, tasks }: ProjectGanttProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { members, loading: membersLoading, error: membersError, refresh: refreshMembers } = useProjectTaskMembers(projectId)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [parentTaskId, setParentTaskId] = useState<string | undefined>(undefined)
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([])
  const [newTaskEmployeeIds, setNewTaskEmployeeIds] = useState<string[]>([])

  useEffect(() => {
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

  return (
    <>
      <CustomGantt
        tasks={tasks}
        projectId={projectId}
        onTaskEdit={handleTaskEdit}
        onTaskDelete={handleTaskDelete}
        onTaskAdd={handleTaskAdd}
      />

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Редактировать задачу</DialogTitle>
          </DialogHeader>
          {editingTask ? (
            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Название</Label>
                <Input id="edit-name" name="name" defaultValue={editingTask.name} required />
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
      </Dialog>

      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open)
          if (!open) {
            setParentTaskId(undefined)
            setNewTaskEmployeeIds([])
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {parentTaskId ? 'Добавить подзадачу' : 'Добавить задачу'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateTask} className="space-y-4">
            <div>
              <Label htmlFor="add-name">Название</Label>
              <Input id="add-name" name="name" required />
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
      </Dialog>
    </>
  )
}
