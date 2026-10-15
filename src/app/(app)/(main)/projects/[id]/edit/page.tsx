import { notFound } from 'next/navigation'
import EditProjectPage from '@/features/projects/ui/edit-project-page'
import { requirePagePermission } from '@/lib/auth/authorization'
import { backendUserFetch } from '@/lib/backend/bridge'
import { BackendRequestError } from '@/lib/backend/client'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id
  const user = await requirePagePermission('projects.update', { projectId: id })
  try {
    const response = await backendUserFetch(`/api/projects/${encodeURIComponent(id)}`, user)
    if (response.status === 404) notFound()
    if (!response.ok) throw new BackendRequestError('Не удалось загрузить проект из backend', response.status)
  } catch (error) {
    if (error instanceof BackendRequestError && error.status === 404) notFound()
    throw new Error('Не удалось загрузить проект из backend', { cause: error })
  }
  return <EditProjectPage params={params} />
}
