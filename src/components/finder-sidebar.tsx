"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
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
  Network,
  Files,
  ClipboardCheck,
  CalendarClock,
} from "lucide-react"
import { ROLE_LABELS, type AppRole, type Permission } from "@/lib/auth/permissions"
import { NotificationBell } from "@/features/notifications/ui/notification-bell"

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
  {
    id: "documents",
    label: "Документы",
    icon: <Files className="h-5 w-5" />,
  },
  {
    id: "approvals",
    label: "Согласования",
    icon: <ClipboardCheck className="h-5 w-5" />,
  },
  {
    id: "timekeeping",
    label: "Табель",
    icon: <CalendarClock className="h-5 w-5" />,
  },
]

const financeChildren = [
  { id: "payroll", label: "Расчёт зарплаты", icon: <Receipt className="h-4 w-4" />, href: "/finance/payroll" },
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

export function FinderSidebar({ currentUser }: {
  currentUser: {
    name: string
    roles: AppRole[]
    permissions: Permission[]
    accessKey: string
  }
}) {
  const pathname = usePathname()
  const permissionSet = useMemo(() => new Set(currentUser.permissions), [currentUser.permissions])
  const [expandedItems, setExpandedItems] = useState<string[]>(() => {
    if (pathname === '/login') return []
    const itemsToExpand: string[] = []
    if (pathname.startsWith('/projects')) itemsToExpand.push('projects')
    if (pathname.startsWith('/finance')) itemsToExpand.push('finance')
    if (pathname.startsWith('/employees') || pathname.startsWith('/mols')) itemsToExpand.push('employees')
    if (pathname === '/' || pathname.startsWith('/groups') || pathname.startsWith('/archive')) itemsToExpand.push('assets')
    if (pathname.startsWith('/documents')) itemsToExpand.push('documents')
    return itemsToExpand
  })
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    if (pathname === '/login') {
      setExpandedItems([])
    } else {
      const itemsToExpand: string[] = []
      if (pathname.startsWith('/projects')) itemsToExpand.push('projects')
      if (pathname.startsWith('/finance')) itemsToExpand.push('finance')
      if (pathname.startsWith('/employees') || pathname.startsWith('/mols')) itemsToExpand.push('employees')
      if (pathname === '/' || pathname.startsWith('/groups') || pathname.startsWith('/archive')) itemsToExpand.push('assets')
      if (pathname.startsWith('/documents')) itemsToExpand.push('documents')
      
      const newItems = itemsToExpand.filter(item => !expandedItems.includes(item))
      if (newItems.length > 0) {
        setExpandedItems(prev => Array.from(new Set([...prev, ...newItems])))
      }
    }
  }
  const [projectResult, setProjectResult] = useState<{
    accessKey: string | null
    projects: Project[]
  }>({ accessKey: null, projects: [] })
  const fetchedProjectAccessRef = useRef<string | null>(null)
  const isProjectsExpanded = expandedItems.includes("projects")

  useEffect(() => {
    if (!permissionSet.has('projects.read') || !isProjectsExpanded) {
      fetchedProjectAccessRef.current = null
      return
    }
    if (fetchedProjectAccessRef.current === currentUser.accessKey) return

    let isMounted = true
    fetchedProjectAccessRef.current = currentUser.accessKey

    async function fetchProjects() {
      try {
        const response = await fetch('/api/projects')
        if (response.ok && isMounted) {
          const data = await response.json()
          setProjectResult({
            accessKey: currentUser.accessKey,
            projects: (data.data || []).slice(0, 5),
          })
        }
      } catch (error) {
        console.error('Error fetching projects:', error)
      }
    }

    fetchProjects()

    return () => {
      isMounted = false
    }
  }, [currentUser.accessKey, isProjectsExpanded, permissionSet])



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
    ...(projectResult.accessKey === currentUser.accessKey ? projectResult.projects : []).map(p => ({
      id: `project-${p.id}`,
      label: p.name,
      icon: <Building2 className="h-4 w-4" />,
      href: `/projects/${p.id}`
    }))
  ]

  const getMenuChildren = (id: string) => {
    switch (id) {
      case 'projects':
        return permissionSet.has('projects.read') ? projectChildren : []
      case 'finance':
        return financeChildren.filter((child) =>
          child.id === 'payroll'
            ? permissionSet.has('payroll.read')
            : child.id === 'salary'
            ? permissionSet.has('finance.salary.read')
            : child.id === 'oklad' || child.id === 'nadbavka'
              ? permissionSet.has('financePlans.read')
              : false
        )
      case 'employees':
        return employeesChildren.filter((child) =>
          child.id === 'mols'
            ? permissionSet.has('mols.read')
            : permissionSet.has('employees.read')
        )
      case 'assets':
        return assetsChildren.filter((child) =>
          child.id === 'assets-groups'
            ? permissionSet.has('assetGroups.read')
            : ['assets-registered', 'assets-archive'].includes(child.id)
              ? permissionSet.has('assets.read')
              : false
        )
      case 'documents':
        return permissionSet.has('documents.read')
          ? [{ id: 'documents-list', label: 'Все документы', icon: <Files className="h-4 w-4" />, href: '/documents' }]
          : []
      case 'approvals':
        return permissionSet.has('approvals.read')
          ? [{ id: 'approvals-list', label: 'Все согласования', icon: <ClipboardCheck className="h-4 w-4" />, href: '/approvals' }]
          : []
      case 'timekeeping':
        return permissionSet.has('timekeeping.read')
          ? [{ id: 'timekeeping-list', label: 'Рабочее время', icon: <CalendarClock className="h-4 w-4" />, href: '/timekeeping' }]
          : []
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
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h1 className="text-lg font-semibold">Consilium</h1>
          <p className="text-xs text-muted-foreground">Управление активами</p>
        </div>
        <NotificationBell />
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {staticMenuItems.filter((item) => getMenuChildren(item.id).length > 0).map(item => renderMenuItem(item))}
      </div>
      
      <div className="p-4 border-t flex flex-col gap-3">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium shrink-0">
            {currentUser.name.charAt(0) || 'U'}
          </div>
          <div className="flex flex-col truncate">
            <span className="text-sm font-medium leading-none truncate">
              {currentUser.name}
            </span>
            <span className="text-xs text-muted-foreground mt-1 truncate">
              {currentUser.roles.map((role) => ROLE_LABELS[role]).join(', ') || 'Без роли'}
            </span>
          </div>
        </div>
        <div className="grid gap-1">
          <Link href="/account/password" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent">
            <KeyRound className="h-4 w-4" />
            Изменить пароль
          </Link>
          {permissionSet.has('departments.create') && (
            <Link href="/admin/departments" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent">
              <Network className="h-4 w-4" />
              Подразделения
            </Link>
          )}
          {permissionSet.has('access.users.read') && (
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
    </div>
  )
}
