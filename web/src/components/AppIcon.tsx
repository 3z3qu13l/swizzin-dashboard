import { categoryHue } from '@/lib/apps'
import { useMeta } from '@/lib/queries'
import { cn } from '@/lib/format'

/** Monogram tile, tinted by category: no third-party logos to fetch or license. */
export function AppIcon({ name, category, className }: { name: string; category: string; className?: string }) {
  const meta = useMeta()
  const hue = categoryHue(category, meta.data?.categories ?? [])
  const letters = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2)
  return (
    <span
      aria-hidden
      className={cn('grid size-9 shrink-0 place-items-center rounded-lg text-[13px] font-bold tracking-tight', className)}
      style={{
        background: `oklch(0.62 0.13 ${hue} / 0.16)`,
        color: `oklch(var(--icon-l) 0.14 ${hue})`,
        boxShadow: `inset 0 0 0 1px oklch(0.7 0.13 ${hue} / 0.28)`,
      }}
    >
      {letters.charAt(0).toUpperCase() + letters.charAt(1).toLowerCase()}
    </span>
  )
}
