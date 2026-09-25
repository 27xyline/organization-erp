import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ApprovalDecisionPanel } from '@/features/approvals/ui/approval-decision-panel'
import { getApprovalService } from '@/features/approvals/application/approval.service'
import { requirePagePermission } from '@/lib/auth/authorization'
import { formatDateTime } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const labels: Record<string, string> = {
  DRAFT: 'Черновик', PENDING: 'На согласовании', APPROVED: 'Согласовано',
  REJECTED: 'Отклонено', CANCELLED: 'Отменено',
}

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([
    requirePagePermission('approvals.read'),
    params,
  ])
  const canViewAll = user.roles.some((role) => role === 'ADMIN' || role === 'AUDITOR')
  const request = await getApprovalService().getVisibleById(id, user.id, canViewAll)
  if (!request) notFound()
  const currentStep = request.steps.find((step) => step.sequence === request.currentStep && step.status === 'PENDING')
  const canDecide = user.access.has('approvals.decide') && currentStep?.approverId === user.id

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <Button asChild variant="ghost" className="-ml-3"><Link href="/approvals">← Все согласования</Link></Button>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-2xl">{request.title}</CardTitle>
            <Badge variant={request.status === 'REJECTED' ? 'destructive' : 'secondary'}>{labels[request.status] || request.status}</Badge>
          </div>
          <CardDescription>
            Инициатор: {request.requestedBy.name}
            {request.dueAt && ` · срок ${formatDateTime(request.dueAt)}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {request.description && <p className="whitespace-pre-wrap text-sm">{request.description}</p>}
          {request.document && <p className="text-sm">Документ: {request.document.title}</p>}
          {request.project && <p className="text-sm">Проект: {request.project.code} — {request.project.name}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {request.steps.map((step) => (
              <div key={step.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{step.sequence}. {step.name}</span>
                  <Badge variant="outline">{step.status}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{step.approver.name}</p>
                {step.comment && <p className="mt-2 whitespace-pre-wrap">{step.comment}</p>}
              </div>
            ))}
          </div>
          {canDecide && <ApprovalDecisionPanel id={request.id} />}
        </CardContent>
      </Card>
    </main>
  )
}
