// Types of the server's answers, and the JSON fetch helpers the queries use.

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// How far the server clock is ahead of this browser, from the x-server-time header of the last answer
let clockSkew = 0

/** A time the server gave, on this browser's clock, so "5 seconds ago" stays right when the clocks differ */
export const serverTime = (ms: number) => ms - clockSkew

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  const serverNow = Number(res.headers.get('x-server-time'))
  if (serverNow > 0) clockSkew = serverNow - Date.now()
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // nginx error page
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `The server answered ${res.status}`
    throw new ApiError(res.status, msg)
  }
  return data as T
}

export const get = <T>(path: string) => request<T>('GET', path)
export const post = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body)

// ---------- types shared with the server ----------

export type Status = 'running' | 'partial' | 'stopped' | 'failed' | 'none'

export interface UnitState {
  unit: string
  user: string | null
  active: string
  sub: string
  enabled: string
}

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
  canStop: boolean
  hasScripts: { install: boolean; remove: boolean }
  note: string | null
}

export interface AppInfo {
  paths: Record<string, { path: string; exists: boolean }>
  apikey: string | null
}

export interface Live {
  at: number
  cpu: number
  iowait: number
  load: [number, number, number]
  mem: { total: number; used: number; available: number; cached: number; percent: number }
  swap: { total: number; used: number; percent: number }
  net: { iface: string | null; rx: number; tx: number }
  uptime: number
}

export interface Disk {
  mount: string
  fstype: string
  device: string
  total: number
  used: number
  free: number
  percent: number
}

export interface Summary {
  live: Live | null
  cpu: { model: string | null; cores: number; threads: number; temp: number | null; freq: number | null }
  disks: Disk[]
  os: {
    os: string | null
    codename: string | null
    kernel: string
    arch: string
    hostname: string
    node: string
    nginx: string | null
    sqlite: string | null
    swizzin: string | null
  }
  master: string
}

export interface Meta {
  version: string
  started: number
  boot: number
  master: string
  categories: string[]
}

export interface HistoryPoint {
  t: number
  cpu: number
  iowait: number
  load1: number
  mem: number
  swap: number
  rx: number
  tx: number
}

export interface Bandwidth {
  available: boolean
  iface?: string
  today?: { rx: number; tx: number }
  month?: { rx: number; tx: number }
  total?: { rx: number; tx: number }
  days?: { date: string; rx: number; tx: number }[]
}

export interface Updates {
  checkedAt: number
  packages: { name: string; origin: string; version: string; from: string; security: boolean }[]
}

export interface SoftwareUpdate {
  name: 'swizzin' | 'swizdash'
  /** null: the installed version could not be read */
  installed: string | null
  /** null: the check failed (offline, rate limit) */
  available: string | null
  /** the branch box update follows, swizzin only */
  branch: string | null
  /** manual: box update leaves /etc/swizzin alone (a link, or .dev.lock) */
  state: 'current' | 'update' | 'manual' | 'unknown'
  checkedAt: number | null
  command: string
}

export interface AppUpdate {
  id: string
  name: string
  source: 'apt' | 'github'
  /** null: the installed version could not be read */
  installed: string | null
  /** null: the check failed (offline, rate limit, no release) */
  available: string | null
  state: 'current' | 'update' | 'unknown'
  checkedAt: number | null
  /** null: box has no upgrade script for it */
  command: string | null
}

export interface Sensor {
  chip: string
  label: string
  kind: 'temp' | 'fan'
  value: number
  max?: number
}

export interface RaidArray {
  name: string
  state: string
  level: string
  mount: string | null
  devices: { name: string; state: string }[]
  total: number
  up: number
  health: 'healthy' | 'degraded' | 'rebuilding' | 'syncing'
  progress: { action: string; percent: number; finish: string; speed: string } | null
}

export interface Hardware {
  platform: {
    virtualization: string
    vendor: string | null
    product: string | null
    board: string | null
    bios: string | null
    biosDate: string | null
    governor: string | null
    vulnerabilities: { name: string; state: string }[]
  }
  sensors: Sensor[]
  raid: { available: boolean; arrays: RaidArray[] }
  /** null fields: the machine does not report it */
  health: {
    /** reason: switched off on purpose (SMT off, maxcpus= boot option), not a fault */
    cpus: { online: number; present: number; offline: number[]; reason: 'smt' | 'maxcpus' | null } | null
    /** events since boot */
    throttle: { core: number; package: number; throttledCores: number } | null
    microcode: string[]
    ecc: { controllers: number; corrected: number; uncorrected: number } | null
  }
}

export interface Smart {
  available: boolean
  disks: {
    device: string
    model: string | null
    passed: boolean | null
    temperature: number | null
    power_on_hours: number | null
    reallocated: number | null
    type: string | null
  }[]
}

export interface Fail2ban {
  available: boolean
  jails?: { jail: string; banned: string[]; total: number; failed: number }[]
  /** at: epoch milliseconds */
  events?: { at: number; jail: string; ip: string }[]
}

export interface Quota {
  available: boolean
  used?: number
  limit?: number
}

export type TorrentStatus = 'downloading' | 'seeding' | 'queued' | 'checking' | 'stopped' | 'error'

/** one torrent client of one swizzin user */
export interface Download {
  client: 'rtorrent' | 'qbittorrent' | 'transmission' | 'deluge'
  user: string
  folder: string | null
  /** bytes per second */
  down: number
  up: number
  total: number
  active: number
  counts: Record<TorrentStatus, number>
  size: number
  done: number
  /** more than the 1000 torrents listed */
  truncated: boolean
  items: { name: string; status: TorrentStatus; progress: number; size: number; ratio: number }[]
}

export interface Job {
  id: string
  kind: 'install' | 'remove'
  app: string
  startedAt: number
  state: 'running' | 'success' | 'failed'
  exitCode: number | null
  log?: string
}
