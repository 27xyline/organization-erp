import { NextRequest, NextResponse } from 'next/server'
import { projectMemberCreateSchema } from '@/lib/schemas/project-members'
import {
  getProjectMemberErrorMeta,
  ProjectMemberService,
} from '@/lib/services/project-member.service'
import { validateRequest } from '@/lib/validations'
import { authorizeApiRequest } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response

  const params = await props.params;
  try {
    const result = await ProjectMemberService.getMembers(params.id)
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
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response

  const params = await props.params;
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
