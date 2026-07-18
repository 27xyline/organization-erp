import { notFound } from 'next/navigation'
import { DocumentServiceError, getDocumentService } from '@/features/documents/application/document.service'
import type { DocumentView } from '@/features/documents/contracts/ui-types'
import { DocumentDetailClient } from '@/features/documents/ui/document-detail-client'
import { requirePagePermission } from '@/lib/auth/authorization'
import type { AccessContext } from '@/lib/auth/access-context'

interface DocumentPageProps {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

async function loadDocument(id: string, user: { id: string; access: AccessContext }) {
  try {
    return await getDocumentService().get(id, user)
  } catch (error) {
    if (error instanceof DocumentServiceError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
}

export default async function DocumentPage({ params }: DocumentPageProps) {
  const [user, { id }] = await Promise.all([
    requirePagePermission('documents.read'),
    params,
  ])
  const document = await loadDocument(id, { id: user.id, access: user.access })
  const view = {
    ...document,
    archivedAt: document.archivedAt?.toISOString() || null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    versions: document.versions.map((version) => ({
      ...version,
      createdAt: version.createdAt.toISOString(),
    })),
  } as DocumentView
  return (
    <DocumentDetailClient
      document={view}
      canUpdate={user.permissions.includes('documents.update')}
      canArchive={user.permissions.includes('documents.archive')}
    />
  )
}
