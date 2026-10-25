import type { Asset, AssetGroup, Mol } from '@/features/assets/contracts/types'
import type { AssetSavedViewSummary } from '@/features/assets/contracts/saved-view'
import { backendUserFetch } from '@/lib/backend/transport'
import { BackendRequestError } from '@/lib/backend/client'
import { readBackendData } from '@/lib/backend/page-data'

export type AssetSsrDTO = Omit<Asset, 'recordingDate' | 'plannedDisposalDate'> & {
  recordingDate: string
  plannedDisposalDate?: string | null
  initialCost?: string
}

export type AssetDetailSsrDTO = AssetSsrDTO & {
  holdings: NonNullable<Asset['holdings']>
  operations: NonNullable<Asset['operations']>
}

export interface AssetListPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface AssetCatalogsDTO {
  mols: Mol[]
  groups: AssetGroup[]
}

export interface AssetInventoryActDTO {
  inventory: {
    name: string
    status: 'IN_PROGRESS' | 'COMPLETED'
    createdAt: string
    completedAt: string | null
    mol: { code: string; fullName: string; storageLocation: string; department: string }
    createdBy: { name: string }
  }
  entries: Array<{
    id: string
    inventoryNumber: string
    assetName: string
    unitOfMeasure: string
    expectedQuantity: string
    foundQuantity: string | null
    differenceQuantity: string | null
    note: string | null
  }>
  summary: {
    totalAssets: number
    checkedAssets: number
    missingAssets: number
    totalDiscrepancies: number
  }
}

type BackendIdentity = { id: string; sessionVersion: number }

export function assetQueryString(values: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) query.set(key, String(value))
  }
  return query.toString()
}

export async function readAssetList(
  user: BackendIdentity,
  query: string,
  message: string,
): Promise<{ assets: AssetSsrDTO[]; pagination: AssetListPagination }> {
  const suffix = query ? `?${query}` : ''
  const response = await backendUserFetch(`/api/assets${suffix}`, user)
  if (!response.ok) throw new BackendRequestError(message, response.status)
  try {
    const payload = await response.json() as {
      data?: AssetSsrDTO[]
      pagination?: AssetListPagination
    }
    if (!Array.isArray(payload.data) || !payload.pagination) throw new Error('Invalid asset list response')
    return { assets: payload.data, pagination: payload.pagination }
  } catch (cause) {
    throw new BackendRequestError(message, 502, cause)
  }
}

export async function readAssetCatalogs(user: BackendIdentity): Promise<AssetCatalogsDTO> {
  const response = await backendUserFetch('/api/assets/catalogs', user)
  return readBackendData<AssetCatalogsDTO>(response, 'Не удалось загрузить справочники имущества')
}

export async function readAssetById(user: BackendIdentity, id: string): Promise<AssetDetailSsrDTO | null> {
  const response = await backendUserFetch(`/api/assets/${encodeURIComponent(id)}`, user)
  if (response.status === 404) return null
  if (response.status === 403) {
    const payload = await response.clone().json().catch(() => null) as { error?: { code?: unknown } } | null
    if (payload?.error?.code === 'FORBIDDEN') return null
  }
  return readBackendData<AssetDetailSsrDTO>(response, 'Не удалось загрузить объект имущества')
}

export async function readAssetSavedViews(user: BackendIdentity): Promise<AssetSavedViewSummary[]> {
  const response = await backendUserFetch('/api/assets/saved-views', user)
  return readBackendData<AssetSavedViewSummary[]>(response, 'Не удалось загрузить сохранённые представления')
}

export async function readAssetInventoryAct(
  user: BackendIdentity,
  id: string,
): Promise<AssetInventoryActDTO | null> {
  const response = await backendUserFetch(`/api/assets/inventories/${encodeURIComponent(id)}/act`, user)
  if (response.status === 404) return null
  return readBackendData<AssetInventoryActDTO>(response, 'Не удалось загрузить акт инвентаризации')
}
