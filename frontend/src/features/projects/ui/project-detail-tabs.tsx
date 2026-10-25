'use client'

import type { ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface ProjectDetailTab {
  id: string
  label: string
  content: ReactNode
}

export function ProjectDetailTabs({ tabs }: { tabs: ProjectDetailTab[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  if (tabs.length === 0) return null

  const selected = tabs.some((tab) => tab.id === searchParams.get('tab'))
    ? searchParams.get('tab')!
    : tabs[0].id

  function onTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  return (
    <Tabs value={selected} onValueChange={onTabChange} className="min-w-0">
      <TabsList aria-label="Разделы проекта" className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-0">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="shrink-0 rounded-none border-b-2 border-transparent px-3 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="mt-6 min-w-0 focus-visible:outline-none">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
