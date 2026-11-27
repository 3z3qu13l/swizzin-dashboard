// Pure parsers of what the system prints: no I/O here, so the tests can feed them samples.

export interface UnitState {
  unit: string
  user: string | null
  active: string
  sub: string
  enabled: string
}

export type Status = 'running' | 'partial' | 'stopped' | 'failed' | 'none'

/** `systemctl show --property=Id,ActiveState,SubState,UnitFileState,LoadState unit...` */
export function parseSystemctlShow(text: string): Map<string, UnitState> {
  const out = new Map<string, UnitState>()
  for (const block of text.split('\n\n')) {
    const p: Record<string, string> = {}
    for (const l of block.split('\n')) {
      const i = l.indexOf('=')
      if (i > 0) p[l.slice(0, i)] = l.slice(i + 1)
    }
    if (!p.Id || p.LoadState === 'not-found') continue
    const name = p.Id.replace(/\.service$/, '')
    const at = name.indexOf('@')
    out.set(name, { unit: name, user: at >= 0 ? name.slice(at + 1) : null, active: p.ActiveState, sub: p.SubState, enabled: p.UnitFileState })
  }
  return out
}

/** one status for all the units of an app */
export function statusOf(units: UnitState[]): Status {
  if (!units.length) return 'none'
  const running = units.filter((u) => u.active === 'active' || u.active === 'activating' || u.active === 'reloading').length
  if (running === units.length) return 'running'
  if (units.some((u) => u.active === 'failed')) return running ? 'partial' : 'failed'
  return running ? 'partial' : 'stopped'
}

/** a unit of the catalog: `name`, or `name@user` for a per-user template `name@` */
export function allowedUnit(units: string[], unit: string): boolean {
  return units.some((u) => (u.endsWith('@') ? unit.startsWith(u) && /^[a-z][a-z0-9_.-]*$/.test(unit.slice(u.length)) : unit === u))
}

/** the version in a program's output: the regex's first group, or the first line */
export function firstMatch(text: string, re?: string): string | null {
  if (!re) return text.trim().split('\n')[0]?.trim() || null
  return new RegExp(re, 'm').exec(text)?.[1] ?? null
}

export interface AptPackage {
  name: string
  origin: string
  version: string
  from: string
  security: boolean
}

/** `apt list --upgradable` */
export function parseAptList(text: string): AptPackage[] {
  return text
    .split('\n')
    .map((l) => /^([^/\s]+)\/(\S+)\s+(\S+)\s+\S+\s+\[upgradable from: ([^\]]+)\]/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ name: m[1], origin: m[2], version: m[3], from: m[4], security: /security/.test(m[2]) }))
}

export interface RaidArray {
  name: string
  state: string
  level: string
  mount: string | null
  devices: { name: string; state: 'active' | 'faulty' | 'spare' }[]
  total: number
  up: number
  health: 'healthy' | 'degraded' | 'rebuilding' | 'syncing'
  progress: { action: string; percent: number; finish: string; speed: string } | null
}

/** `/proc/mdstat`, with `/proc/mounts` for where each array is mounted */
export function parseMdstat(text: string, mounts: string): RaidArray[] {
  const arrays: RaidArray[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = /^(md\w+)\s*:\s*(\w+)\s+(?:\(\w+\)\s+)?(raid\d+|linear)\s+(.*)$/.exec(lines[i])
    if (!m) continue
    const devices = m[4]
      .split(/\s+/)
      .map((d) => /^(\w+)\[\d+\](\((\w)\))?/.exec(d))
      .filter((x): x is RegExpExecArray => !!x)
      .map((x) => ({ name: x[1], state: x[3] === 'F' ? ('faulty' as const) : x[3] === 'S' ? ('spare' as const) : ('active' as const) }))
    // the lines of this array, up to the next blank line
    const block: string[] = []
    for (let j = i + 1; j < lines.length && lines[j].trim(); j++) block.push(lines[j])
    const counts = /\[(\d+)\/(\d+)\]/.exec(block.join('\n'))
    const progress = /(recovery|resync|reshape|check)\s*=\s*([\d.]+)%.*?finish=([\d.]+min).*?speed=(\S+)/.exec(block.join('\n'))
    const total = counts ? Number(counts[1]) : devices.length
    const up = counts ? Number(counts[2]) : devices.length
    const mount =
      mounts
        .split('\n')
        .find((l) => l.startsWith(`/dev/${m[1]} `))
        ?.split(' ')[1] ?? null
    arrays.push({
      name: m[1],
      state: m[2],
      level: m[3],
      mount,
      devices,
      total,
      up,
      health: up < total ? (progress ? 'rebuilding' : 'degraded') : progress ? 'syncing' : 'healthy',
      progress: progress ? { action: progress[1], percent: Number(progress[2]), finish: progress[3], speed: progress[4] } : null,
    })
  }
  return arrays
}

/**
 * The line a job writes when box ends: its exit code, and whether the app's lock file is
 * there. box prints its own errors but often exits 0, so both must agree. null: still running.
 */
export function jobResult(log: string, kind: string): { state: 'success' | 'failed'; exitCode: number } | null {
  const end = /\[swizdash\] exit (\d+) lock ([01])\s*$/.exec(log)
  if (!end) return null
  const exitCode = Number(end[1])
  const locked = end[2] === '1'
  return { state: exitCode === 0 && (kind === 'install' ? locked : !locked) ? 'success' : 'failed', exitCode }
}

/** `git ls-remote <url> <ref>`: the commit of that ref, null when the answer has none */
export function parseLsRemote(text: string, ref: string): string | null {
  for (const l of text.split('\n')) {
    const [hash, name] = l.trim().split(/\s+/)
    if (name === ref && /^[0-9a-f]{40,64}$/.test(hash)) return hash
  }
  return null
}

/**
 * -1, 0 or 1 for two versions like `0.1.2`, `v0.1.10` or `0.2.0-rc1` (a pre-release comes before
 * its release), null when one is not a version
 */
export function compareVersions(a: string, b: string): number | null {
  const parse = (v: string) => {
    const m = /^v?(\d+(?:\.\d+)*)(?:-([\w.]+))?$/.exec(v.trim())
    return m ? { n: m[1].split('.').map(Number), pre: m[2] ?? null } : null
  }
  const x = parse(a)
  const y = parse(b)
  if (!x || !y) return null
  for (let i = 0; i < Math.max(x.n.length, y.n.length); i++) {
    const d = (x.n[i] ?? 0) - (y.n[i] ?? 0)
    if (d) return Math.sign(d)
  }
  if (x.pre === y.pre) return 0
  if (!x.pre) return 1
  if (!y.pre) return -1
  return Math.sign(x.pre.localeCompare(y.pre, 'en', { numeric: true }))
}

/**
 * the version number in a release tag or a version probe: `v5.3.27`, `release_3.37.1`, `5.1.3`, or
 * `2.19.1-16-ga125cf08` from git describe (commits after the release are not a newer release)
 */
export function versionNumber(text: string): string | null {
  return /\d+(?:\.\d+)+/.exec(text)?.[0] ?? null
}

/** `apt-cache policy <package>` in the C locale: installed and candidate versions, null when none */
export function parseAptPolicy(text: string): { installed: string | null; candidate: string | null } {
  const field = (name: string) => {
    const v = new RegExp(`^\\s*${name}:\\s*(\\S+)`, 'm').exec(text)?.[1]
    return v && v !== '(none)' ? v : null
  }
  return { installed: field('Installed'), candidate: field('Candidate') }
}

/** a kernel CPU list like `0-3,6,8-9` (`/sys/devices/system/cpu/online`) */
export function parseCpuList(text: string): number[] {
  const out: number[] = []
  for (const part of text.trim().split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim())
    if (!m) continue
    for (let i = Number(m[1]); i <= Number(m[2] ?? m[1]); i++) out.push(i)
  }
  return out
}

/**
 * The `microcode` lines of `/proc/cpuinfo`, one entry per distinct value: CPUs that disagree
 * point to a partial update. In a virtual machine (the `hypervisor` flag) the value is made up
 * by the hypervisor (0xffffffff on VMware, often 0x1 on KVM) and the host loads the real one.
 */
export function parseMicrocode(cpuinfo: string): string[] {
  if (/^flags\s*:.*\bhypervisor\b/m.test(cpuinfo)) return []
  const values = new Set<string>()
  for (const m of cpuinfo.matchAll(/^microcode\s*:\s*(\S+)/gm)) values.add(m[1].toLowerCase())
  return [...values]
}

/**
 * CPUs present but not online, and why. Siblings switched off with SMT (nosmt, or
 * /sys/devices/system/cpu/smt/control) and CPUs left down by the maxcpus= boot option are a
 * choice, not a fault: reason says so. (`notsupported` means the CPU has no SMT, so no sibling.)
 */
export function offlineCpus(present: number[], online: number[], smtControl: string, cmdline: string): { offline: number[]; reason: 'smt' | 'maxcpus' | null } {
  const offline = present.filter((n) => !online.includes(n))
  const reason = !offline.length ? null : /^(off|forceoff)$/.test(smtControl.trim()) ? 'smt' : /(^|\s)maxcpus=\d+/.test(cmdline) ? 'maxcpus' : null
  return { offline, reason }
}

export interface ThrottleCpu {
  package: number
  core: number
  coreCount: number | null
  packageCount: number | null
}

/**
 * Thermal throttling events since boot, from each CPU's `thermal_throttle` folder. Threads of
 * one core share a counter, and so do the cores of one package: each is counted once.
 */
export function throttleTotals(cpus: ThrottleCpu[]): { core: number; package: number; throttledCores: number } | null {
  if (!cpus.some((c) => c.coreCount != null || c.packageCount != null)) return null
  const cores = new Map<string, number>()
  const packages = new Map<number, number>()
  for (const c of cpus) {
    if (c.coreCount != null) cores.set(`${c.package}-${c.core}`, c.coreCount)
    if (c.packageCount != null) packages.set(c.package, c.packageCount)
  }
  const sum = (m: Map<unknown, number>) => [...m.values()].reduce((a, b) => a + b, 0)
  return { core: sum(cores), package: sum(packages), throttledCores: [...cores.values()].filter((n) => n > 0).length }
}
