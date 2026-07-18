import { CatalogService } from '@/features/assets/application/catalog.service'
import { requirePageUser } from '@/lib/auth/authorization'
import { MolsClient } from '@/features/assets/ui/mols-client'
import { DepartmentService } from '@/features/departments/application/department.service'

export default async function MolsPage() {
  const [user, mols, departments] = await Promise.all([
    requirePageUser(),
    CatalogService.listMols(),
    DepartmentService.list(),
  ])
  return (
    <MolsClient
      initialMols={mols}
      departments={departments}
      canEdit={user.role !== 'VIEWER'}
    />
  )
}
