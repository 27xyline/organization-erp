'use client'

import { OperationsHistory } from '@/features/assets/ui/operations-history'

interface AssetOperationsHistoryProps {
  operations: any[]
}

export function AssetOperationsHistory({ operations }: AssetOperationsHistoryProps) {
  return <OperationsHistory operations={operations} />
}
