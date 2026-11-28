// Everything else the pages show: traffic, updates, RAID, platform (DMI, virtualization, CPU vulnerabilities),
// CPU health and install or removal jobs.

import { lstat, open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from './config.ts'
import { defaultIface } from './system.ts'
import { cached, keyed, readText, run, swizzinDir, swizzinGit } from './util.ts'
import { appVersion, boxScripts, catalog, installedIds, type CatalogApp } from './apps.ts'
import {
  compareVersions,
  jobResult,
  offlineCpus,
  parseAptList,
  parseAptPolicy,
  parseCpuList,
  parseLsRemote,
  parseMdstat,
  parseMicrocode,
  releaseTag,
  throttleTotals,
  versionNumber,
} from './parse.ts'

// ---------- bandwidth (vnStat) ----------

interface VnTraffic {
  rx: number
  tx: number
  date?: { year: number; month: number; day?: number }
}

export const bandwidth = cached(60_000, async () => {
  const iface = await defaultIface()
  if (!iface) return { available: false as const }
  const r = await run('vnstat', ['-i', iface, '--json'])
  if (!r.ok) return { available: false as const }
  try {
    const t = JSON.parse(r.stdout).interfaces?.[0]?.traffic ?? {}
    const day = (t.day ?? t.days ?? []) as VnTraffic[]
    const month = (t.month ?? t.months ?? []) as VnTraffic[]
    const pick = (x?: VnTraffic) => ({ rx: x?.rx ?? 0, tx: x?.tx ?? 0 })
    return {
      available: true as const,
      iface,
      today: pick(day.at(-1)),
      month: pick(month.at(-1)),
      total: pick(t.total),
      days: day
        .slice(-30)
        .map((d) => ({ date: `${d.date?.year}-${String(d.date?.month).padStart(2, '0')}-${String(d.date?.day).padStart(2, '0')}`, rx: d.rx, tx: d.tx })),
    }
  } catch {
    return { available: false as const }
  }
})

// ---------- apt ----------

export const updates = cached(30 * 60_000, async () => {
  const r = await run('apt', ['list', '--upgradable'], 60_000)
  return { checkedAt: Date.now(), packages: parseAptList(r.stdout) }
})

// ---------- swizzin and swizdash ----------

// a good answer is kept a few hours, a failure 10 minutes so a dead network does not slow every visit
const remoteTtl = (v: unknown) => (v ? 3 * 3600_000 : 10 * 60_000)
const remoteTimeout = 8_000
const swizdashRepo = '3z3qu13l/swizzin-dashboard'

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

// key: "<url> <ref>"
const remoteHead = keyed(remoteTtl, async (key) => {
  const [url, ref] = key.split(' ')
  // a remote that asks for a password fails at once instead of waiting for the timeout
  const r = await run('git', ['ls-remote', '--', url, ref], remoteTimeout, { GIT_TERMINAL_PROMPT: '0' })
  const hash = r.ok ? parseLsRemote(r.stdout, ref) : null
  return hash ? { hash, at: Date.now() } : null
})

/**
 * the tag of a repository's latest release, read where github.com/<repo>/releases/latest redirects to, as
 * swizzin's github_latest_version does. The GitHub API allows 60 calls an hour per address without an account,
 * often shared on seedbox hosts; the web site's limits are far looser. null: no release, or GitHub out of reach.
 */
async function latestReleaseTag(repo: string): Promise<string | null> {
  let url = `https://github.com/${repo}/releases/latest`
  try {
    // a renamed repository first redirects to its new name's releases/latest: followed twice at most
    for (let hop = 0; hop < 3; hop++) {
      const res = await fetch(url, { method: 'HEAD', redirect: 'manual', headers: { 'user-agent': 'swizdash' }, signal: AbortSignal.timeout(remoteTimeout) })
      const location = res.headers.get('location')
      const tag = releaseTag(location)
      if (tag || !location) return tag
      const next = new URL(location, url)
      if (next.origin !== 'https://github.com' || !next.pathname.endsWith('/releases/latest')) return null
      url = next.href
    }
    return null
  } catch {
    return null
  }
}

const latestRelease = cached(remoteTtl, async () => {
  const tag = await latestReleaseTag(swizdashRepo)
  const version = tag ? versionNumber(tag) : null
  return version ? { version, at: Date.now() } : null
})

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  )

/** /etc/swizzin against the branch `box update` resets it to, without touching /etc/swizzin */
async function swizzinUpdate(): Promise<SoftwareUpdate> {
  const [head, origin, current] = await Promise.all([
    swizzinGit(['log', '-1', '--format=%H %cs']),
    swizzinGit(['config', '--get', 'remote.origin.url']),
    swizzinGit(['symbolic-ref', '-q', '--short', 'HEAD']),
  ])
  const [hash, date] = head.ok ? head.stdout.trim().split(' ') : []
  const url = origin.stdout.trim()
  // box update follows origin/develop on the develop branch, origin/master otherwise (a detached HEAD too)
  const branch = current.stdout.trim() === 'develop' ? 'develop' : 'master'
  const row = { name: 'swizzin' as const, installed: hash ? `${hash.slice(0, 7)} ${date}` : null, branch, command: 'box update' }
  // box update does not touch a linked /etc/swizzin, nor one with a .dev.lock
  const manual =
    (await lstat(swizzinDir).then(
      (s) => s.isSymbolicLink(),
      () => false,
    )) || (await exists(`${swizzinDir}/.dev.lock`))
  if (manual) return { ...row, available: null, state: 'manual', checkedAt: null }
  // only https: git runs other transports (ssh, ext) as commands
  const remote = hash && /^https:\/\/\S+$/.test(url) ? await remoteHead(`${url} refs/heads/${branch}`) : null
  return {
    ...row,
    available: remote ? remote.hash.slice(0, 7) : null,
    state: !remote ? 'unknown' : remote.hash === hash ? 'current' : 'update',
    checkedAt: remote?.at ?? null,
  }
}

/** this swizdash against the latest release, and the command that installs it */
async function swizdashUpdate(version: string): Promise<SoftwareUpdate> {
  const latest = await latestRelease()
  const cmp = latest ? compareVersions(latest.version, version) : null
  return {
    name: 'swizdash',
    installed: version,
    available: latest?.version ?? null,
    branch: null,
    state: cmp == null ? 'unknown' : cmp > 0 ? 'update' : 'current',
    checkedAt: latest?.at ?? null,
    // box installs the release swizzin pins, box update brings the newest pin. The pin itself
    // cannot be read here: box update makes /etc/swizzin/sources root-only.
    command: 'box update && box upgrade swizdash',
  }
}

export function softwareUpdates(version: string): Promise<SoftwareUpdate[]> {
  return Promise.all([swizzinUpdate(), swizdashUpdate(version)])
}

// ---------- installed apps ----------

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

// a release is checked every 6 hours, a failure again after 15 minutes
const releaseTtl = (v: unknown) => (v ? 6 * 3600_000 : 15 * 60_000)

// key: owner/repo, from the catalog only
const githubRelease = keyed(releaseTtl, async (repo) => {
  const tag = await latestReleaseTag(repo)
  const version = tag ? versionNumber(tag) : null
  return version ? { version, at: Date.now() } : null
})

// apt's own lists, refreshed by the system: no network here
const aptPolicy = keyed(30 * 60_000, async (pkg) => {
  const r = await run('apt-cache', ['policy', '--', pkg], 15_000)
  const p = parseAptPolicy(r.stdout)
  // a pin can make apt's candidate older than what is installed: only a newer one is an update
  const newer = p.installed && p.candidate ? (await run('dpkg', ['--compare-versions', p.candidate, 'gt', p.installed])).ok : false
  return { ...p, newer, at: Date.now() }
})

async function appUpdate(app: CatalogApp, upgrade: Set<string>): Promise<AppUpdate | null> {
  const row = { id: app.id, name: app.name }
  const pkg = app.latest?.apt ?? app.version?.dpkg
  // without a way to read the installed version there is nothing to compare: not shown, rather than never checked
  if (app.latest?.github && app.version) {
    const [probe, release] = await Promise.all([appVersion(app.id).catch(() => null), githubRelease(app.latest.github)])
    const installed = probe ? versionNumber(probe) : null
    const cmp = installed && release ? compareVersions(release.version, installed) : null
    return {
      ...row,
      source: 'github',
      installed,
      available: release?.version ?? null,
      state: cmp == null ? 'unknown' : cmp > 0 ? 'update' : 'current',
      checkedAt: release?.at ?? null,
      command: upgrade.has(app.id) ? `box upgrade ${app.id}` : null,
    }
  }
  if (pkg && !app.latest?.github) {
    const p = await aptPolicy(pkg)
    return {
      ...row,
      source: 'apt',
      installed: p.installed,
      available: p.candidate,
      state: !p.installed || !p.candidate ? 'unknown' : p.newer ? 'update' : 'current',
      checkedAt: p.at,
      command: `apt-get install --only-upgrade ${pkg}`,
    }
  }
  return null
}

/** installed apps whose newest version can be known, against what is installed */
export async function appUpdates(): Promise<AppUpdate[]> {
  // without the helper, only the box upgrade commands are missing
  const [installed, scripts] = await Promise.all([installedIds(), boxScripts().catch(() => ({ upgrade: new Set<string>() }))])
  // swizdash has its own row, next to swizzin
  const apps = catalog.apps.filter((a) => installed.has(a.id) && a.id !== 'swizdash')
  const rows = await Promise.all(apps.map((a) => appUpdate(a, scripts.upgrade)))
  return rows.filter((r): r is AppUpdate => r !== null)
}

// ---------- RAID ----------

export async function raid() {
  const text = await readText('/proc/mdstat')
  const arrays = text ? parseMdstat(text, (await readText('/proc/mounts')) ?? '') : []
  return { available: arrays.length > 0, arrays }
}

// ---------- platform ----------

export const platform = cached(3600_000, async () => {
  const dmi = async (f: string) => (await readText(`/sys/class/dmi/id/${f}`))?.trim() || null
  const virt = await run('systemd-detect-virt', [])
  const vulns: { name: string; state: string }[] = []
  try {
    const dir = '/sys/devices/system/cpu/vulnerabilities'
    for (const f of await readdir(dir)) {
      const t = ((await readText(join(dir, f))) ?? '').trim()
      vulns.push({
        name: f,
        state: /^Not affected/.test(t) ? 'not-affected' : /^Vulnerable/.test(t) ? 'vulnerable' : /^Mitigation/.test(t) ? 'mitigated' : 'unknown',
      })
    }
  } catch {
    // older kernels
  }
  const governor = (await readText('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor'))?.trim() ?? null
  return {
    virtualization: virt.stdout.trim() || 'none',
    vendor: await dmi('sys_vendor'),
    product: await dmi('product_name'),
    board: [await dmi('board_vendor'), await dmi('board_name')].filter(Boolean).join(' ') || null,
    bios: [await dmi('bios_vendor'), await dmi('bios_version')].filter(Boolean).join(' ') || null,
    biosDate: await dmi('bios_date'),
    governor,
    vulnerabilities: vulns,
  }
})

// ---------- CPU health: cores offline, thermal throttling, microcode, ECC memory ----------

const cpuDir = '/sys/devices/system/cpu'

async function readCount(path: string): Promise<number | null> {
  const t = (await readText(path))?.trim()
  return t && /^\d+$/.test(t) ? Number(t) : null
}

// lxcfs shows a container its own CPUs as online but leaves the host's as present
const inContainer = cached(3600_000, async () => (await run('systemd-detect-virt', ['--container'])).ok)

/** world-readable sysfs and procfs, no root needed. null: the machine does not report it. */
export async function cpuHealth() {
  const online = parseCpuList((await readText(`${cpuDir}/online`)) ?? '')
  const present = parseCpuList((await readText(`${cpuDir}/present`)) ?? '')
  // the `offline` file would also list CPUs that could be plugged in but are not there
  const off = offlineCpus(present, online, (await readText(`${cpuDir}/smt/control`)) ?? '', (await readText('/proc/cmdline')) ?? '')
  const cpus = await Promise.all(
    online.map(async (n) => ({
      package: (await readCount(`${cpuDir}/cpu${n}/topology/physical_package_id`)) ?? 0,
      core: (await readCount(`${cpuDir}/cpu${n}/topology/core_id`)) ?? n,
      coreCount: await readCount(`${cpuDir}/cpu${n}/thermal_throttle/core_throttle_count`),
      packageCount: await readCount(`${cpuDir}/cpu${n}/thermal_throttle/package_throttle_count`),
    })),
  )
  const edacDir = '/sys/devices/system/edac/mc'
  let controllers: string[] = []
  try {
    controllers = (await readdir(edacDir)).filter((d) => /^mc\d+$/.test(d))
  } catch {
    // no EDAC driver: no ECC memory, or a virtual machine
  }
  const counts = await Promise.all(
    controllers.map(async (mc) => ({ ce: (await readCount(`${edacDir}/${mc}/ce_count`)) ?? 0, ue: (await readCount(`${edacDir}/${mc}/ue_count`)) ?? 0 })),
  )
  return {
    cpus: present.length && !(await inContainer()) ? { online: online.length, present: present.length, ...off } : null,
    throttle: throttleTotals(cpus),
    microcode: parseMicrocode((await readText('/proc/cpuinfo')) ?? ''),
    ecc: controllers.length
      ? { controllers: controllers.length, corrected: counts.reduce((a, c) => a + c.ce, 0), uncorrected: counts.reduce((a, c) => a + c.ue, 0) }
      : null,
  }
}

// ---------- jobs (box install / remove) ----------

const jobsDir = () => config.jobsDir

export interface Job {
  id: string
  kind: string
  app: string
  startedAt: number
  state: 'running' | 'success' | 'failed'
  exitCode: number | null
}

/** last `bytes` of a file, without reading the rest */
async function tail(path: string, bytes: number): Promise<string> {
  let fh
  try {
    fh = await open(path, 'r')
    const { size } = await fh.stat()
    const len = Math.min(size, bytes)
    const buf = Buffer.alloc(len)
    await fh.read(buf, 0, len, size - len)
    return buf.toString('utf8')
  } catch {
    return ''
  } finally {
    await fh?.close()
  }
}

export async function readJob(id: string, withLog = false): Promise<(Job & { log?: string }) | null> {
  if (!/^\d+-(install|remove)-[a-z0-9_-]+$/.test(id)) return null
  const meta = await readText(join(jobsDir(), `${id}.job`))
  if (!meta) return null
  const [kind, app] = meta.trim().split(' ')
  const log = await tail(join(jobsDir(), `${id}.log`), withLog ? 200_000 : 256)
  const result = jobResult(log, kind)
  let state: Job['state'] = result?.state ?? 'running'
  if (!result) {
    const r = await run('systemctl', ['is-active', `swizdash-job-${id}.service`])
    if (!['active', 'activating'].includes(r.stdout.trim())) state = 'failed'
  }
  const exitCode = result?.exitCode ?? null
  const job: Job & { log?: string } = { id, kind, app, startedAt: Number(id.split('-')[0]) * 1000, state, exitCode }
  if (withLog) job.log = log.replace(/\[[0-9;?]*[A-Za-z]/g, '')
  return job
}

export async function listJobs(): Promise<Job[]> {
  let files: string[] = []
  try {
    files = await readdir(jobsDir())
  } catch {
    return []
  }
  const ids = files.filter((f) => f.endsWith('.job')).map((f) => f.slice(0, -4))
  const jobs = (await Promise.all(ids.map((id) => readJob(id)))).filter((j): j is Job => !!j)
  return jobs.sort((a, b) => b.startedAt - a.startedAt)
}
