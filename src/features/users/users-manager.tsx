'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'

type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER'

export interface UserRow {
  id: string
  username: string
  name: string
  role: UserRole
  isActive: boolean
  mustChangePassword: boolean
  lockedUntil: string | null
  lastLoginAt: string | null
}

interface ApiErrorBody {
  error?: { message?: string }
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null
  return body?.error?.message || 'Не удалось выполнить операцию'
}

export function UsersManager({ initialUsers }: { initialUsers: UserRow[] }) {
  const { toast } = useToast()
  const [users, setUsers] = useState(initialUsers)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    username: '',
    name: '',
    role: 'VIEWER' as UserRole,
    temporaryPassword: '',
  })

  const refreshUsers = async () => {
    const response = await fetch('/api/users?pageSize=100')
    if (!response.ok) throw new Error(await readError(response))
    const body = (await response.json()) as { data: UserRow[] }
    setUsers(body.data)
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
      setCreateForm({ username: '', name: '', role: 'VIEWER', temporaryPassword: '' })
      toast.success('Пользователь создан')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось создать пользователя')
    } finally {
      setCreating(false)
    }
  }

  const patchLocalUser = (id: string, patch: Partial<UserRow>) => {
    setUsers((current) => current.map((user) => (user.id === id ? { ...user, ...patch } : user)))
  }

  const saveUser = async (user: UserRow) => {
    setSavingId(user.id)
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: user.name, role: user.role, isActive: user.isActive }),
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Новый пользователь</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createUser} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              <Label>Роль</Label>
              <Select
                value={createForm.role}
                onValueChange={(role: UserRole) => setCreateForm((form) => ({ ...form, role }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Администратор</SelectItem>
                  <SelectItem value="EDITOR">Редактор</SelectItem>
                  <SelectItem value="VIEWER">Наблюдатель</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="temporaryPassword">Временный пароль</Label>
              <Input
                id="temporaryPassword"
                type="password"
                minLength={12}
                value={createForm.temporaryPassword}
                onChange={(event) => setCreateForm((form) => ({ ...form, temporaryPassword: event.target.value }))}
                required
              />
            </div>
            <Button type="submit" disabled={creating} className="md:col-span-2 xl:col-span-4 xl:w-fit">
              {creating ? 'Создание…' : 'Создать пользователя'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Пользователи</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Логин</TableHead>
                <TableHead>Имя</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-mono text-xs">{user.username}</TableCell>
                  <TableCell>
                    <Input
                      value={user.name}
                      onChange={(event) => patchLocalUser(user.id, { name: event.target.value })}
                    />
                  </TableCell>
                  <TableCell className="min-w-44">
                    <Select
                      value={user.role}
                      onValueChange={(role: UserRole) => patchLocalUser(user.id, { role })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">Администратор</SelectItem>
                        <SelectItem value="EDITOR">Редактор</SelectItem>
                        <SelectItem value="VIEWER">Наблюдатель</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={user.isActive}
                        onChange={(event) => patchLocalUser(user.id, { isActive: event.target.checked })}
                      />
                      <Badge variant={user.isActive ? 'default' : 'secondary'}>
                        {user.isActive ? 'Активен' : 'Отключён'}
                      </Badge>
                    </label>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => saveUser(user)} disabled={savingId === user.id}>
                      {savingId === user.id ? 'Сохранение…' : 'Сохранить'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
