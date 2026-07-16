import { CatalogService } from '@/features/assets/application/catalog.service'
import { requirePageUser } from '@/lib/auth/authorization'
import { MolsClient } from './mols-client'

export default async function MolsPage() {
  const [user, mols] = await Promise.all([requirePageUser(), CatalogService.listMols()])
  return <MolsClient initialMols={mols} canEdit={user.role !== 'VIEWER'} />
}
