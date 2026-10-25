import { NextRequest, NextResponse } from 'next/server'
import { projectMemberUpdateSchema } from '@/features/projects/contracts/project-members'
import { proxyBackendRequest } from '@/lib/backend/transport'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { validateRequest } from '@/lib/http/validate-request'
import { authorizeApiRequest } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string; memberId: string }> }
) {
  const auth = await authorizeApiRequest(request, 'projectMembers.update')
  if (auth.response) return auth.response

  const params = await props.params;
  if (!auth.access.allows('projectMembers.update', { projectId: params.id })) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  }
  const data = await request.clone().json()
  const validation = validateRequest(projectMemberUpdateSchema, data)

  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    )
  }

  try {
    return await proxyBackendRequest(request, `/api/projects/${encodeURIComponent(params.id)}/members/${encodeURIComponent(params.memberId)}`, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
