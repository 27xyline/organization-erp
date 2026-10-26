'use client'

import type { Operation } from '@/features/assets/contracts/types'

import { OperationsHistory } from './operations-history'

interface AssetOperationsHistoryProps {
  operations: Operation[]
}

export function AssetOperationsHistory({ operations }: AssetOperationsHistoryProps) {
  return <OperationsHistory operations={operations} />
}
