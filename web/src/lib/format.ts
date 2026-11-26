const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

export function bytes(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—'
  let i = 0
  let v = Math.abs(n)
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : v >= 100 ? 0 : digits)} ${units[i]}`
}

export function rate(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${bytes(n)}/s`
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

export function duration(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function ago(ms: number): string {
  const s = Math.round((ms - Date.now()) / 1000)
  if (Math.abs(s) < 45) return rtf.format(s, 'second')
  const m = Math.round(s / 60)
  if (Math.abs(m) < 45) return rtf.format(m, 'minute')
  const h = Math.round(m / 60)
  if (Math.abs(h) < 24) return rtf.format(h, 'hour')
  return rtf.format(Math.round(h / 24), 'day')
}

export function cn(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ')
}
