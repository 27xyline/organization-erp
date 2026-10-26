import { notFound } from 'next/navigation'
import type { DocumentView } from '@/features/documents/contracts/ui-types'
import { DocumentDetailClient } from '@/features/documents/ui/document-detail-client'
import { requirePagePermission } from '@/lib/auth/authorization'
import { backendUserFetch } from '@/lib/backend/transport'
import { BackendRequestError } from '@/lib/backend/client'
import { readBackendData } from '@/lib/backend/page-data'

interface DocumentPageProps {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

export default async function DocumentPage({ params }: DocumentPageProps) {
  const [user, { id }] = await Promise.all([
    requirePagePermission('documents.read'),
    params,
  ])

  let response: Response
  try {
    response = await backendUserFetch(`/api/documents/${encodeURIComponent(id)}`, user)
  } catch (cause) {
    throw new Error('Не удалось загрузить документ из backend', { cause })
  }
  if (response.status === 404) notFound()

  let document: DocumentView
  try {
    document = await readBackendData<DocumentView>(response, 'Не удалось загрузить документ из backend')
  } catch (error) {
    if (error instanceof BackendRequestError && error.status === 404) notFound()
    throw error
  }

  return (
    <DocumentDetailClient
      document={document}
      canUpdate={user.permissions.includes('documents.update')}
      canArchive={user.permissions.includes('documents.archive')}
    />
  )
}
