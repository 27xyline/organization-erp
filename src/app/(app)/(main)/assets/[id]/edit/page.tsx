import { notFound } from 'next/navigation'
import { AssetForm } from '@/components/asset-form'
import { OperationsHistory } from '@/components/operations-history'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AssetService } from '@/features/assets/application/asset.service'
import { ProjectService } from '@/features/projects/project.service'
import { requirePageUser } from '@/lib/auth/authorization'

interface EditAssetPageProps {
  params: Promise<{ id: string }>
}

export default async function EditAssetPage(props: EditAssetPageProps) {
  await requirePageUser(['ADMIN', 'EDITOR'])
  const params = await props.params
  const [asset, { mols, groups }, { projects }] = await Promise.all([
    AssetService.get(params.id),
    AssetService.listCatalogs(),
    ProjectService.list({ page: 1, pageSize: 100, status: 'ACTIVE' }),
  ])

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
