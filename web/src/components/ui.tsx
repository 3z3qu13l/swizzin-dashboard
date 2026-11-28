// Small shared components: buttons, cards, dialogs, menus, pager, status dots.

import { Dialog as D, DropdownMenu as M } from 'radix-ui'
import { Loader2, X } from 'lucide-react'
import { useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/format'
import type { Status } from '@/lib/api'
import type { Tone } from '@/lib/status'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('glass rounded-2xl border', className)}>{children}</section>
}

export function CardHead({ icon, title, hint, right }: { icon?: ReactNode; title: ReactNode; hint?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
      {icon && <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] font-semibold">{title}</h2>
        {hint && <p className="truncate text-xs text-muted">{hint}</p>}
      </div>
      {right}
    </header>
  )
}

type Variant = 'primary' | 'ghost' | 'outline' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110',
  ghost: 'text-muted hover:bg-surface-2 hover:text-text',
  outline: 'border border-line text-text hover:bg-surface-2',
  danger: 'bg-danger text-white hover:brightness-110',
}

export function Button({
  variant = 'outline',
  size = 'md',
  busy,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'icon'; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-9 px-3.5 text-sm',
        size === 'icon' && 'size-8',
        variants[variant],
        className,
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  )
}

const tones: Record<Tone, string> = {
  green: 'bg-accent/12 text-accent ring-accent/25',
  amber: 'bg-warn/12 text-warn ring-warn/25',
  red: 'bg-danger/12 text-danger ring-danger/25',
  blue: 'bg-info/12 text-info ring-info/25',
  grey: 'bg-surface-2 text-muted ring-line',
}

export function Badge({ tone = 'grey', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>
      {children}
    </span>
  )
}

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  const dots: Record<Status, string> = { running: 'bg-accent', partial: 'bg-warn', failed: 'bg-danger', stopped: 'bg-muted/60', none: 'bg-muted/30' }
  const c = dots[status]
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', c, status === 'running' && 'shadow-[0_0_0_3px] shadow-accent/15', className)} />
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
}) {
  return (
    <div role="group" className={cn('inline-flex rounded-lg border border-line bg-surface-2/60 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            value === o.value ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Bar({ value, className, color = 'bg-accent' }: { value: number; className?: string; color?: string }) {
  const v = Math.max(0, Math.min(100, value))
  const c = v >= 90 ? 'bg-danger' : v >= 75 ? 'bg-warn' : color
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-surface-2', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', c)} style={{ width: `${v}%` }} />
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" /> {label ?? 'Loading…'}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-5 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 text-xs text-muted">{children}</div>}
    </div>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  return <p className="px-5 py-4 text-sm text-danger">{error instanceof Error ? error.message : 'Something went wrong'}</p>
}

// The dialogs open from state, not from a Radix trigger, so Radix has no button to give the
// focus back to on close: remember what had it when the dialog opened.
function useFocusReturn() {
  const back = useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus: () => {
      const active = document.activeElement
      // opened from a menu item, which goes away with its menu: back to the button of that menu
      const menu = active?.closest('[role=menu]')
      const target = menu?.id ? document.querySelector(`[aria-controls="${CSS.escape(menu.id)}"]`) : active
      back.current = target instanceof HTMLElement ? target : null
    },
    onCloseAutoFocus: (e: Event) => {
      if (!back.current?.isConnected) return
      e.preventDefault()
      back.current.focus()
    },
  }
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  const focusReturn = useFocusReturn()
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
        <D.Content
          {...focusReturn}
          className={cn(
            'fixed top-1/2 left-1/2 z-50 max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border border-line bg-surface p-5 shadow-2xl',
            wide ? 'max-w-3xl' : 'max-w-md',
          )}
        >
          <div className="mb-4 flex items-start gap-3">
            <div className="flex-1">
              <D.Title className="text-base font-semibold">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-sm text-muted">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

export function Menu({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  return (
    <M.Root>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content align="end" sideOffset={6} className="z-50 min-w-44 rounded-lg border border-line bg-surface p-1 shadow-xl">
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  )
}

export function MenuItem({ onSelect, children, danger, disabled }: { onSelect: () => void; children: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <M.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[highlighted]:bg-surface-2',
        danger && 'text-danger',
      )}
    >
      {children}
    </M.Item>
  )
}

export function Pager({
  page,
  pages,
  onPage,
  total,
  perPage,
  onPerPage,
}: {
  page: number
  pages: number
  onPage: (p: number) => void
  total: number
  perPage: number
  onPerPage: (n: number) => void
}) {
  const from = total ? (page - 1) * perPage + 1 : 0
  const to = Math.min(total, page * perPage)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-muted">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          Per page
          <select
            value={perPage}
            onChange={(e) => onPerPage(Number(e.target.value))}
            className="rounded-md border border-line bg-surface-2 px-1.5 py-1 text-text"
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="text-text">
          {page} / {Math.max(1, pages)}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}
