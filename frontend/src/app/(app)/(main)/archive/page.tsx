import { assetsQuerySchema } from '@/features/assets/contracts/schemas'
import { requirePagePermission } from '@/lib/auth/authorization'
import { ArchiveClient } from '@/features/assets/ui/archive-client'
import { assetQueryString, readAssetCatalogs, readAssetList } from '@/features/assets/infrastructure/backend-ssr'

interface ArchivePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

export default async function ArchivePage({ searchParams }: ArchivePageProps) {
  const [user, params] = await Promise.all([requirePagePermission('assets.read'), searchParams])
  const parsed = assetsQuerySchema.safeParse({
    page: first(params.page),
    pageSize: first(params.pageSize),
    search: first(params.search),
    molId: first(params.molId),
    groupId: first(params.groupId),
    status: first(params.status),
    archived: 'true',
  })
  const query = parsed.success ? parsed.data : assetsQuerySchema.parse({ archived: 'true' })
  const [assetPage, { mols, groups }] = await Promise.all([
    readAssetList(user, assetQueryString({ ...query, archived: true }), 'Не удалось загрузить архив имущества'),
    readAssetCatalogs(user),
  ])

  return <ArchiveClient
    assets={assetPage.assets}
    mols={mols}
    groups={groups}
    pagination={{
      page: query.page,
      pageSize: query.pageSize,
      total: assetPage.pagination.total,
      totalPages: assetPage.pagination.totalPages,
    }}
    filters={{ search: query.search, molId: query.molId, groupId: query.groupId, status: query.status }}
    canEdit={user.access.has('assets.restore')}
  />
}
