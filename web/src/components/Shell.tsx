import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { ChevronDown, Cpu, ExternalLink, LayoutGrid, Menu as MenuIcon, MemoryStick, Network, Search, Server, X } from 'lucide-react'
import { useApps, useLive, useMeta } from '@/lib/queries'
import { appUrl } from '@/lib/apps'
import { cn, pct, rate } from '@/lib/format'
import { Spark } from './charts'
import { useThemeColors } from '@/lib/hooks'
import { StatusDot } from './ui'
import { ThemePicker } from './ThemePicker'

function LiveStrip() {
  const { live, trail } = useLive()
  const c = useThemeColors()
  const items = [
    { icon: Cpu, label: 'CPU', value: pct(live?.cpu), color: c.cpu, values: trail.map((t) => t.cpu), max: 100 },
    { icon: MemoryStick, label: 'Memory', value: pct(live?.mem.percent), color: c.mem, values: trail.map((t) => t.mem.percent), max: 100 },
    { icon: Network, label: 'Network', value: live ? `↓ ${rate(live.net.rx)}` : '—', color: c.accent, values: trail.map((t) => t.net.rx) },
  ]
  return (
    <div className="hidden items-center gap-5 lg:flex" aria-label="Live usage">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2.5" title={i.label}>
          <i.icon className="size-4 text-muted" aria-hidden />
          <span className="sr-only">{i.label}</span>
          <span className="w-[5.5rem] text-sm font-semibold whitespace-nowrap">{i.value}</span>
          <Spark values={i.values} color={i.color} max={i.max} />
        </div>
      ))}
    </div>
  )
}

function Software({ onNavigate }: { onNavigate: () => void }) {
  const apps = useApps()
  const meta = useMeta()
  const installed = useMemo(() => (apps.data?.apps ?? []).filter((a) => a.installed), [apps.data])
  const groups = (meta.data?.categories ?? []).map((cat) => ({ cat, apps: installed.filter((a) => a.category === cat) })).filter((g) => g.apps.length)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  if (!groups.length) return null
  return (
    <div className="mt-6">
      <p className="px-3 pb-2 text-xs font-semibold text-muted">Software</p>
      {groups.map((g) => {
        const isOpen = open[g.cat] ?? true
        return (
          <div key={g.cat}>
            <button
              onClick={() => setOpen((o) => ({ ...o, [g.cat]: !isOpen }))}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] text-muted hover:text-text"
            >
              <span className="flex-1">{g.cat}</span>
              <span className="text-xs">{g.apps.length}</span>
              <ChevronDown className={cn('size-3.5 transition-transform', !isOpen && '-rotate-90')} />
            </button>
            {isOpen && (
              <ul className="mb-1">
                {g.apps.map((a) => {
                  const url = appUrl(a)
                  return (
                    <li key={a.id}>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={onNavigate}
                          className="group flex items-center gap-2.5 rounded-md py-1.5 pr-2 pl-5 text-sm hover:bg-surface-2"
                        >
                          <StatusDot status={a.status} />
                          <span className="flex-1 truncate">{a.name}</span>
                          <ExternalLink className="size-3.5 text-muted opacity-0 group-hover:opacity-100" aria-hidden />
                        </a>
                      ) : (
                        <span className="flex items-center gap-2.5 py-1.5 pr-2 pl-5 text-sm text-muted">
                          <StatusDot status={a.status} />
                          <span className="flex-1 truncate">{a.name}</span>
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SearchBox() {
  const apps = useApps()
  const [q, setQ] = useState('')
  const hits = q.trim() ? (apps.data?.apps ?? []).filter((a) => a.installed && a.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : []
  return (
    <div className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setQ('')
          if (e.key === 'Enter' && hits[0]) {
            const u = appUrl(hits[0])
            if (u) window.open(u, '_blank', 'noreferrer')
          }
        }}
        placeholder="Open an app…"
        aria-label="Open an app"
        className="h-9 w-full rounded-lg border border-line bg-surface-2/60 pr-3 pl-9 text-sm placeholder:text-muted focus:border-accent/60 focus:outline-none"
      />
      {hits.length > 0 && (
        <ul className="absolute top-11 right-0 left-0 z-30 rounded-lg border border-line bg-surface p-1 shadow-xl">
          {hits.map((a) => {
            const u = appUrl(a)
            return (
              <li key={a.id}>
                <a
                  href={u ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setQ('')}
                  className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-surface-2"
                >
                  <StatusDot status={a.status} />
                  <span className="flex-1">{a.name}</span>
                  <span className="text-xs text-muted">{a.category}</span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// Tailwind's lg breakpoint: from there the menu is a sidebar, below it a drawer
const wideQuery = '(min-width: 64rem)'
const subscribeWide = (cb: () => void) => {
  const q = window.matchMedia(wideQuery)
  q.addEventListener('change', cb)
  return () => q.removeEventListener('change', cb)
}
const isWide = () => window.matchMedia(wideQuery).matches

export function Shell({ children }: { children: ReactNode }) {
  const [nav, setNav] = useState(false)
  const wide = useSyncExternalStore(subscribeWide, isWide)
  const drawer = nav && !wide
  const { pathname } = useLocation()
  // a wider window or another page (the browser's Back button too) closes the drawer
  const [seen, setSeen] = useState({ wide, pathname })
  if (seen.wide !== wide || seen.pathname !== pathname) {
    setSeen({ wide, pathname })
    setNav(false)
  }
  const openNav = useRef<HTMLButtonElement>(null)
  const closeNav = useRef<HTMLButtonElement>(null)
  const meta = useMeta()
  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-surface-2 hover:text-text',
    )

  // the phone menu behaves like a dialog: focus goes in, Escape closes it, focus comes back
  useEffect(() => {
    if (!drawer) return
    closeNav.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && setNav(false)
    document.addEventListener('keydown', onKey)
    const opener = openNav.current
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [drawer])

  return (
    <div className="flex min-h-screen">
      <aside
        id="sidebar"
        role={drawer ? 'dialog' : undefined}
        aria-modal={drawer || undefined}
        aria-label={drawer ? 'Menu' : undefined}
        // closed off screen, the drawer also leaves the keyboard order and screen readers
        inert={!nav && !wide}
        className={cn(
          'glass frost fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          nav ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2.5 px-5">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span className="text-lg font-bold tracking-tight">swizdash</span>
          <button ref={closeNav} className="ml-auto lg:hidden" onClick={() => setNav(false)} aria-label="Close menu">
            <X className="size-5 text-muted" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          <NavLink to="/" end className={link} onClick={() => setNav(false)}>
            <LayoutGrid className="size-4" /> App Dashboard
          </NavLink>
          <NavLink to="/system" className={link} onClick={() => setNav(false)}>
            <Server className="size-4" /> System Dashboard
          </NavLink>
          <Software onNavigate={() => setNav(false)} />
        </nav>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          {meta.data ? `Signed in as ${meta.data.master}, version ${meta.data.version}` : ' '}
        </p>
      </aside>
      {nav && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setNav(false)} />}

      <div className="min-w-0 flex-1" inert={drawer}>
        <header className="glass frost sticky top-0 z-20 flex h-16 items-center gap-4 border-b px-4 sm:px-6">
          <button ref={openNav} className="lg:hidden" onClick={() => setNav(true)} aria-label="Open menu" aria-expanded={nav} aria-controls="sidebar">
            <MenuIcon className="size-5" />
          </button>
          <SearchBox />
          <div className="ml-auto flex items-center gap-4">
            <LiveStrip />
            <ThemePicker />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  )
}
