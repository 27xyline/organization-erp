'use client'

import { useState, type FormEvent } from 'react'
import { BookmarkPlus, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type {
  AssetSavedViewFilters,
  AssetSavedViewSummary,
} from '@/features/assets/contracts/saved-view'

export function AssetSavedViewsToolbar({
  currentFilters,
  initialViews,
  onApply,
}: {
  currentFilters: AssetSavedViewFilters
  initialViews: AssetSavedViewSummary[]
  onApply: (filters: AssetSavedViewFilters) => void
}) {
  const [views, setViews] = useState(initialViews)
  const [selectedId, setSelectedId] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const selectedView = views.find((view) => view.id === selectedId)

  async function saveView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/assets/saved-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, filters: currentFilters }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage(body.error?.message || 'Не удалось сохранить представление')
        return
      }
      const view = body.data as AssetSavedViewSummary
      setViews((current) => [view, ...current.filter((item) => item.id !== view.id)])
      setSelectedId(view.id)
      setName('')
      setSaveOpen(false)
      setMessage('Представление сохранено')
    } catch {
      setMessage('Не удалось сохранить представление. Проверьте соединение и повторите попытку.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteSelectedView() {
    if (!selectedView) return
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/assets/saved-views/${selectedView.id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setMessage(body.error?.message || 'Не удалось удалить представление')
        return
      }
      setViews((current) => current.filter((view) => view.id !== selectedView.id))
      setSelectedId('')
      setMessage('Представление удалено')
    } catch {
      setMessage('Не удалось удалить представление. Проверьте соединение и повторите попытку.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="asset-saved-view" className="sr-only">Сохранённый вид реестра</Label>
        <Select
          value={selectedId}
          onValueChange={setSelectedId}
          disabled={views.length === 0 || busy}
        >
          <SelectTrigger id="asset-saved-view" className="w-full sm:w-[260px]">
            <SelectValue placeholder={views.length ? 'Мои представления' : 'Нет сохранённых видов'} />
          </SelectTrigger>
          <SelectContent>
            {views.map((view) => (
              <SelectItem key={view.id} value={view.id}>{view.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={!selectedView || busy}
          onClick={() => selectedView && onApply(selectedView.filters)}
        >
          Применить
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Удалить выбранный вид"
          disabled={!selectedView || busy}
          onClick={() => void deleteSelectedView()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>

      <Dialog
        open={saveOpen}
        onOpenChange={(open) => {
          setSaveOpen(open)
          if (open) setMessage(null)
        }}
      >
        <DialogTrigger asChild>
          <Button type="button" variant="outline">
            <BookmarkPlus className="mr-2 h-4 w-4" />Сохранить фильтры
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form className="grid gap-4" onSubmit={saveView}>
            <DialogHeader>
              <DialogTitle>Сохранить представление</DialogTitle>
              <DialogDescription>
                Текущие фильтры появятся в ваших представлениях на всех устройствах.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="asset-saved-view-name">Название</Label>
              <Input
                id="asset-saved-view-name"
                autoFocus
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Например, имущество на ремонте"
              />
            </div>
            {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
            <DialogFooter>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {message && !saveOpen && (
        <p role="status" className="text-sm text-muted-foreground" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  )
}
