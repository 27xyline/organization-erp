'use client'

import { useState, type FormEvent } from 'react'
import { FilePlus2, Loader2 } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { responseErrorMessage } from './upload-request'

interface DocumentGenerateDialogProps {
  onGenerated: () => void
  projectId?: string
}

export function DocumentGenerateDialog({
  onGenerated,
  projectId,
}: DocumentGenerateDialogProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setSubmitting(true)
    try {
      const response = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          template: data.get('template'),
          title: data.get('title'),
          number: data.get('number'),
          date: data.get('date'),
          subject: data.get('subject'),
          details: data.get('details'),
          basis: data.get('basis') || undefined,
          format: data.get('format') || 'docx',
          projectId,
        }),
      })
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response, 'Не удалось создать документ'))
      }
      toast.success('Документ создан по шаблону')
      form.reset()
      setOpen(false)
      onGenerated()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось создать документ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !submitting && setOpen(value)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FilePlus2 className="mr-2 h-4 w-4" />
          Создать по шаблону
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Документ по шаблону</DialogTitle>
          <DialogDescription>
            Система сформирует приказ или акт и сохранит его первой версией в локальном хранилище.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="template-type">Шаблон</Label>
            <select
              id="template-type"
              name="template"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue="PERSONNEL_ORDER"
            >
              <option value="PERSONNEL_ORDER">Приказ</option>
              <option value="ACCEPTANCE_ACT">Акт приёма-передачи</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="template-format">Формат файла</Label>
            <select
              id="template-format"
              name="format"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue="docx"
            >
              <option value="docx">Microsoft Word (.docx)</option>
              <option value="pdf">Adobe PDF (.pdf)</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px_170px]">
            <div className="grid gap-2">
              <Label htmlFor="template-title">Название в реестре</Label>
              <Input id="template-title" name="title" required maxLength={200} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="template-number">Номер</Label>
              <Input id="template-number" name="number" required maxLength={50} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="template-date">Дата</Label>
              <Input
                id="template-date"
                name="date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="template-subject">Заголовок</Label>
            <Input id="template-subject" name="subject" required maxLength={500} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="template-details">Содержание</Label>
            <Textarea id="template-details" name="details" required maxLength={5000} rows={7} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="template-basis">Основание</Label>
            <Textarea id="template-basis" name="basis" maxLength={1000} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Отмена
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
