import type { DocumentView } from '@/features/documents/contracts/ui-types'
import { DocumentsPageClient } from '@/features/documents/ui/documents-page-client'
import { documentsQuerySchema } from '@/features/documents/contracts/document'
import { requirePagePermission } from '@/lib/auth/authorization'
import { backendUserFetch } from '@/lib/backend/bridge'
import { readBackendList } from '@/lib/backend/page-data'

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
  const search = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    archived: String(query.archived),
  })
  for (const key of ['search', 'status', 'category', 'projectId', 'employeeId', 'assetId'] as const) {
    const value = query[key]
    if (value) search.set(key, value)
  }

  const response = await backendUserFetch(`/api/documents?${search.toString()}`, user)
  const result = await readBackendList<DocumentView>(response, 'Не удалось загрузить документы из backend')

  return (
    <DocumentsPageClient
      documents={result.data}
      pagination={{
        page: query.page,
        pageSize: query.pageSize,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages,
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
