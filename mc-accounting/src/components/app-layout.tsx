"use client"

import { FinderSidebar } from "@/components/finder-sidebar"

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="h-screen flex overflow-hidden bg-background">
      <FinderSidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}