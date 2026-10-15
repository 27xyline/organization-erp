import { NextRequest, NextResponse } from 'next/server'
import { projectMemberCreateSchema } from '@/features/projects/contracts/project-members'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
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
    return await proxyBackendRequest(request, `/api/projects/${encodeURIComponent(params.id)}/members`, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'projectMembers.create')
  if (auth.response) return auth.response

  const params = await props.params;
  if (!auth.access.allows('projectMembers.create', { projectId: params.id })) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  }
  const data = await request.clone().json()
  const validation = validateRequest(projectMemberCreateSchema, data)

  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    )
  }

  try {
    return await proxyBackendRequest(request, `/api/projects/${encodeURIComponent(params.id)}/members`, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
