import { FinderSidebar } from "@/components/finder-sidebar"
import { MobileNavigation } from "@/components/mobile-navigation"
import type { AppRole, Permission } from "@/lib/auth/permissions"

interface AppLayoutProps {
  children: React.ReactNode
  currentUser: {
    name: string
    roles: AppRole[]
    permissions: Permission[]
  }
}

export function AppLayout({ children, currentUser }: AppLayoutProps) {
  return (
    <div className="relative flex h-dvh overflow-hidden bg-background">
      <MobileNavigation currentUser={currentUser} />
      <FinderSidebar currentUser={currentUser} />
      <main className="min-w-0 flex-1 overflow-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
