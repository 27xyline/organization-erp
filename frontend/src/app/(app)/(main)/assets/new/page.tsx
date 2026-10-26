import { AssetForm } from '@/features/assets/ui/asset-form'
import { requirePagePermission } from '@/lib/auth/authorization'
import { backendUserFetch } from '@/lib/backend/transport'
import { readBackendData } from '@/lib/backend/page-data'
import { readAssetCatalogs } from '@/features/assets/infrastructure/backend-ssr'

export const dynamic = 'force-dynamic'

export default async function NewAssetPage() {
  const user = await requirePagePermission('assets.create')
  const [{ mols, groups }, projectResponse] = await Promise.all([
    readAssetCatalogs(user),
    backendUserFetch('/api/projects/references?page=1&pageSize=100&status=ACTIVE', user),
  ])
  const projects = await readBackendData<Array<{ id: string; code: string; name: string }>>(
    projectResponse,
    'Не удалось загрузить проекты из backend',
  )

  return (
    <main className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Добавление нового объекта</h1>
      <AssetForm mols={mols} groups={groups} projects={projects} />
    </main>
  )
}
