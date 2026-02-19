"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
  FileText,
  Calculator,
  ShoppingCart,
  ArrowLeftRight,
  LayoutGrid,
  Wallet,
  BarChart3,
  Archive,
  UserCog,
  Tag,
  Plus
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
  { id: "salary", label: "Заработная плата", icon: <Wallet className="h-4 w-4" />, href: "#" },
  { id: "budget-planning", label: "Планирование бюджета", icon: <Calculator className="h-4 w-4" />, href: "#" },
  { id: "reports", label: "Отчеты Аналитика", icon: <BarChart3 className="h-4 w-4" />, href: "#" },
  { id: "cash", label: "Касса", icon: <Receipt className="h-4 w-4" />, href: "#" },
]

const employeesChildren = [
  { id: "mols", label: "МОЛ", icon: <UserCog className="h-4 w-4" />, href: "/mols" },
]

const assetsChildren = [
  { id: "assets-groups", label: "Группы имущества", icon: <Tag className="h-4 w-4" />, href: "/groups" },
  { id: "assets-registered", label: "Зарегистрировано", icon: <LayoutGrid className="h-4 w-4" />, href: "/" },
  { id: "assets-purchase", label: "Закупки", icon: <ShoppingCart className="h-4 w-4" />, href: "#" },
  { id: "assets-transfer", label: "Перемещение", icon: <ArrowLeftRight className="h-4 w-4" />, href: "#" },
  { id: "assets-archive", label: "Архив", icon: <Archive className="h-4 w-4" />, href: "/archive" },
]

export function FinderSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [expandedItems, setExpandedItems] = useState<string[]>(["assets"])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchProjects() {
      try {
        const response = await fetch('/api/projects')
        if (response.ok) {
          const data = await response.json()
          setProjects(data.slice(0, 5)) // Show only first 5 projects
        }
      } catch (error) {
        console.error('Error fetching projects:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchProjects()
  }, [])

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

  const projectChildren = [
    { id: "projects-list", label: "Все проекты", icon: <Building2 className="h-4 w-4" />, href: "/projects" },
    { id: "projects-new", label: "Новый проект", icon: <Plus className="h-4 w-4" />, href: "/projects/new" },
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
    const isItemActive = item.id === 'projects' ? isActive('/projects') : false
    const isChildActive = children.some(child => isActive(child.href))

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (hasChildren) {
              toggleExpand(item.id)
            }
            if (item.id === 'projects') {
              router.push('/projects')
            }
          }}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            (isItemActive || isChildActive) && "bg-accent text-accent-foreground font-medium",
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
              <Link
                key={child.id}
                href={child.href}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors",
                  "hover:bg-accent hover:text-accent-foreground pl-10",
                  isActive(child.href) && "bg-accent text-accent-foreground font-medium"
                )}
              >
                <span className="flex-shrink-0">{child.icon}</span>
                <span className="truncate">{child.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-64 h-full bg-muted/30 border-r flex flex-col">
      <div className="p-4 border-b">
        <h1 className="text-lg font-semibold">Consilium</h1>
        <p className="text-xs text-muted-foreground">Управление активами</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {staticMenuItems.map(item => renderMenuItem(item))}
      </div>
      
      <div className="p-4 border-t space-y-2">
        <div className="text-xs text-muted-foreground">
          <p>Формы учета:</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs flex-1">
            145
          </Button>
          <Button variant="outline" size="sm" className="text-xs flex-1">
            367
          </Button>
        </div>
      </div>
    </div>
  )
}
