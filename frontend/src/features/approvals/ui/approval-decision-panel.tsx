'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function ApprovalDecisionPanel({ id }: { id: string }) {
  const router = useRouter()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function decide(decision: 'APPROVE' | 'REJECT') {
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/approvals/${id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, comment: comment.trim() || undefined }),
    })
    const body = await response.json().catch(() => ({}))
    setBusy(false)
    if (!response.ok) {
      setError(body.error?.message || 'Не удалось сохранить решение')
      return
    }
    router.refresh()
  }

  return (
    <section className="grid gap-3 rounded-lg border p-4" aria-label="Решение по согласованию">
      <label className="grid gap-2 text-sm font-medium">
        Комментарий к решению
        <Textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} />
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void decide('APPROVE')}>Согласовать</Button>
        <Button disabled={busy} variant="destructive" onClick={() => void decide('REJECT')}>Отклонить</Button>
      </div>
    </section>
  )
}
