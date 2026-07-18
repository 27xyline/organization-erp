import { NextRequest, NextResponse } from 'next/server'
import { projectMemberCreateSchema } from '@/features/projects/contracts/project-members'
import {
  getProjectMemberErrorMeta,
  ProjectMemberService,
} from '@/features/projects/application/project-member.service'
import { validateRequest } from '@/lib/http/validate-request'
import { authorizeApiRequest } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'projectMembers.read')
  if (auth.response) return auth.response

  const params = await props.params;
  if (!auth.access.allows('projectMembers.read', { projectId: params.id })) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  }
  try {
    const result = await ProjectMemberService.getMembers(
      params.id,
      auth.access.allows('projectPayroll.read', { projectId: params.id }),
    )
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching project members:', error)

    const routeError = getProjectMemberErrorMeta(error)

    if (routeError) {
      return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
    }

    return NextResponse.json(
      { error: 'Не удалось загрузить состав проекта' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'projectMembers.create')
  if (auth.response) return auth.response

  const params = await props.params;
  if (!auth.access.allows('projectMembers.create', { projectId: params.id })) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  }
  try {
    const data = await request.json()
    const validation = validateRequest(projectMemberCreateSchema, data)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const member = await ProjectMemberService.addMember(params.id, validation.data.employeeId)
    return NextResponse.json({ success: true, member })
  } catch (error) {
    console.error('Error adding project member:', error)

    const routeError = getProjectMemberErrorMeta(error)

    if (routeError) {
      return NextResponse.json(
        { error: routeError.error },
        { status: routeError.status }
      )
    }

    return NextResponse.json(
      { error: 'Не удалось добавить сотрудника в проект' },
      { status: 500 }
    )
  }
}
