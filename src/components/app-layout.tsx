import { FinderSidebar } from "@/components/finder-sidebar"
import { MobileNavigation } from "@/components/mobile-navigation"

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="relative flex h-dvh overflow-hidden bg-background">
      <MobileNavigation />
      <FinderSidebar />
      <main className="min-w-0 flex-1 overflow-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
