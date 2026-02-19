import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { AssetForm } from '@/components/asset-form'

export default async function NewAssetPage() {
  const mols = await prisma.mol.findMany({
    orderBy: { code: 'asc' },
  })
  
  const groups = await prisma.assetGroup.findMany({
    orderBy: { code: 'asc' },
  })

  const projects = await prisma.project.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true },
  })

  return (
    <main className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Добавление нового объекта</h1>
      <AssetForm mols={mols} groups={groups} projects={projects} />
    </main>
  )
}