import EditProjectPage from '@/features/projects/ui/edit-project-page'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <EditProjectPage params={params} />
}
