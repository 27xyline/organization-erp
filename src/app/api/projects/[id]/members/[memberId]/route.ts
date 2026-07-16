import { NextRequest, NextResponse } from 'next/server'
import { projectMemberUpdateSchema } from '@/features/projects/contracts/project-members'
import {
  getProjectMemberErrorMeta,
  ProjectMemberService,
} from '@/lib/services/project-member.service'
import { validateRequest } from '@/lib/http/validate-request'
import { authorizeApiRequest } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string; memberId: string }> }
) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response

  const params = await props.params;
  try {
    const data = await request.json()
    const validation = validateRequest(projectMemberUpdateSchema, data)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const member = await ProjectMemberService.updateMember(
      params.id,
      params.memberId,
      validation.data.isArchived
    )

    return NextResponse.json({
      success: true,
      member,
    })
  } catch (error) {
    console.error('Error updating project member:', error)

    const routeError = getProjectMemberErrorMeta(error)

    if (routeError) {
      return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
    }

    return NextResponse.json(
      { error: 'Не удалось обновить участника проекта' },
      { status: 500 }
    )
  }
}
