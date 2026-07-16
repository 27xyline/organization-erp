import type { Asset } from '@/types'
import { AssetService } from '@/features/assets/asset.service'
import { assetsQuerySchema } from '@/features/assets/contracts/schemas'
import { requirePageUser } from '@/lib/auth/authorization'
import { AssetsPageClient } from './assets-page-client'

interface AssetsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function AssetsPage({ searchParams }: AssetsPageProps) {
  const [user, params] = await Promise.all([requirePageUser(), searchParams])
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
  const [{ assets, total }, { mols, groups }] = await Promise.all([
    AssetService.list(query),
    AssetService.listCatalogs(),
  ])
  const serializedAssets = assets.map((asset) => ({
    ...asset,
    unitPrice: asset.unitPrice.toString(),
    quantity: asset.quantity.toString(),
    totalCost: asset.totalCost.toString(),
    holdings: asset.holdings.map((holding) => ({
      ...holding,
      quantity: holding.quantity.toString(),
    })),
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
      canEdit={user.role !== 'VIEWER'}
    />
  )
}
