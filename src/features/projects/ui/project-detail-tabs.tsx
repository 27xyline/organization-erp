'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface ProjectDetailTab {
  id: string
  label: string
  content: ReactNode
}

export function ProjectDetailTabs({ tabs }: { tabs: ProjectDetailTab[] }) {
  if (tabs.length === 0) return null

  return (
    <Tabs defaultValue={tabs[0].id} className="min-w-0">
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
