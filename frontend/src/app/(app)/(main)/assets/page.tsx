import { assetSavedViewFiltersSchema } from '@/features/assets/contracts/saved-view'
import { assetsQuerySchema } from '@/features/assets/contracts/schemas'
import { defaultLandingPath, requirePageUser } from '@/lib/auth/authorization'
import { AssetsPageClient } from '@/features/assets/ui/assets-page-client'
import { redirect } from 'next/navigation'
import { assetQueryString, readAssetCatalogs, readAssetList, readAssetSavedViews } from '@/features/assets/infrastructure/backend-ssr'

interface AssetsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function AssetsPage({ searchParams }: AssetsPageProps) {
  const [user, params] = await Promise.all([requirePageUser(), searchParams])
  if (!user.access.has('assets.read')) redirect(defaultLandingPath(user))
  const createDepartmentIds = user.access.allowedDepartmentIds('assets.create')
  const canCreateAssets = user.access.has('assets.create') &&
    (createDepartmentIds === null || createDepartmentIds.length > 0)
  const inventoryDepartmentIds = user.access.allowedDepartmentIds('assets.inventory.manage')
  const canManageInventory = user.access.has('assets.inventory.manage') &&
    (inventoryDepartmentIds === null || inventoryDepartmentIds.length > 0)
  const parsed = assetsQuerySchema.safeParse({
    page: first(params.page),
    pageSize: first(params.pageSize),
    search: first(params.search),
    molId: first(params.molId),
    groupId: first(params.groupId),
    status: first(params.status),
    accountingForm: first(params.accountingForm),
    dateFrom: first(params.dateFrom),
    dateTo: first(params.dateTo),
    archived: 'false',
  })
  const query = parsed.success ? parsed.data : assetsQuerySchema.parse({ archived: 'false' })
  const [assetPage, { mols, groups }, savedViews] = await Promise.all([
    readAssetList(user, assetQueryString({ ...query, archived: false }), 'Не удалось загрузить имущество'),
    readAssetCatalogs(user),
    readAssetSavedViews(user),
  ])

  return (
    <AssetsPageClient
      assets={assetPage.assets}
      mols={mols}
      groups={groups}
      pagination={assetPage.pagination}
      filters={{
        search: query.search,
        molId: query.molId,
        groupId: query.groupId,
        status: query.status,
        accountingForm: query.accountingForm,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      }}
      savedViews={savedViews.map((view) => ({ ...view, filters: assetSavedViewFiltersSchema.parse(view.filters) }))}
      canEdit={user.access.has('assets.update')}
      canImport={canCreateAssets}
      canInventory={canManageInventory}
    />
  )
}
