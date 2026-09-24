import type { Asset } from '@/features/assets/contracts/types'
import { AssetService } from '@/features/assets/application/asset.service'
import { getAssetSavedViewService } from '@/features/assets/application/saved-view.service'
import { assetSavedViewFiltersSchema } from '@/features/assets/contracts/saved-view'
import { assetsQuerySchema } from '@/features/assets/contracts/schemas'
import { defaultLandingPath, requirePageUser } from '@/lib/auth/authorization'
import { AssetsPageClient } from '@/features/assets/ui/assets-page-client'
import { redirect } from 'next/navigation'

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
  const [{ assets, total }, { mols, groups }, savedViews] = await Promise.all([
    AssetService.list(query, user.access),
    AssetService.listCatalogs(user.access),
    getAssetSavedViewService().list(user.id),
  ])
  const serializedAssets = assets.map((asset) => ({
    ...asset,
    initialCost: asset.initialCost.toString(),
    unitPrice: asset.unitPrice.toString(),
    quantity: asset.quantity.toString(),
    totalCost: asset.totalCost.toString(),
    holdings: asset.holdings
      ? asset.holdings.map((holding) => ({
          ...holding,
          quantity: holding.quantity.toString(),
        }))
      : [],
  })) as unknown as Asset[]
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize))

  return (
    <AssetsPageClient
      assets={serializedAssets}
      mols={mols}
      groups={groups}
      pagination={{ page: query.page, pageSize: query.pageSize, total, totalPages }}
      filters={{
        search: query.search,
        molId: query.molId,
        groupId: query.groupId,
        status: query.status,
        accountingForm: query.accountingForm,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      }}
      savedViews={savedViews.map((view) => ({
        ...view,
        filters: assetSavedViewFiltersSchema.parse(view.filters),
      }))}
      canEdit={user.access.has('assets.update')}
      canImport={canCreateAssets}
      canInventory={canManageInventory}
    />
  )
}
