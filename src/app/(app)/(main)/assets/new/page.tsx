import { AssetForm } from '@/components/asset-form'
import { AssetService } from '@/features/assets/asset.service'
import { ProjectService } from '@/features/projects/project.service'
import { requirePageUser } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export default async function NewAssetPage() {
  await requirePageUser(['ADMIN', 'EDITOR'])
  const [{ mols, groups }, { projects }] = await Promise.all([
    AssetService.listCatalogs(),
    ProjectService.list({ page: 1, pageSize: 100, status: 'ACTIVE' }),
  ])

  return (
    <main className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Добавление нового объекта</h1>
      <AssetForm mols={mols} groups={groups} projects={projects} />
    </main>
  )
}
