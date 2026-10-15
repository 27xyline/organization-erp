import { AssetForm } from '@/features/assets/ui/asset-form'
import { AssetService } from '@/features/assets/application/asset.service'
import { requirePagePermission } from '@/lib/auth/authorization'
import { backendUserFetch } from '@/lib/backend/bridge'
import { readBackendData } from '@/lib/backend/page-data'

export const dynamic = 'force-dynamic'

export default async function NewAssetPage() {
  const user = await requirePagePermission('assets.create')
  const [{ mols, groups }, projectResponse] = await Promise.all([
    AssetService.listCatalogs(user.access),
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
