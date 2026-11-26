import type { AppRow } from './api'

/** Address of the app as the browser reaches it: under the main site, or on its own public port. */
export function appUrl(app: Pick<AppRow, 'web' | 'link'>): string | null {
  const host = window.location.hostname
  if (app.web) return `https://${host}${app.web}`
  if (app.link) return `${app.link.scheme}://${host}:${app.link.port}${app.link.path}`
  return null
}

const hues = [152, 220, 265, 32, 190, 330, 95, 12, 245, 175, 290, 55]

export function categoryHue(category: string, categories: string[]): number {
  const i = categories.indexOf(category)
  return hues[(i < 0 ? 0 : i) % hues.length]
}
