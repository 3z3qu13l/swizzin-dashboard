import type { ReactNode } from 'react'

// plain SVG, kept apart from charts.tsx so the pages using them do not load echarts

/** Ring gauge drawn in SVG: cheap enough to refresh every two seconds. */
export function Ring({ value, color, size = 132, children }: { value: number; color: string; size?: number; children?: ReactNode }) {
  const r = 52
  const c = 2 * Math.PI * r
  const arc = 0.75
  const v = Math.max(0, Math.min(100, value)) / 100
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-[225deg]" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="9" strokeDasharray={`${c * arc} ${c}`} strokeLinecap="round" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeDasharray={`${c * arc * v} ${c}`}
          strokeLinecap="round"
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

/** Tiny inline trend line, for the live strip. */
export function Spark({ values, color, max }: { values: number[]; color: string; max?: number }) {
  const w = 72
  const h = 20
  if (values.length < 2) return <svg width={w} height={h} aria-hidden />
  const top = max ?? Math.max(1, ...values)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / top) * (h - 2) - 1}`).join(' ')
  return (
    <svg width={w} height={h} aria-hidden className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
