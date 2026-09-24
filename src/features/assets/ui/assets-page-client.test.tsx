import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetsPageClient } from './assets-page-client'

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => '/assets',
  useSearchParams: () => new URLSearchParams(),
}))

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

let root: Root
let host: HTMLDivElement

describe('AssetsPageClient responsive filters', () => {
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('opens filter controls in a mobile dialog', async () => {
    await act(async () => root.render(
      <AssetsPageClient
        assets={[]}
        mols={[]}
        groups={[]}
        pagination={{ page: 1, pageSize: 50, total: 0, totalPages: 1 }}
        filters={{}}
        savedViews={[]}
        canEdit={false}
        canImport={false}
      />,
    ))

    const trigger = host.querySelector<HTMLButtonElement>('[data-testid="mobile-asset-filters-trigger"]')
    expect(trigger).not.toBeNull()
    await act(async () => trigger?.click())

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.className).toContain('right-0')
    expect(dialog?.className).toContain('h-dvh')
    expect(dialog).toHaveTextContent('Фильтры имущества')
    expect(dialog?.querySelector('[aria-label="Поступление с"]')).not.toBeNull()
    expect(dialog?.querySelector('[aria-label="Поступление по"]')).not.toBeNull()
  })
})
