"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { 
  Briefcase, 
  DollarSign, 
  Users, 
  Package,
  ChevronRight,
  ChevronDown,
  Building2,
  Receipt,
  Calculator,
  ShoppingCart,
  ArrowLeftRight,
  LayoutGrid,
  Wallet,
  BarChart3,
  Archive,
  UserCog,
  Tag,
  LogOut,
  KeyRound,
  ShieldCheck,
} from "lucide-react"

interface Project {
  id: string
  code: string
  name: string
  status: string
}

interface MenuItem {
  id: string
  label: string
  icon: React.ReactNode
  href?: string
  children?: { id: string; label: string; icon: React.ReactNode; href: string }[]
}

const staticMenuItems: Omit<MenuItem, 'children'>[] = [
  {
    id: "projects",
    label: "Проекты",
    icon: <Briefcase className="h-5 w-5" />,
  },
  {
    id: "finance",
    label: "Финансы",
    icon: <DollarSign className="h-5 w-5" />,
  },
  {
    id: "employees",
    label: "Сотрудники",
    icon: <Users className="h-5 w-5" />,
  },
  {
    id: "assets",
    label: "Имущество",
    icon: <Package className="h-5 w-5" />,
  },
]

const financeChildren = [
  { id: "salary", label: "Заработная плата", icon: <Wallet className="h-4 w-4" />, href: "/finance/salary" },
  { id: "oklad", label: "Оклад", icon: <Calculator className="h-4 w-4" />, href: "/finance/oklad" },
  { id: "nadbavka", label: "Надбавка", icon: <BarChart3 className="h-4 w-4" />, href: "/finance/nadbavka" },
  { id: "cash", label: "Касса (скоро)", icon: <Receipt className="h-4 w-4" />, href: "" },
]

const employeesChildren = [
  { id: "employees-list", label: "Сотрудники", icon: <Users className="h-4 w-4" />, href: "/employees" },
  { id: "employees-archive", label: "Архив", icon: <Archive className="h-4 w-4" />, href: "/employees/archive" },
  { id: "mols", label: "МОЛ", icon: <UserCog className="h-4 w-4" />, href: "/mols" },
]

const assetsChildren = [
  { id: "assets-groups", label: "Группы имущества", icon: <Tag className="h-4 w-4" />, href: "/groups" },
  { id: "assets-registered", label: "Зарегистрировано", icon: <LayoutGrid className="h-4 w-4" />, href: "/" },
  { id: "assets-purchase", label: "Закупки (скоро)", icon: <ShoppingCart className="h-4 w-4" />, href: "" },
  { id: "assets-transfer", label: "Перемещение (скоро)", icon: <ArrowLeftRight className="h-4 w-4" />, href: "" },
  { id: "assets-archive", label: "Архив", icon: <Archive className="h-4 w-4" />, href: "/archive" },
]

export function FinderSidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const hasFetchedProjectsRef = useRef(false)
  const isProjectsExpanded = expandedItems.includes("projects")

  useEffect(() => {
    if (!isProjectsExpanded || hasFetchedProjectsRef.current) return

    let isMounted = true
    hasFetchedProjectsRef.current = true

    async function fetchProjects() {
      try {
        const response = await fetch('/api/projects')
        if (response.ok && isMounted) {
          const data = await response.json()
          setProjects((data.data || []).slice(0, 5)) // Show only first 5 projects
        }
      } catch (error) {
        console.error('Error fetching projects:', error)
      }
    }

    fetchProjects()

    return () => {
      isMounted = false
    }
  }, [isProjectsExpanded])

  useEffect(() => {
    if (pathname === '/login') {
      setExpandedItems([])
      return
    }

    const itemsToExpand: string[] = []

    if (pathname.startsWith('/projects')) itemsToExpand.push('projects')
    if (pathname.startsWith('/finance')) itemsToExpand.push('finance')
    if (pathname.startsWith('/employees') || pathname.startsWith('/mols')) itemsToExpand.push('employees')
    if (pathname === '/' || pathname.startsWith('/groups') || pathname.startsWith('/archive')) itemsToExpand.push('assets')

    if (itemsToExpand.length === 0) return

    setExpandedItems((prev) => Array.from(new Set([...prev, ...itemsToExpand])))
  }, [pathname])

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => 
      prev.includes(id) 
        ? prev.filter(item => item !== id)
        : [...prev, id]
    )
  }

  const isActive = (href?: string) => {
    if (!href) return false
    return pathname === href || pathname.startsWith(href + '/')
  }

  const isChildLinkActive = (href: string) => pathname === href

  const projectChildren = [
    { id: "projects-list", label: "Все проекты", icon: <Building2 className="h-4 w-4" />, href: "/projects" },
    ...projects.map(p => ({
      id: `project-${p.id}`,
      label: p.name,
      icon: <Building2 className="h-4 w-4" />,
      href: `/projects/${p.id}`
    }))
  ]

  const getMenuChildren = (id: string) => {
    switch (id) {
      case 'projects': return projectChildren
      case 'finance': return financeChildren
      case 'employees': return employeesChildren
      case 'assets': return assetsChildren
      default: return []
    }
  }

  const renderMenuItem = (item: typeof staticMenuItems[0], level: number = 0) => {
    const isExpanded = expandedItems.includes(item.id)
    const children = getMenuChildren(item.id)
    const hasChildren = children.length > 0
    const isItemActive = item.id === 'projects' ? isActive('/projects') : item.id === 'employees' ? isActive('/employees') || isActive('/mols') : false
    const isChildActive = children.some(child => isActive(child.href))
    const shouldHighlightParent = isItemActive && !isChildActive

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (hasChildren) {
              toggleExpand(item.id)
            }
          }}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            shouldHighlightParent && "bg-accent text-accent-foreground font-medium",
            level > 0 && "pl-8"
          )}
        >
          {hasChildren && (
            <span className="flex-shrink-0">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
          )}
          {!hasChildren && <span className="w-4" />}
          <span className="flex-shrink-0">{item.icon}</span>
          <span className="truncate">{item.label}</span>
        </button>
        
        {hasChildren && isExpanded && (
          <div className="mt-1">
            {children.map(child => (
              child.href ? (
              <Link
                key={child.id}
                href={child.href}
                prefetch={false}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors",
                  "hover:bg-accent hover:text-accent-foreground pl-10",
                  isChildLinkActive(child.href) && "bg-accent text-accent-foreground font-medium"
                )}
              >
                <span className="flex-shrink-0">{child.icon}</span>
                <span className="truncate">{child.label}</span>
              </Link>
              ) : (
              <span
                key={child.id}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg pl-10 opacity-40 cursor-not-allowed select-none"
              >
                <span className="flex-shrink-0">{child.icon}</span>
                <span className="truncate">{child.label}</span>
              </span>
              )
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="hidden w-72 h-full bg-muted/30 border-r md:flex flex-col">
      <div className="p-4 border-b">
        <h1 className="text-lg font-semibold">Consilium</h1>
        <p className="text-xs text-muted-foreground">Управление активами</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {staticMenuItems.map(item => renderMenuItem(item))}
      </div>
      
      {session?.user && (
        <div className="p-4 border-t flex flex-col gap-3">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium shrink-0">
              {session.user.name?.charAt(0) || 'U'}
            </div>
            <div className="flex flex-col truncate">
              <span className="text-sm font-medium leading-none truncate">
                {session.user.name}
              </span>
              <span className="text-xs text-muted-foreground mt-1 truncate">
                Доступ: {session.user.role === 'ADMIN' ? 'Администратор' : session.user.role === 'EDITOR' ? 'Редактор' : 'Чтение'}
              </span>
            </div>
          </div>
          <div className="grid gap-1">
            <Link href="/account/password" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent">
              <KeyRound className="h-4 w-4" />
              Изменить пароль
            </Link>
            {session.user.role === 'ADMIN' && (
              <Link href="/admin/users" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent">
                <ShieldCheck className="h-4 w-4" />
                Пользователи
              </Link>
            )}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </button>
        </div>
      )}
    </div>
  )
}
