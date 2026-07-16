import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { AssetForm } from '@/components/asset-form'
import { OperationsHistory } from '@/components/operations-history'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface EditAssetPageProps {
  params: { id: string }
}

export default async function EditAssetPage({ params }: EditAssetPageProps) {
  const [asset, mols, groups, projects] = await Promise.all([
    prisma.asset.findUnique({
      where: { id: params.id },
      include: {
        operations: {
          include: {
            fromMol: true,
            toMol: true,
          },
          orderBy: { date: 'desc' },
        },
      },
    }),
    prisma.mol.findMany({ orderBy: { code: 'asc' } }),
    prisma.assetGroup.findMany({ orderBy: { code: 'asc' } }),
    prisma.project.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
    }),
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