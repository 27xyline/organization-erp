'use client'

import { useCallback, useEffect, useState } from 'react'
import { ProjectMemberRow } from '@/features/projects/contracts/ui-types'

interface MembersResponse {
  members: ProjectMemberRow[]
}

export function useProjectTaskMembers(projectId: string) {
  const [members, setMembers] = useState<ProjectMemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadMembers = useCallback(() => fetch(`/api/projects/${projectId}/members`, { cache: 'no-store' })
    .then(async (response) => {
      const body = await response.json().catch(() => ({ error: 'Не удалось загрузить состав проекта' }))
      if (!response.ok) throw new Error(body.error || 'Не удалось загрузить состав проекта')
      const data = body as MembersResponse
      setError(null)
      setMembers(data.members)
    })
    .catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить состав проекта')
      setMembers([])
    })
    .finally(() => setLoading(false)), [projectId])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  return {
    members,
    loading,
    error,
    refresh: async () => {
      setLoading(true)
      setError(null)
      await loadMembers()
    },
  }
}
