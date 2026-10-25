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

  const loadMembers = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/projects/${projectId}/members`, { cache: 'no-store' })
      const body = await response.json().catch(() => ({ error: 'Не удалось загрузить состав проекта' }))

      if (!response.ok) {
        throw new Error(body.error || 'Не удалось загрузить состав проекта')
      }

      const data = body as MembersResponse
      setMembers(data.members)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить состав проекта')
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  return {
    members,
    loading,
    error,
    refresh: loadMembers,
  }
}
