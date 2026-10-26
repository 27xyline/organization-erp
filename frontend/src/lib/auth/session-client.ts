'use client'

import { useEffect, useState } from 'react'

export interface BrowserActor {
  id: string
  name: string
  username: string
  role: string
  roles: string[]
  permissions: string[]
  employeeId: string | null
  mustChangePassword: boolean
  sessionVersion: number
}

export interface BrowserSession {
  user: BrowserActor
  expires: string
}

async function getCsrfToken(): Promise<string> {
  const response = await fetch('/api/auth/csrf', { cache: 'no-store' })
  if (!response.ok) throw new Error('Не удалось проверить запрос')
  const payload = await response.json() as { csrfToken?: string }
  if (!payload.csrfToken) throw new Error('Не удалось проверить запрос')
  return payload.csrfToken
}

export async function signInSession(username: string, password: string): Promise<void> {
  const csrfToken = await getCsrfToken()
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({ username, password }),
    cache: 'no-store',
  })
  if (response.status === 401) throw new Error('Неверный логин или пароль')
  if (!response.ok) throw new Error('Произошла ошибка при входе')
}

export async function signOutSession(callbackUrl = '/login'): Promise<void> {
  const csrfToken = await getCsrfToken()
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'x-csrf-token': csrfToken },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Не удалось завершить сеанс')
  window.location.assign(callbackUrl)
}

export function useSession(): {
  data: BrowserSession | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
} {
  const [data, setData] = useState<BrowserSession | null>(null)
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')
  useEffect(() => {
    let active = true
    fetch('/api/account/me', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null
        const payload = await response.json() as { data?: BrowserActor }
        return payload.data ?? null
      })
      .then((actor) => {
        if (!active) return
        if (actor) {
          setData({ user: actor, expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() })
          setStatus('authenticated')
        } else {
          setData(null)
          setStatus('unauthenticated')
        }
      })
      .catch(() => { if (active) setStatus('unauthenticated') })
    return () => { active = false }
  }, [])
  return { data, status }
}
