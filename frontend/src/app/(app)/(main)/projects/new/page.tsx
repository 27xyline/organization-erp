import NewProjectPage from '@/features/projects/ui/new-project-page'
import { requirePagePermission } from '@/lib/auth/authorization'

export default async function Page() {
  await requirePagePermission('projects.create')
  return <NewProjectPage />
}
