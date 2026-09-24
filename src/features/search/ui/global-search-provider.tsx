'use client'

import { createContext, useContext, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  BriefcaseBusiness,
  FileText,
  LoaderCircle,
  Package,
  Search,
  UserRound,
  ListChecks,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { GlobalSearchItem, GlobalSearchType } from '../contracts/search'
import type { Permission } from '@/lib/auth/permissions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface SearchContextValue {
  canSearch: boolean
  openSearch: () => void
}

const SearchContext = createContext<SearchContextValue | null>(null)

const SEARCH_PERMISSIONS: Permission[] = [
  'employees.read',
  'assets.read',
  'projects.read',
  'tasks.read',
  'documents.read',
]

const GROUPS: Array<{ type: GlobalSearchType; label: string; Icon: LucideIcon }> = [
  { type: 'employee', label: 'Сотрудники', Icon: UserRound },
  { type: 'asset', label: 'Имущество', Icon: Package },
  { type: 'project', label: 'Проекты', Icon: BriefcaseBusiness },
  { type: 'task', label: 'Задачи', Icon: ListChecks },
  { type: 'document', label: 'Документы', Icon: FileText },
]

async function readSearchResponse(response: Response): Promise<GlobalSearchItem[]> {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error?.message || 'Не удалось выполнить поиск')
  return body?.data as GlobalSearchItem[]
}

export function GlobalSearchProvider({
  children,
  permissions,
}: {
  children: ReactNode
  permissions: Permission[]
}) {
  const router = useRouter()
  const canSearch = permissions.some((permission) => SEARCH_PERMISSIONS.includes(permission))
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchItem[]>([])
  const [resultsFor, setResultsFor] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const trimmedQuery = query.trim()
  const visibleResults = useMemo(
    () => open && trimmedQuery.length >= 2 && resultsFor === trimmedQuery ? results : [],
    [open, resultsFor, results, trimmedQuery],
  )
  const contextValue = useMemo<SearchContextValue>(() => ({
    canSearch,
    openSearch: () => {
      if (!canSearch) return
      setQuery('')
      setResults([])
      setResultsFor('')
      setError(null)
      setLoading(false)
      setActiveIndex(0)
      setOpen(true)
    },
  }), [canSearch])

  useEffect(() => {
    if (!canSearch) return
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        contextValue.openSearch()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [canSearch, contextValue])

  useEffect(() => {
    if (!open || trimmedQuery.length < 2) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const searchResults = await readSearchResponse(await fetch(
          `/api/search?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal, cache: 'no-store' },
        ))
        if (!controller.signal.aborted) {
          setResults(searchResults)
          setResultsFor(trimmedQuery)
          setActiveIndex(0)
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setResults([])
          setResultsFor(trimmedQuery)
          setError(caught instanceof Error ? caught.message : 'Не удалось выполнить поиск')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 220)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [open, trimmedQuery])

  const groupedResults = useMemo(() => GROUPS.map(({ type, label, Icon }) => ({
    type,
    label,
    Icon,
    items: visibleResults.filter((result) => result.type === type),
  })).filter((group) => group.items.length > 0), [visibleResults])
  const flatResults = useMemo(() => groupedResults.flatMap((group) => group.items), [groupedResults])

  const closeSearch = () => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
    setLoading(false)
  }

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && flatResults.length) {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % flatResults.length)
    } else if (event.key === 'ArrowUp' && flatResults.length) {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + flatResults.length) % flatResults.length)
    } else if (event.key === 'Enter' && flatResults[activeIndex]) {
      event.preventDefault()
      router.push(flatResults[activeIndex].href)
      closeSearch()
    }
  }

  return (
    <SearchContext.Provider value={contextValue}>
      {children}
      <Dialog open={open} onOpenChange={(nextOpen) => nextOpen ? contextValue.openSearch() : closeSearch()}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Поиск по Consilium</DialogTitle>
            <DialogDescription>Найдите сотрудника, имущество, проект, задачу или документ.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              aria-label="Поиск по системе"
              aria-controls="global-search-results"
              aria-autocomplete="list"
              aria-expanded={open}
              className="h-14 border-0 px-0 shadow-none focus-visible:ring-0"
              onChange={(event) => {
                const nextQuery = event.target.value
                setQuery(nextQuery)
                setResults([])
                setResultsFor('')
                setError(null)
                setLoading(nextQuery.trim().length >= 2)
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Имя, инвентарный номер, проект…"
              role="combobox"
              value={query}
            />
            <kbd className="hidden shrink-0 rounded border px-1.5 py-1 text-[10px] text-muted-foreground sm:inline">ESC</kbd>
          </div>

          <div id="global-search-results" className="max-h-[60vh] min-h-24 overflow-y-auto p-2" aria-live="polite">
            {!trimmedQuery && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Начните вводить запрос. Поиск учитывает ваши права доступа.
              </p>
            )}
            {trimmedQuery.length === 1 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">Введите ещё хотя бы один символ</p>
            )}
            {loading && (
              <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
                <LoaderCircle className="h-4 w-4 animate-spin" />Ищем…
              </div>
            )}
            {!loading && error && (
              <div role="alert" className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />{error}
              </div>
            )}
            {!loading && !error && trimmedQuery.length >= 2 && flatResults.length === 0 && resultsFor === trimmedQuery && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">Ничего не найдено</p>
            )}
            {!loading && !error && groupedResults.map((group) => (
              <section key={group.type} aria-label={group.label} className="py-1">
                <h3 className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h3>
              <ul role="listbox" aria-label={group.label} className="space-y-0.5">
                  {group.items.map((result) => {
                    const index = flatResults.indexOf(result)
                    const Icon = group.Icon
                    return (
                      <li key={`${result.type}-${result.id}`} role="presentation">
                        <Link
                          href={result.href}
                          prefetch={false}
                          onClick={closeSearch}
                          onMouseEnter={() => setActiveIndex(index)}
                          data-active={activeIndex === index}
                          className="flex items-center gap-3 rounded-md px-3 py-2.5 outline-none transition-colors hover:bg-accent data-[active=true]:bg-accent"
                          role="option"
                          aria-selected={activeIndex === index}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{result.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span>
                          </span>
                          <span className="hidden text-[10px] uppercase text-muted-foreground sm:inline">{group.label}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
          <div className="hidden items-center justify-between border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground sm:flex">
            <span>Поиск по доступным вам разделам</span>
            <span><kbd className="rounded border px-1 py-0.5">↑</kbd> <kbd className="rounded border px-1 py-0.5">↓</kbd> переход · Enter открыть</span>
          </div>
        </DialogContent>
      </Dialog>
    </SearchContext.Provider>
  )
}

export function GlobalSearchButton({ compact = false }: { compact?: boolean }) {
  const context = useContext(SearchContext)
  if (!context?.canSearch) return null

  return (
    <Button
      aria-label="Открыть поиск"
      aria-keyshortcuts="Control+K Meta+K"
      className={compact ? undefined : 'w-full justify-between'}
      onClick={context.openSearch}
      size={compact ? 'icon' : 'default'}
      variant={compact ? 'ghost' : 'outline'}
    >
      {compact ? (
        <Search className="h-5 w-5" />
      ) : (
        <>
          <span className="flex items-center gap-2"><Search className="h-4 w-4" />Поиск по системе</span>
          <kbd className="rounded border bg-muted px-1.5 py-1 text-[10px] text-muted-foreground">⌘ K</kbd>
        </>
      )}
    </Button>
  )
}
