import { CatalogService } from '@/features/assets/application/catalog.service'
import { requirePagePermission } from '@/lib/auth/authorization'
import { MolsClient } from '@/features/assets/ui/mols-client'
import { DepartmentService } from '@/features/departments/application/department.service'

export default async function MolsPage() {
  const user = await requirePagePermission('mols.read')
  const [mols, departments] = await Promise.all([
    CatalogService.listMols(user.access),
    DepartmentService.list({ activeOnly: true }),
  ])
  const allowedDepartmentIds = user.access.allowedDepartmentIds('mols.read')
  const visibleDepartments = allowedDepartmentIds === null
    ? departments
    : departments.filter((department) => allowedDepartmentIds.includes(department.id))
  const canEdit = user.access.has('mols.create') &&
    user.access.has('mols.update') &&
    user.access.has('mols.delete')

  return (
    <MolsClient
      initialMols={mols}
      departments={visibleDepartments}
      canEdit={canEdit}
    />
  )
}
