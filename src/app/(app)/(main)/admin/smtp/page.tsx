'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, Send, ShieldCheck, Mail, Save, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'

export default function SmtpSettingsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [processing, setProcessing] = useState(false)

  const [host, setHost] = useState('')
  const [port, setPort] = useState(587)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [secure, setSecure] = useState(false)
  const [fromEmail, setFromEmail] = useState('')

  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null)
  const [outboxResult, setOutboxResult] = useState<{ sent: number; failed: number } | null>(null)

  useEffect(() => {
    async function loadSettings() {
      setLoading(true)
      try {
        const res = await fetch('/api/notifications/smtp')
        if (res.ok) {
          const data = await res.json()
          if (data) {
            setHost(data.host || '')
            setPort(data.port || 587)
            setUsername(data.username || '')
            setFromEmail(data.fromEmail || '')
            setSecure(data.secure || false)
            // Password is redacted on load, leave empty
            setPassword('')
          }
        }
      } catch (e) {
        toast.error('Не удалось загрузить настройки SMTP')
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/notifications/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host,
          port,
          username,
          password, // Will overwrite if provided
          secure,
          fromEmail,
        }),
      })
      if (res.ok) {
        toast.success('Настройки SMTP сохранены')
      } else {
        toast.error('Не удалось сохранить настройки')
      }
    } catch (err) {
      toast.error('Произошла ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/notifications/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host,
          port,
          username,
          password, // Redacted is handled on server (uses saved password)
          secure,
          fromEmail,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setTestResult({ success: true })
          toast.success('Соединение с SMTP сервером успешно установлено!')
        } else {
          setTestResult({ success: false, message: 'Не удалось пройти авторизацию или подключиться.' })
          toast.error('Проверка соединения не удалась')
        }
      } else {
        setTestResult({ success: false, message: 'Код ошибки сервера.' })
        toast.error('Ошибка проверки соединения')
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Ошибка сети.' })
      toast.error('Ошибка сети при проверке')
    } finally {
      setTesting(false)
    }
  }

  const processOutbox = async () => {
    setProcessing(true)
    setOutboxResult(null)
    try {
      const res = await fetch('/api/notifications/smtp/process', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setOutboxResult(data)
        toast.success(`Отправлено: ${data.sent}, Ошибок: ${data.failed}`)
      } else {
        toast.error('Ошибка при обработке очереди')
      }
    } catch (err) {
      toast.error('Ошибка сети при обработке очереди')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[900px] space-y-6 px-4 py-6 lg:px-8">
      <header className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2 w-fit">
          <Link href="/admin/users">
            <ArrowLeft className="mr-2 h-4 w-4" />К списку пользователей
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Настройки почты (SMTP)</h1>
        <p className="text-sm text-muted-foreground">
          Настройка почтового шлюза для рассылки уведомлений
        </p>
      </header>

      <div className="grid gap-6">
        <form onSubmit={saveSettings}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" /> Параметры SMTP
              </CardTitle>
              <CardDescription>
                Укажите адрес сервера, порт и учетные данные для авторизации
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">Хост (Host)</Label>
                  <Input
                    id="smtp-host"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="smtp.example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">Порт (Port)</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    value={port}
                    onChange={(e) => setPort(parseInt(e.target.value) || 587)}
                    placeholder="587"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-username">Логин (Username)</Label>
                  <Input
                    id="smtp-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="user@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-password">
                    Пароль (Password) {username && ' (Оставьте пустым, чтобы не менять)'}
                  </Label>
                  <Input
                    id="smtp-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtp-from">Отправитель (From Email)</Label>
                <Input
                  id="smtp-from"
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder="noreply@example.com"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  id="smtp-secure"
                  type="checkbox"
                  checked={secure}
                  onChange={(e) => setSecure(e.target.checked)}
                  className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                />
                <Label htmlFor="smtp-secure" className="cursor-pointer">
                  Использовать SSL/TLS шифрование (Secure connection)
                </Label>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                <Button type="submit" disabled={saving} className="flex-1 sm:flex-initial">
                  {saving ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Сохранить конфигурацию
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={testConnection}
                  disabled={testing}
                  className="flex-1 sm:flex-initial"
                >
                  {testing ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  )}
                  Проверить соединение
                </Button>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-lg border text-sm mt-3 ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  <p className="font-semibold">
                    {testResult.success
                      ? 'Соединение успешно проверено'
                      : 'Ошибка подключения к SMTP серверу'}
                  </p>
                  {testResult.message && <p className="text-xs mt-1">{testResult.message}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </form>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" /> Обработка очереди писем
            </CardTitle>
            <CardDescription>
              Запуск ручной обработки очереди `notificationOutbox`.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Невысланные уведомления накапливаются в таблице очереди и ожидают фоновой рассылки. Вы можете запустить отправку пакета писем прямо сейчас.
            </p>
            <Button onClick={processOutbox} disabled={processing} variant="secondary" className="w-full sm:w-auto">
              {processing ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Обработать очередь (Пакет 50 писем)
            </Button>

            {outboxResult && (
              <div className="p-3 rounded-lg border text-sm bg-blue-50 border-blue-200 text-blue-800">
                <p className="font-semibold">Результат обработки очереди:</p>
                <ul className="list-disc list-inside mt-1 text-xs space-y-1">
                  <li>Отправлено успешно: <span className="font-bold">{outboxResult.sent}</span></li>
                  <li>Ошибок отправки: <span className="font-bold">{outboxResult.failed}</span></li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
