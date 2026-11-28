import { useEffect, useState } from 'react'

const read = () => {
  const s = getComputedStyle(document.documentElement)
  const v = (n: string) => s.getPropertyValue(`--${n}`).trim()
  return Object.fromEntries(['text', 'muted', 'line', 'surface', 'accent', 'cpu', 'mem', 'swap', 'warn', 'danger', 'info'].map((k) => [k, v(k)]))
}

/** Theme colors for the charts, updated when the theme changes. */
export function useThemeColors(): Record<string, string> {
  const [c, setC] = useState(read)
  useEffect(() => {
    const o = new MutationObserver(() => setC(read()))
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => o.disconnect()
  }, [])
  return c
}

/** Current time, refreshed every `everyMs`: keeps renders pure. */
export function useNow(everyMs = 5000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

/** One page of `rows` and the props of its Pager. When the list shrinks, the page never stays past the end. */
export function usePaged<T>(rows: T[]) {
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const pages = Math.max(1, Math.ceil(rows.length / perPage))
  const current = Math.min(page, pages)
  return {
    shown: rows.slice((current - 1) * perPage, current * perPage),
    reset: () => setPage(1),
    pager: { page: current, pages, onPage: setPage, total: rows.length, perPage, onPerPage: (n: number) => (setPerPage(n), setPage(1)) },
  }
}
