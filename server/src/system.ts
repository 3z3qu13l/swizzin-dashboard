import { statfs, readdir } from 'node:fs/promises'
import os from 'node:os'
import { readText, run, cached } from './util.ts'

interface CpuTimes {
  total: number
  idle: number
  iowait: number
}

interface NetCounters {
  rx: number
  tx: number
  at: number
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

async function cpuTimes(): Promise<CpuTimes | null> {
  const stat = await readText('/proc/stat')
  const line = stat?.split('\n').find((l) => l.startsWith('cpu '))
  if (!line) return null
  const v = line.trim().split(/\s+/).slice(1).map(Number)
  // user nice system idle iowait irq softirq steal (guest is already counted in user)
  const total = v.slice(0, 8).reduce((a, b) => a + b, 0)
  return { total, idle: v[3] + v[4], iowait: v[4] }
}

export async function defaultIface(): Promise<string | null> {
  const route = await readText('/proc/net/route')
  if (!route) return null
  for (const l of route.split('\n').slice(1)) {
    const f = l.trim().split(/\s+/)
    if (f[1] === '00000000' && f[7] === '00000000') return f[0]
  }
  return null
}

async function netCounters(iface: string | null): Promise<NetCounters | null> {
  if (!iface) return null
  const dev = await readText('/proc/net/dev')
  const line = dev?.split('\n').find((l) => l.trim().startsWith(`${iface}:`))
  if (!line) return null
  const f = line.split(':')[1].trim().split(/\s+/).map(Number)
  return { rx: f[0], tx: f[8], at: Date.now() }
}

export async function meminfo(): Promise<Record<string, number>> {
  const text = (await readText('/proc/meminfo')) ?? ''
  const out: Record<string, number> = {}
  for (const l of text.split('\n')) {
    const m = /^(\w+):\s+(\d+)/.exec(l)
    if (m) out[m[1]] = Number(m[2]) * 1024
  }
  return out
}

let prevCpu: CpuTimes | null = null
let prevNet: NetCounters | null = null
let latest: Live | null = null

async function sample(): Promise<Live> {
  const [cpu, mi, iface] = await Promise.all([cpuTimes(), meminfo(), defaultIface()])
  const net = await netCounters(iface)
  let cpuPct = 0
  let ioPct = 0
  if (cpu && prevCpu && cpu.total > prevCpu.total) {
    const dt = cpu.total - prevCpu.total
    cpuPct = (100 * (dt - (cpu.idle - prevCpu.idle))) / dt
    ioPct = (100 * (cpu.iowait - prevCpu.iowait)) / dt
  }
  prevCpu = cpu
  let rx = 0
  let tx = 0
  if (net && prevNet && net.at > prevNet.at && net.rx >= prevNet.rx && net.tx >= prevNet.tx) {
    const s = (net.at - prevNet.at) / 1000
    rx = (net.rx - prevNet.rx) / s
    tx = (net.tx - prevNet.tx) / s
  }
  prevNet = net
  const total = mi.MemTotal ?? 0
  const available = mi.MemAvailable ?? 0
  const swapTotal = mi.SwapTotal ?? 0
  const swapUsed = swapTotal - (mi.SwapFree ?? 0)
  const load = os.loadavg() as [number, number, number]
  return {
    at: Date.now(),
    cpu: round(cpuPct),
    iowait: round(ioPct),
    load: load.map((l) => round(l, 2)) as [number, number, number],
    mem: {
      total,
      used: total - available,
      available,
      cached: (mi.Cached ?? 0) + (mi.SReclaimable ?? 0),
      percent: total ? round((100 * (total - available)) / total) : 0,
    },
    swap: { total: swapTotal, used: swapUsed, percent: swapTotal ? round((100 * swapUsed) / swapTotal) : 0 },
    net: { iface, rx: Math.round(rx), tx: Math.round(tx) },
    uptime: Math.round(os.uptime()),
  }
}

export function round(n: number, d = 1): number {
  const f = 10 ** d
  return Math.round(n * f) / f
}

export function startSampler(): void {
  const tick = async () => {
    try {
      latest = await sample()
    } catch {
      // keeps the previous sample
    }
  }
  void tick()
  setInterval(tick, 2000).unref()
}

export function live(): Live | null {
  return latest
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

const realFs = /^(ext[234]|xfs|btrfs|zfs|f2fs|reiserfs|jfs|vfat|exfat|ntfs3?|fuseblk)$/

export async function disks(): Promise<Disk[]> {
  const mounts = (await readText('/proc/mounts')) ?? ''
  const seen = new Set<string>()
  const out: Disk[] = []
  for (const l of mounts.split('\n')) {
    const [device, mount, fstype] = l.split(' ')
    if (!device || !realFs.test(fstype) || seen.has(device)) continue
    if (mount.startsWith('/boot') || mount.startsWith('/snap')) continue
    seen.add(device)
    try {
      const s = await statfs(mount.replace(/\\040/g, ' '))
      const total = s.blocks * s.bsize
      const free = s.bavail * s.bsize
      const used = total - s.bfree * s.bsize
      out.push({ mount, fstype, device, total, used, free, percent: total ? round((100 * used) / (used + free)) : 0 })
    } catch {
      // unreadable mount point
    }
  }
  return out.sort((a, b) => a.mount.length - b.mount.length)
}

export const cpuInfo = cached(3600_000, async () => {
  const text = (await readText('/proc/cpuinfo')) ?? ''
  const model = /^model name\s*:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? null
  const threads = os.cpus().length
  const cores = new Set(
    text
      .split('\n\n')
      .map((b) => `${/physical id\s*:\s*(\d+)/.exec(b)?.[1]}-${/core id\s*:\s*(\d+)/.exec(b)?.[1]}`)
      .filter((k) => !k.includes('undefined')),
  ).size
  return { model, cores: cores || threads, threads }
})

export async function cpuFreqMhz(): Promise<number | null> {
  const speeds = os
    .cpus()
    .map((c) => c.speed)
    .filter((s) => s > 0)
  if (!speeds.length) return null
  return Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
}

export interface Sensor {
  chip: string
  label: string
  kind: 'temp' | 'fan'
  value: number
  max?: number
}

/** temperatures and fans from /sys/class/hwmon, readable without root */
export async function sensors(): Promise<Sensor[]> {
  const base = '/sys/class/hwmon'
  const out: Sensor[] = []
  let dirs: string[] = []
  try {
    dirs = await readdir(base)
  } catch {
    return out
  }
  for (const d of dirs) {
    const chip = (await readText(`${base}/${d}/name`))?.trim() ?? d
    let files: string[] = []
    try {
      files = await readdir(`${base}/${d}`)
    } catch {
      continue
    }
    for (const f of files) {
      const m = /^(temp|fan)(\d+)_input$/.exec(f)
      if (!m) continue
      const raw = Number((await readText(`${base}/${d}/${f}`))?.trim())
      if (!Number.isFinite(raw)) continue
      const label = (await readText(`${base}/${d}/${m[1]}${m[2]}_label`))?.trim() ?? `${m[1]}${m[2]}`
      if (m[1] === 'temp') {
        const max = Number((await readText(`${base}/${d}/temp${m[2]}_crit`))?.trim())
        out.push({ chip, label, kind: 'temp', value: raw / 1000, max: Number.isFinite(max) && max > 0 ? max / 1000 : undefined })
      } else {
        out.push({ chip, label, kind: 'fan', value: raw })
      }
    }
  }
  return out
}

/** highest CPU package/core temperature, null on VMs */
export async function cpuTemp(): Promise<number | null> {
  const s = (await sensors()).filter((x) => x.kind === 'temp' && /coretemp|k10temp|zenpower|cpu_thermal|acpitz/.test(x.chip))
  if (!s.length) return null
  return Math.max(...s.map((x) => x.value))
}

export const osInfo = cached(3600_000, async () => {
  const rel = (await readText('/etc/os-release')) ?? ''
  const get = (k: string) => new RegExp(`^${k}="?([^"\\n]*)"?`, 'm').exec(rel)?.[1] ?? null
  const nginx = await run('nginx', ['-v'])
  const sqlite = await run('sqlite3', ['--version'])
  const swizzin = await run('git', ['-c', 'safe.directory=*', '-C', '/etc/swizzin', 'log', '-1', '--format=%h %cs'])
  return {
    os: get('PRETTY_NAME'),
    codename: get('VERSION_CODENAME'),
    kernel: os.release(),
    arch: os.arch(),
    hostname: os.hostname(),
    node: process.version,
    nginx: /nginx\/(\S+)/.exec(nginx.stderr)?.[1] ?? null,
    sqlite: process.versions.sqlite ?? (sqlite.ok ? sqlite.stdout.split(' ')[0] : null),
    swizzin: swizzin.ok ? swizzin.stdout.trim() : null,
  }
})
