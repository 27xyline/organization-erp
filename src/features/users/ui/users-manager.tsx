'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import {
  APP_ROLES,
  DEFAULT_ROLE_SCOPES,
  ROLE_LABELS,
  type AppRole,
  type ScopeMode,
} from '@/lib/auth/permissions'

export interface AssignmentDraft {
  role: AppRole
  departmentScopeMode: ScopeMode
  projectScopeMode: ScopeMode
  departmentIds: string[]
  projectIds: string[]
}

export interface UserRow {
  id: string
  username: string
  name: string
  employeeId: string | null
  assignments: AssignmentDraft[]
  isActive: boolean
  mustChangePassword: boolean
  lockedUntil: string | null
  lastLoginAt: string | null
}

interface ApiUser {
  id: string
  username: string
  name: string
  employeeId: string | null
  roleAssignments: Array<{
    role: AppRole
    departmentScopeMode: ScopeMode
    projectScopeMode: ScopeMode
    departmentScopes: Array<{ departmentId: string }>
    projectScopes: Array<{ projectId: string }>
  }>
  isActive: boolean
  mustChangePassword: boolean
  lockedUntil: string | null
  lastLoginAt: string | null
}

export interface AccessReferences {
  departments: Array<{ id: string; code: string; name: string; parentId: string | null }>
  projects: Array<{ id: string; code: string; name: string }>
  employees: Array<{ id: string; code: string; fullName: string; departmentId: string }>
}

interface ApiErrorBody {
  error?: { message?: string }
}

const scopeModeLabels: Record<ScopeMode, string> = {
  NONE: 'Не используется',
  ALL: 'Все',
  ASSIGNED: 'Выбранные',
  SELF: 'Свои',
}

function allowedDepartmentModes(role: AppRole): ScopeMode[] {
  if (['ADMIN', 'AUDITOR'].includes(role)) return ['ALL']
  if (role === 'EMPLOYEE') return ['SELF']
  if (['HR', 'ACCOUNTANT', 'ASSET_CUSTODIAN', 'DEPARTMENT_HEAD'].includes(role)) {
    return ['ASSIGNED', 'ALL']
  }
  return ['NONE']
}

function allowedProjectModes(role: AppRole): ScopeMode[] {
  if (['ADMIN', 'AUDITOR'].includes(role)) return ['ALL']
  if (role === 'EMPLOYEE') return ['SELF']
  if (['ACCOUNTANT', 'PROJECT_MANAGER', 'DEPARTMENT_HEAD'].includes(role)) {
    return ['ASSIGNED', 'ALL']
  }
  return ['NONE']
}

function defaultAssignment(role: AppRole): AssignmentDraft {
  return {
    role,
    ...DEFAULT_ROLE_SCOPES[role],
    departmentIds: [],
    projectIds: [],
  }
}

function fromApi(user: ApiUser): UserRow {
  return {
    ...user,
    assignments: user.roleAssignments.map((assignment) => ({
      role: assignment.role,
      departmentScopeMode: assignment.departmentScopeMode,
      projectScopeMode: assignment.projectScopeMode,
      departmentIds: assignment.departmentScopes.map((scope) => scope.departmentId),
      projectIds: assignment.projectScopes.map((scope) => scope.projectId),
    })),
  }
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null
  return body?.error?.message || 'Не удалось выполнить операцию'
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function ScopeChecklist({
  label,
  items,
  selected,
  onChange,
}: {
  label: string
  items: Array<{ id: string; label: string }>
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <fieldset className="rounded-md border p-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">{label}</legend>
      <div className="grid max-h-40 gap-2 overflow-auto sm:grid-cols-2">
        {items.map((item) => (
          <label key={item.id} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={selected.includes(item.id)}
              onChange={() => onChange(toggleValue(selected, item.id))}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function RoleAssignmentsEditor({
  value,
  onChange,
  references,
}: {
  value: AssignmentDraft[]
  onChange: (assignments: AssignmentDraft[]) => void
  references: AccessReferences
}) {
  const patchAssignment = (role: AppRole, patch: Partial<AssignmentDraft>) => {
    onChange(value.map((assignment) =>
      assignment.role === role ? { ...assignment, ...patch } : assignment
    ))
  }

  const toggleRole = (role: AppRole) => {
    onChange(
      value.some((assignment) => assignment.role === role)
        ? value.filter((assignment) => assignment.role !== role)
        : [...value, defaultAssignment(role)],
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {APP_ROLES.map((role) => {
          const checked = value.some((assignment) => assignment.role === role)
          return (
            <label
              key={role}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                checked ? 'border-primary bg-primary/5' : ''
              }`}
            >
              <input type="checkbox" checked={checked} onChange={() => toggleRole(role)} />
              {ROLE_LABELS[role]}
            </label>
          )
        })}
      </div>

      {value.map((assignment) => {
        const departmentModes = allowedDepartmentModes(assignment.role)
        const projectModes = allowedProjectModes(assignment.role)
        return (
          <div key={assignment.role} className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="font-medium">{ROLE_LABELS[assignment.role]}</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Подразделения</Label>
                <Select
                  value={assignment.departmentScopeMode}
                  onValueChange={(mode: ScopeMode) => patchAssignment(assignment.role, {
                    departmentScopeMode: mode,
                    departmentIds: mode === 'ASSIGNED' ? assignment.departmentIds : [],
                  })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {departmentModes.map((mode) => (
                      <SelectItem key={mode} value={mode}>{scopeModeLabels[mode]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Проекты</Label>
                <Select
                  value={assignment.projectScopeMode}
                  onValueChange={(mode: ScopeMode) => patchAssignment(assignment.role, {
                    projectScopeMode: mode,
                    projectIds: mode === 'ASSIGNED' ? assignment.projectIds : [],
                  })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {projectModes.map((mode) => (
                      <SelectItem key={mode} value={mode}>{scopeModeLabels[mode]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {assignment.departmentScopeMode === 'ASSIGNED' ? (
              <ScopeChecklist
                label="Доступные подразделения (включая дочерние)"
                items={references.departments.map((department) => ({
                  id: department.id,
                  label: `${department.code} · ${department.name}`,
                }))}
                selected={assignment.departmentIds}
                onChange={(departmentIds) => patchAssignment(assignment.role, { departmentIds })}
              />
            ) : null}
            {assignment.projectScopeMode === 'ASSIGNED' ? (
              <ScopeChecklist
                label="Доступные проекты"
                items={references.projects.map((project) => ({
                  id: project.id,
                  label: `${project.code} · ${project.name}`,
                }))}
                selected={assignment.projectIds}
                onChange={(projectIds) => patchAssignment(assignment.role, { projectIds })}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function UsersManager({
  initialUsers,
  references,
}: {
  initialUsers: UserRow[]
  references: AccessReferences
}) {
  const { toast } = useToast()
  const [users, setUsers] = useState(initialUsers)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    username: '',
    name: '',
    employeeId: null as string | null,
    assignments: [defaultAssignment('AUDITOR')],
    temporaryPassword: '',
  })

  const refreshUsers = async () => {
    const response = await fetch('/api/users?pageSize=100')
    if (!response.ok) throw new Error(await readError(response))
    const body = (await response.json()) as { data: ApiUser[] }
    setUsers(body.data.map(fromApi))
  }

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault()
    setCreating(true)
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      })
      if (!response.ok) throw new Error(await readError(response))
      await refreshUsers()
      setCreateForm({
        username: '',
        name: '',
        employeeId: null,
        assignments: [defaultAssignment('AUDITOR')],
        temporaryPassword: '',
      })
      toast.success('Пользователь создан')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось создать пользователя')
    } finally {
      setCreating(false)
    }
  }

  const patchLocalUser = (id: string, patch: Partial<UserRow>) => {
    setUsers((current) => current.map((user) => user.id === id ? { ...user, ...patch } : user))
  }

  const saveUser = async (user: UserRow) => {
    setSavingId(user.id)
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: user.name,
          employeeId: user.employeeId,
          assignments: user.assignments,
          isActive: user.isActive,
        }),
      })
      if (!response.ok) throw new Error(await readError(response))
      await refreshUsers()
      toast.success('Изменения сохранены')
    } catch (error) {
      await refreshUsers()
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить пользователя')
    } finally {
      setSavingId(null)
    }
  }

  const employeeSelect = (
    value: string | null,
    onChange: (employeeId: string | null) => void,
  ) => (
    <Select value={value || '__none__'} onValueChange={(id) => onChange(id === '__none__' ? null : id)}>
      <SelectTrigger><SelectValue placeholder="Не связана" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Не связана</SelectItem>
        {references.employees.map((employee) => (
          <SelectItem key={employee.id} value={employee.id}>
            {employee.code} · {employee.fullName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Новый пользователь</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={createUser} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="username">Логин</Label>
                <Input
                  id="username"
                  value={createForm.username}
                  onChange={(event) => setCreateForm((form) => ({ ...form, username: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Имя</Label>
                <Input
                  id="name"
                  value={createForm.name}
                  onChange={(event) => setCreateForm((form) => ({ ...form, name: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Кадровая карточка</Label>
                {employeeSelect(createForm.employeeId, (employeeId) =>
                  setCreateForm((form) => ({ ...form, employeeId })))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="temporaryPassword">Временный пароль</Label>
                <Input
                  id="temporaryPassword"
                  type="password"
                  minLength={7}
                  value={createForm.temporaryPassword}
                  onChange={(event) => setCreateForm((form) => ({
                    ...form,
                    temporaryPassword: event.target.value,
                  }))}
                  required
                />
              </div>
            </div>
            <RoleAssignmentsEditor
              value={createForm.assignments}
              onChange={(assignments) => setCreateForm((form) => ({ ...form, assignments }))}
              references={references}
            />
            <Button type="submit" disabled={creating}>
              {creating ? 'Создание…' : 'Создать пользователя'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {users.map((user) => (
          <Card key={user.id}>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>{user.name}</CardTitle>
                <div className="mt-1 font-mono text-xs text-muted-foreground">{user.username}</div>
              </div>
              <Badge variant={user.isActive ? 'default' : 'secondary'}>
                {user.isActive ? 'Активен' : 'Отключён'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Имя</Label>
                  <Input
                    value={user.name}
                    onChange={(event) => patchLocalUser(user.id, { name: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Кадровая карточка</Label>
                  {employeeSelect(user.employeeId, (employeeId) =>
                    patchLocalUser(user.id, { employeeId }))}
                </div>
                <label className="flex items-center gap-2 self-end rounded-md border px-3 py-2">
                  <input
                    type="checkbox"
                    checked={user.isActive}
                    onChange={(event) => patchLocalUser(user.id, { isActive: event.target.checked })}
                  />
                  Учётная запись активна
                </label>
              </div>
              <RoleAssignmentsEditor
                value={user.assignments}
                onChange={(assignments) => patchLocalUser(user.id, { assignments })}
                references={references}
              />
              <Button onClick={() => saveUser(user)} disabled={savingId === user.id}>
                {savingId === user.id ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
