'use client'

import { useMemo, useState } from 'react'
import {
  Building2,
  Edit,
  Plus,
  Trash2,
  UserRound,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import type {
  DepartmentHeadCandidate,
  DepartmentListItem,
} from '../contracts/types'

interface DepartmentRow {
  department: DepartmentListItem
  depth: number
}
const emptyForm = {
  code: '',
  name: '',
  parentId: 'none',
  headEmployeeId: 'none',
  isActive: true,
}

function flattenTree(departments: DepartmentListItem[]): DepartmentRow[] {
  const byParent = new Map<string | null, DepartmentListItem[]>()
  const knownIds = new Set(departments.map((department) => department.id))
  for (const department of departments) {
    const parentId = department.parentId && knownIds.has(department.parentId)
      ? department.parentId
      : null
    const siblings = byParent.get(parentId) ?? []
    siblings.push(department)
    byParent.set(parentId, siblings)
  }
  for (const siblings of byParent.values()) {
    siblings.sort((left, right) => left.name.localeCompare(right.name, 'ru'))
  }

  const result: DepartmentRow[] = []
  const visited = new Set<string>()
  const visit = (parentId: string | null, depth: number) => {
    for (const department of byParent.get(parentId) ?? []) {
      if (visited.has(department.id)) continue
      visited.add(department.id)
      result.push({ department, depth })
      visit(department.id, depth + 1)
    }
  }
  visit(null, 0)
  for (const department of departments) {
    if (!visited.has(department.id)) result.push({ department, depth: 0 })
  }
  return result
}

function getDescendantIds(departments: DepartmentListItem[], id: string) {
  const result = new Set<string>()
  const visit = (parentId: string) => {
    for (const department of departments) {
      if (department.parentId !== parentId || result.has(department.id)) continue
      result.add(department.id)
      visit(department.id)
    }
  }
  visit(id)
  return result
}

async function readApiResponse(response: Response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(body?.error?.message || 'Не удалось выполнить операцию')
  }
  return body?.data
}

export function DepartmentsClient({
  initialDepartments,
  headCandidates,
}: {
  initialDepartments: DepartmentListItem[]
  headCandidates: DepartmentHeadCandidate[]
}) {
  const { toast } = useToast()
  const [departments, setDepartments] = useState(initialDepartments)
  const [editing, setEditing] = useState<DepartmentListItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const rows = useMemo(() => flattenTree(departments), [departments])
  const forbiddenParentIds = useMemo(
    () => editing
      ? new Set([editing.id, ...getDescendantIds(departments, editing.id)])
      : new Set<string>(),
    [departments, editing],
  )

  const reload = async () => {
    const response = await fetch('/api/departments')
    setDepartments(await readApiResponse(response))
  }

  const openCreate = (parentId?: string) => {
    setEditing(null)
    setForm({ ...emptyForm, parentId: parentId || 'none' })
    setDialogOpen(true)
  }

  const openEdit = (department: DepartmentListItem) => {
    setEditing(department)
    setForm({
      code: department.code,
      name: department.name,
      parentId: department.parentId || 'none',
      headEmployeeId: department.headEmployeeId || 'none',
      isActive: department.isActive,
    })
    setDialogOpen(true)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await fetch(
        editing ? `/api/departments/${editing.id}` : '/api/departments',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: form.code,
            name: form.name,
            parentId: form.parentId === 'none' ? null : form.parentId,
            headEmployeeId: form.headEmployeeId === 'none' ? null : form.headEmployeeId,
            isActive: form.isActive,
          }),
        },
      )
      await readApiResponse(response)
      await reload()
      setDialogOpen(false)
      toast.success(editing ? 'Подразделение обновлено' : 'Подразделение создано')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить подразделение')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (department: DepartmentListItem) => {
    if (!confirm(`Удалить подразделение «${department.name}»?`)) return
    try {
      const response = await fetch(`/api/departments/${department.id}`, { method: 'DELETE' })
      await readApiResponse(response)
      await reload()
      toast.success('Подразделение удалено')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось удалить подразделение')
    }
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Подразделения</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Иерархия организации, коды и руководители подразделений
          </p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="mr-2 h-4 w-4" />
          Подразделение
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Подразделение</TableHead>
                <TableHead>Код</TableHead>
                <TableHead>Руководитель</TableHead>
                <TableHead>Использование</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    Подразделения ещё не созданы
                  </TableCell>
                </TableRow>
              ) : rows.map(({ department, depth }) => (
                <TableRow key={department.id} className={!department.isActive ? 'opacity-60' : undefined}>
                  <TableCell>
                    <div
                      className="flex items-center gap-2 font-medium"
                      style={{ paddingLeft: `${depth * 24}px` }}
                    >
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{department.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{department.code}</TableCell>
                  <TableCell>
                    {department.headEmployee ? (
                      <div className="flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                        <span>{department.headEmployee.fullName}</span>
                      </div>
                    ) : <span className="text-muted-foreground">Не назначен</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {department.usage.employees} сотр. · {department.usage.staffPositions} должн. · {department.usage.mols} МОЛ
                  </TableCell>
                  <TableCell>
                    <Badge variant={department.isActive ? 'secondary' : 'outline'}>
                      {department.isActive ? 'Активно' : 'Неактивно'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Добавить дочернее подразделение"
                        onClick={() => openCreate(department.id)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Редактировать"
                        onClick={() => openEdit(department)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Удалить"
                        onClick={() => void remove(department)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Редактирование подразделения' : 'Новое подразделение'}
            </DialogTitle>
            <DialogDescription>
              Код уникален для всей организации. Родитель определяет положение в дереве.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={save}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="department-code">Код</Label>
                <Input
                  id="department-code"
                  value={form.code}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    code: event.target.value.toUpperCase(),
                  }))}
                  placeholder="DEP-001"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department-name">Название</Label>
                <Input
                  id="department-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="department-parent">Родительское подразделение</Label>
              <Select
                value={form.parentId}
                onValueChange={(parentId) => setForm((current) => ({ ...current, parentId }))}
              >
                <SelectTrigger id="department-parent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Корневое подразделение</SelectItem>
                  {departments
                    .filter((department) => !forbiddenParentIds.has(department.id))
                    .map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.name} ({department.code})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="department-head">Руководитель</Label>
              <Select
                value={form.headEmployeeId}
                onValueChange={(headEmployeeId) => setForm((current) => ({
                  ...current,
                  headEmployeeId,
                }))}
              >
                <SelectTrigger id="department-head">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не назначен</SelectItem>
                  {headCandidates.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.fullName} ({employee.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  isActive: event.target.checked,
                }))}
                className="h-4 w-4"
              />
              <span>
                <span className="block text-sm font-medium">Активное подразделение</span>
                <span className="block text-xs text-muted-foreground">
                  Неактивное подразделение нельзя выбирать в новых назначениях
                </span>
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
