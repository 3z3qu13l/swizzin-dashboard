import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { config } from './config.ts'
import { helperJson } from './helper.ts'
import { cached, keyed, readText, run, sh } from './util.ts'
import { allowedUnit as allowedUnitOf, firstMatch, parseSystemctlShow, statusOf, type Status, type UnitState } from './parse.ts'

export type { Status, UnitState }

export interface CatalogApp {
  id: string
  name: string
  category: string
  desc: string
  units: string[]
  web: string | null
  /** app on its own public port: fixed, or the listen port of its nginx site */
  link?: { scheme: 'http' | 'https'; port?: number; site?: string; path: string }
  paths: Record<string, string>
  apikey?: { file: string; type: string; key: string }
  version?: { dpkg?: string; cmd?: string; re?: string; git?: string; json?: string; key?: string; file?: string; arr?: string; api?: string }
  /** where the newest version is read: an apt package, or a GitHub repository's latest release */
  latest?: { apt?: string; github?: string }
  interactive?: boolean
  removeInteractive?: boolean
  core?: boolean
}

interface Catalog {
  categories: string[]
  apps: CatalogApp[]
}

export const catalog: Catalog = JSON.parse(readFileSync(config.catalog, 'utf8')) as Catalog
const byId = new Map(catalog.apps.map((a) => [a.id, a]))

export function catalogApp(id: string): CatalogApp | undefined {
  return byId.get(id)
}

export async function swizzinUsers(): Promise<string[]> {
  try {
    return (await readdir('/etc/htpasswd.d'))
      .filter((f) => f.startsWith('htpasswd.'))
      .map((f) => f.slice('htpasswd.'.length))
      .filter((u) => /^[a-z_][a-z0-9_.-]*$/.test(u))
      .sort()
  } catch {
    return config.master ? [config.master] : []
  }
}

export async function installedIds(): Promise<Set<string>> {
  const out = new Set<string>()
  try {
    for (const f of await readdir('/install')) {
      const m = /^\.(.+)\.lock$/.exec(f)
      if (m) out.add(m[1])
    }
  } catch {
    // not a swizzin server
  }
  return out
}

/** one systemctl call for every unit of the installed apps */
async function unitStates(apps: CatalogApp[]): Promise<Map<string, UnitState>> {
  const loaded = await run('systemctl', ['list-units', '--all', '--plain', '--no-legend', '--type=service'])
  const loadedNames = loaded.stdout
    .split('\n')
    .map((l) => l.trim().split(/\s+/)[0])
    .filter(Boolean)
  const wanted = new Set<string>()
  for (const app of apps) {
    for (const u of app.units) {
      if (u.endsWith('@')) {
        if (config.master) wanted.add(`${u}${config.master}.service`)
        for (const n of loadedNames) if (n.startsWith(u) && n.endsWith('.service')) wanted.add(n)
      } else {
        wanted.add(`${u}.service`)
      }
    }
  }
  if (!wanted.size) return new Map()
  const show = await run('systemctl', ['show', '--property=Id,ActiveState,SubState,UnitFileState,LoadState', ...wanted], 15_000)
  return parseSystemctlShow(show.stdout)
}

function unitsOf(app: CatalogApp, states: Map<string, UnitState>): UnitState[] {
  const out: UnitState[] = []
  for (const u of app.units) {
    if (u.endsWith('@')) {
      for (const [name, s] of states) {
        if (!name.startsWith(u)) continue
        // a template instance counts once it is enabled or running
        if (s.enabled === 'enabled' || s.active !== 'inactive' || s.user === config.master) out.push(s)
      }
    } else {
      const s = states.get(u)
      if (s) out.push(s)
    }
  }
  return out
}

/** local port of the app, from its nginx config */
async function portOf(app: CatalogApp): Promise<number | null> {
  if (app.link?.port) return app.link.port
  const conf = await readText(`/etc/nginx/apps/${app.id}.conf`)
  const direct = conf && /proxy_pass\s+https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)/.exec(conf)
  if (direct) return Number(direct[1])
  if (conf && /\$remote_user\.(\w+)/.test(conf) && config.master) {
    const name = /\$remote_user\.(\w+)/.exec(conf)![1]
    const up = await readText(`/etc/nginx/conf.d/${config.master}.${name}.conf`)
    const m = up && /server\s+(?:127\.0\.0\.1|localhost):(\d+)/.exec(up)
    if (m) return Number(m[1])
  }
  return null
}

/** the public port of an app outside the main site */
async function linkOf(app: CatalogApp): Promise<AppRow['link']> {
  const l = app.link
  if (!l) return null
  let port = l.port ?? null
  if (l.site && /^[a-z0-9-]+$/.test(l.site)) {
    const conf = await readText(`/etc/nginx/sites-enabled/${l.site}`)
    const m = conf && /listen\s+(\d+)/.exec(conf)
    port = m ? Number(m[1]) : null
  }
  return port ? { scheme: l.scheme, port, path: l.path } : null
}

/** installed version, without root. *arr apps answer through the helper (appinfo). */
export const appVersion = keyed(30 * 60_000, async (id: string): Promise<string | null> => {
  const v = byId.get(id)?.version
  if (!v) return null
  if (v.dpkg) {
    const r = await run('dpkg-query', ['-W', '-f=${Version}', v.dpkg])
    return r.ok && r.stdout ? r.stdout.replace(/^\d+:/, '').replace(/[-+~].*$/, '') : null
  }
  if (v.cmd?.includes('{user}')) {
    // the master's home is not readable by swizdash: the helper runs it as the master
    const info = await appInfo(id)
    return info.versionOutput ? firstMatch(info.versionOutput, v.re) : null
  }
  if (v.cmd) {
    const r = await sh(`${v.cmd} 2>&1`, 10_000)
    return firstMatch(r.stdout, v.re)
  }
  if (v.git) {
    const r = await run('git', ['-c', 'safe.directory=*', '-C', v.git, 'describe', '--tags', '--always'])
    return r.ok ? r.stdout.trim().replace(/^v/, '') : null
  }
  if (v.json && v.key) {
    try {
      return String(JSON.parse((await readText(v.json)) ?? '{}')[v.key] ?? '') || null
    } catch {
      return null
    }
  }
  if (v.file) return (await readText(v.file))?.trim().replace(/^v/, '') || null
  if (v.arr) {
    const info = await appInfo(id)
    return info.version
  }
  return null
})

export interface AppInfo {
  paths: Record<string, { path: string; exists: boolean }>
  apikey: string | null
  version: string | null
  /** output of a version probe the helper ran as the master */
  versionOutput: string | null
}

export const appInfo = keyed(60_000, (id: string) => helperJson<AppInfo>(['appinfo', id]))

export interface AppRow {
  id: string
  name: string
  category: string
  desc: string
  installed: boolean
  status: Status
  units: UnitState[]
  web: string | null
  port: number | null
  /** own public port, when the app is not under the main site */
  link: { scheme: string; port: number; path: string } | null
  version: string | null
  canInstall: boolean
  canRemove: boolean
  /** nginx and swizdash itself carry the dashboard: restart only */
  canStop: boolean
  hasScripts: { install: boolean; remove: boolean }
  note: string | null
}

/** install, remove and upgrade scripts of box, listed by the helper: /etc/swizzin is root only */
export const boxScripts = cached(10 * 60_000, async () => {
  const r = await helperJson<{ install?: string[]; remove?: string[]; upgrade?: string[] }>(['scripts'])
  return { install: new Set(r.install ?? []), remove: new Set(r.remove ?? []), upgrade: new Set(r.upgrade ?? []) }
})

const versionCache = new Map<string, string | null>()
const noStop = new Set(['nginx', 'swizdash'])

export async function listApps(): Promise<AppRow[]> {
  const [installed, scripts] = await Promise.all([installedIds(), boxScripts()])
  const apps = catalog.apps
  const states = await unitStates(apps.filter((a) => installed.has(a.id)))
  return Promise.all(
    apps.map(async (app) => {
      const isInstalled = installed.has(app.id)
      const units = isInstalled ? unitsOf(app, states) : []
      const hasInstall = scripts.install.has(app.id)
      const hasRemove = scripts.remove.has(app.id)
      // the probe answers on a later refresh, the last known version shows meanwhile.
      // No version (an app still starting) is asked again a minute later, not in 30.
      if (isInstalled) {
        void appVersion(app.id).then(
          (v) => {
            versionCache.set(app.id, v)
            if (v === null && app.version) setTimeout(() => appVersion.forget(app.id), 60_000).unref()
          },
          () => undefined,
        )
      }
      let note: string | null = null
      if (app.core) note = `${app.name} is managed with box over SSH`
      else if (!isInstalled && app.interactive) note = `The installer asks questions: run box install ${app.id} over SSH`
      else if (isInstalled && app.removeInteractive) note = `Removal asks questions: run box remove ${app.id} over SSH`
      return {
        id: app.id,
        name: app.name,
        category: app.category,
        desc: app.desc,
        installed: isInstalled,
        status: isInstalled ? statusOf(units) : 'none',
        units,
        web: app.web,
        port: isInstalled ? await portOf(app) : null,
        link: isInstalled ? await linkOf(app) : null,
        version: isInstalled ? (versionCache.get(app.id) ?? null) : null,
        canInstall: !isInstalled && hasInstall && !app.interactive && !app.core,
        canRemove: isInstalled && hasRemove && !app.removeInteractive && !app.core,
        canStop: !noStop.has(app.id),
        hasScripts: { install: hasInstall, remove: hasRemove },
        note,
      } satisfies AppRow
    }),
  )
}

/** after a start or an install: probe again instead of waiting for the caches to expire */
export function forgetVersion(id: string, { reinstalled = false } = {}): void {
  appVersion.forget(id)
  appInfo.forget(id)
  if (reinstalled) versionCache.delete(id)
}

export function allowedUnit(app: CatalogApp, unit: string): boolean {
  return allowedUnitOf(app.units, unit)
}
