'use client'

import { useState, type FormEvent } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
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
import { DOCUMENT_ACCEPT_ATTRIBUTE } from '../domain/document-file-types'
import {
  encodeDocumentMetadata,
  responseErrorMessage,
} from './upload-request'

interface DocumentVersionDialogProps {
  documentId: string
  lockVersion: number
  onUploaded: () => void
}

export function DocumentVersionDialog({
  documentId,
  lockVersion,
  onUploaded,
}: DocumentVersionDialogProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const file = data.get('file')
    if (!(file instanceof File) || file.size === 0) {
      toast.error('Выберите файл новой версии')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(`/api/documents/${documentId}/versions`, {
        method: 'POST',
        headers: {
          'content-type': file.type || 'application/octet-stream',
          'x-document-metadata': encodeDocumentMetadata({
            filename: file.name,
            comment: String(data.get('comment') || '') || undefined,
            lockVersion,
          }),
        },
        body: file,
      })
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response, 'Не удалось добавить версию'))
      }
      toast.success('Новая версия загружена')
      form.reset()
      setOpen(false)
      onUploaded()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось добавить версию')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !submitting && setOpen(value)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileUp className="mr-2 h-4 w-4" />
          Новая версия
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить новую версию</DialogTitle>
          <DialogDescription>
            Предыдущая версия останется доступна и не будет изменена.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="new-document-version">Файл</Label>
            <Input
              id="new-document-version"
              name="file"
              type="file"
              accept={DOCUMENT_ACCEPT_ATTRIBUTE}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="document-version-comment">Комментарий к версии</Label>
            <Textarea
              id="document-version-comment"
              name="comment"
              maxLength={500}
              placeholder="Что изменилось"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitting ? 'Загружаем…' : 'Добавить версию'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
