import { notFound } from 'next/navigation'
import { AssetForm } from '@/features/assets/ui/asset-form'
import { OperationsHistory } from '@/features/assets/ui/operations-history'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AssetService } from '@/features/assets/application/asset.service'
import { requirePagePermission } from '@/lib/auth/authorization'
import { assetTarget } from '@/lib/auth/resource-scopes'
import { backendUserFetch } from '@/lib/backend/bridge'
import { readBackendData } from '@/lib/backend/page-data'

interface EditAssetPageProps {
  params: Promise<{ id: string }>
}

export default async function EditAssetPage(props: EditAssetPageProps) {
  const params = await props.params
  const target = await assetTarget(params.id)
  if (!target) notFound()
  const user = await requirePagePermission('assets.update', {
    departmentIds: target.departmentIds,
  })
  const [asset, { mols, groups }, projectResponse] = await Promise.all([
    AssetService.get(params.id, user.access),
    AssetService.listCatalogs(user.access),
    backendUserFetch('/api/projects/references?page=1&pageSize=100&status=ACTIVE', user),
  ])
  const projects = await readBackendData<Array<{ id: string; code: string; name: string }>>(
    projectResponse,
    'Не удалось загрузить проекты из backend',
  )

  if (!asset) {
    notFound()
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Редактирование объекта</h1>
        
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Форма редактирования */}
          <div>
            <AssetForm mols={mols} groups={groups} projects={projects} initialData={asset} />
          </div>
          
          {/* История операций */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>История операций</CardTitle>
              </CardHeader>
              <CardContent>
                <OperationsHistory operations={asset.operations} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
