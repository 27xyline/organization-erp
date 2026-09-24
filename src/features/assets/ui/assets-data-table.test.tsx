import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Asset } from '@/features/assets/contracts/types'
import { AssetsDataTable } from './assets-data-table'

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

const asset = {
  id: 'asset-1',
  orderNumber: 12,
  name: 'Ноутбук для переговорной',
  inventoryNumber: 'INV-2026-012',
  quantity: 2,
  unitOfMeasure: 'шт.',
  totalCost: 185_000,
  unitPrice: 92_500,
  groupId: 'group-1',
  group: { id: 'group-1', code: 'ОФИС', name: 'Офисная техника' },
  molId: 'mol-1',
  mol: { id: 'mol-1', fullName: 'Анна Смирнова' },
  holdings: [],
  accountingForm: '145',
  documentFiles: [],
  status: 'IN_USE',
} as unknown as Asset

let root: Root
let host: HTMLDivElement

describe('AssetsDataTable mobile layout', () => {
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('shows a compact asset card with key details and a view link', async () => {
    await act(async () => root.render(
      <AssetsDataTable assets={[asset]} totalCount={1} filteredCount={1} canEdit={false} />,
    ))

    const mobileList = host.querySelector('[data-testid="assets-mobile-list"]')
    expect(mobileList).not.toBeNull()
    expect(mobileList?.className).toContain('lg:hidden')
    expect(mobileList).toHaveTextContent('Ноутбук для переговорной')
    expect(mobileList).toHaveTextContent('INV-2026-012')
    expect(mobileList).toHaveTextContent(/185\s*000/)
    expect(mobileList).toHaveTextContent('В эксплуатации')
    expect(mobileList?.querySelector('a[href="/assets/asset-1"]')).not.toBeNull()
    expect(mobileList?.querySelector('a[href="/assets/asset-1/edit"]')).toBeNull()
  })

  it('keeps the accounting details available on mobile', async () => {
    const detailedAsset = {
      ...asset,
      notes: 'Для кабинета переговоров',
      accountingForm: '367',
      holdings: [
        { id: 'holding-1', mol: { id: 'mol-1', fullName: 'Анна Смирнова' }, quantity: '1.5' },
        { id: 'holding-2', mol: { id: 'mol-2', fullName: 'Иван Петров' }, quantity: '0.5' },
      ],
    } as unknown as Asset

    await act(async () => root.render(
      <AssetsDataTable assets={[detailedAsset]} totalCount={1} filteredCount={1} />,
    ))

    const mobileList = host.querySelector('[data-testid="assets-mobile-list"]')
    expect(mobileList).toHaveTextContent('Для кабинета переговоров')
    expect(mobileList).toHaveTextContent('ОФИС')
    expect(mobileList).toHaveTextContent('Форма учета')
    expect(mobileList).toHaveTextContent('367')
    expect(mobileList).toHaveTextContent('Анна Смирнова')
    expect(mobileList).toHaveTextContent('1,5')
    expect(mobileList).toHaveTextContent('Иван Петров')
    expect(mobileList).toHaveTextContent('0,5')
  })

  it('shows edit and transfer actions to users with edit access', async () => {
    await act(async () => root.render(
      <AssetsDataTable assets={[asset]} totalCount={1} filteredCount={1} canEdit />,
    ))

    const mobileList = host.querySelector('[data-testid="assets-mobile-list"]')
    expect(mobileList?.querySelector('a[href="/assets/asset-1/edit"]')).not.toBeNull()
    expect(mobileList?.querySelector('a[href="/assets/asset-1/transfer"]')).not.toBeNull()
    expect(mobileList?.querySelector('button[aria-label="В архив: Ноутбук для переговорной"]')).not.toBeNull()
  })
})
