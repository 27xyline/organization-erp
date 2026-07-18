'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'

export function PasswordForm() {
  const { toast } = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message || 'Не удалось изменить пароль')
      setCurrentPassword('')
      setNewPassword('')
      toast.success('Пароль изменён')
      await signOut({ callbackUrl: '/login?passwordChanged=1' })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось изменить пароль')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Текущий пароль</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">Новый пароль</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={7}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">Минимум 7 символов.</p>
      </div>
      <Button type="submit" disabled={saving}>{saving ? 'Сохранение…' : 'Изменить пароль'}</Button>
    </form>
  )
}
