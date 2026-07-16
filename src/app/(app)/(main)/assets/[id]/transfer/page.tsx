import AssetTransferPage from '@/features/assets/ui/asset-transfer-page'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <AssetTransferPage params={params} />
}
