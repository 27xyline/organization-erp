import { AppLayout } from '@/components/app-layout'
import { requirePageUser } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser()
  return (
    <AppLayout currentUser={{
      name: user.name,
      roles: user.roles,
      permissions: user.permissions,
      accessKey: JSON.stringify({
        grants: user.access.grants
          .map((grant) => ({
            id: grant.assignmentId,
            departmentMode: grant.departmentScopeMode,
            projectMode: grant.projectScopeMode,
            departments: [...grant.departmentIds].sort(),
            projects: [...grant.projectIds].sort(),
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
        memberProjects: [...user.access.identity.memberProjectIds].sort(),
      }),
    }}>
      {children}
    </AppLayout>
  )
}
