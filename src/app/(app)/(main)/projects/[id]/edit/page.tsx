import { notFound } from 'next/navigation'
import EditProjectPage from '@/features/projects/ui/edit-project-page'
import { requirePagePermission } from '@/lib/auth/authorization'
import { getDb } from '@/lib/prisma'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id
  const exists = await getDb().project.findUnique({ where: { id }, select: { id: true } })
  if (!exists) notFound()
  await requirePagePermission('projects.update', { projectId: id })
  return <EditProjectPage params={params} />
}
