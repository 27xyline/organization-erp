'use client'

import { useRouter } from 'next/navigation'
import type { DocumentView } from '@/features/documents/contracts/ui-types'
import { DocumentUploadDialog } from '@/features/documents/ui/document-upload-dialog'
import { ProjectWorkspace } from '@/features/projects/ui/project-workspace'

interface ProjectActivity {
  id: string
  action: string
  entityType: string
  entityId: string
  createdAt: string
  user: { id: string; name: string; username: string } | null
}

export function ProjectWorkspaceSection({
  project,
  documents,
  activities,
  canCreateDocuments,
}: {
  project: { id: string; code: string; name: string }
  documents: DocumentView[]
  activities: ProjectActivity[]
  canCreateDocuments: boolean
}) {
  const router = useRouter()
  return (
    <ProjectWorkspace
      project={project}
      documents={documents}
      activities={activities}
      uploadAction={canCreateDocuments ? (
        <DocumentUploadDialog fixedProject={project} onUploaded={() => router.refresh()} />
      ) : undefined}
    />
  )
}
