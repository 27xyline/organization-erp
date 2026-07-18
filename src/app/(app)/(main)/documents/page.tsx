import { getDocumentService } from '@/features/documents/application/document.service'
import { documentsQuerySchema } from '@/features/documents/contracts/document'
import type { DocumentView } from '@/features/documents/contracts/ui-types'
import { DocumentsPageClient } from '@/features/documents/ui/documents-page-client'
import { requirePagePermission } from '@/lib/auth/authorization'

interface DocumentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

export const dynamic = 'force-dynamic'

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const [user, params] = await Promise.all([
    requirePagePermission('documents.read'),
    searchParams,
  ])
  const parsed = documentsQuerySchema.safeParse({
    page: first(params.page),
    pageSize: first(params.pageSize),
    search: first(params.search),
    status: first(params.status),
    category: first(params.category),
    projectId: first(params.projectId),
    archived: first(params.archived),
  })
  const query = parsed.success ? parsed.data : documentsQuerySchema.parse({})
  const result = await getDocumentService().list(query, { id: user.id, access: user.access })
  const documents = result.documents.map((document) => ({
    ...document,
    archivedAt: document.archivedAt?.toISOString() || null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    versions: document.versions.map((version) => ({
      ...version,
      createdAt: version.createdAt.toISOString(),
    })),
  })) as DocumentView[]

  return (
    <DocumentsPageClient
      documents={documents}
      pagination={{
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / query.pageSize)),
      }}
      filters={{
        search: query.search,
        status: query.status,
        category: query.category,
        projectId: query.projectId,
        archived: query.archived,
      }}
      canEdit={user.permissions.includes('documents.create')}
    />
  )
}
