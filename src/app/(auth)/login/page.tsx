'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Mountain } from 'lucide-react'

function getSafeCallbackUrl(path: string | null) {
  if (typeof window === 'undefined') {
    return '/'
  }

  try {
    const url = new URL(path || '/', window.location.origin)

    if (url.origin !== window.location.origin) {
      return '/'
    }

    return url.toString()
  } catch {
    return window.location.origin
  }
}

function toRouterPath(url: string | null | undefined) {
  if (!url) {
    return '/'
  }

  try {
    const nextUrl = new URL(url, window.location.origin)

    if (nextUrl.origin !== window.location.origin) {
      return '/'
    }

    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
  } catch {
    return '/'
  }
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('from')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const safeCallbackUrl = getSafeCallbackUrl(callbackUrl)
      const res = await signIn('credentials', {
        redirect: false,
        username,
        password,
        callbackUrl: safeCallbackUrl,
      })

      if (res?.error) {
        setError('Неверный логин или пароль')
      } else {
        router.push(toRouterPath(res?.url || safeCallbackUrl))
        router.refresh()
      }
    } catch (err) {
      setError('Произошла ошибка при входе')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="flex justify-center mb-2">
            <div className="bg-primary/10 p-3 rounded-full">
              <Mountain className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">MC Accounting</CardTitle>
          <CardDescription>Введите данные для входа в систему</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Пользователь</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="text-sm font-medium text-destructive mt-2 text-center">
                {error}
              </div>
            )}

            <Button className="w-full mt-6" type="submit" disabled={loading}>
              {loading ? 'Вход...' : 'Войти'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center text-sm text-muted-foreground pt-4 border-t">
          <p>По умолчанию: admin / admin</p>
        </CardFooter>
      </Card>
    </div>
  )
}
