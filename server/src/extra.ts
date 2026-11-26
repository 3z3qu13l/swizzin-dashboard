import { open, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from './config.ts'
import { defaultIface } from './system.ts'
import { cached, keyed, readText, run } from './util.ts'
import { compareVersions, jobResult, parseAptList, parseCpuList, parseLsRemote, parseMdstat, parseMicrocode, throttleTotals } from './parse.ts'

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

const swizzinDir = '/etc/swizzin'
// GitHub allows 60 unauthenticated API calls an hour per address: a few hours is fresh enough
const remoteTtl = 3 * 3600_000
const swizdashRepo = '3z3qu13l/swizzin-dashboard'

export interface SoftwareUpdate {
  name: 'swizzin' | 'swizdash'
  installed: string | null
  /** null: the check failed (offline, rate limit) */
  available: string | null
  state: 'current' | 'update' | 'unknown'
  checkedAt: number | null
  command: string
}

const swizzinGit = (args: string[]) => run('git', ['-c', 'safe.directory=*', '-C', swizzinDir, ...args])

// key: "<url> <ref>". A failure is not cached, the next visit tries again.
const remoteHead = keyed(remoteTtl, async (key) => {
  const [url, ref] = key.split(' ')
  // a remote that asks for a password fails at once instead of waiting for the timeout
  const r = await run('git', ['ls-remote', '--', url, ref], 20_000, { GIT_TERMINAL_PROMPT: '0' })
  const hash = r.ok ? parseLsRemote(r.stdout, ref) : null
  if (!hash) throw new Error(`git ls-remote ${url} failed`)
  return { hash, at: Date.now() }
})

const latestRelease = cached(remoteTtl, async () => {
  const res = await fetch(`https://api.github.com/repos/${swizdashRepo}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'swizdash' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  const tag = ((await res.json()) as { tag_name?: unknown }).tag_name
  if (typeof tag !== 'string') throw new Error('No release tag')
  return { version: tag.replace(/^v/, ''), at: Date.now() }
})

/** /etc/swizzin against the branch `box update` resets it to, without touching /etc/swizzin */
async function swizzinUpdate(): Promise<SoftwareUpdate> {
  const [head, origin, branch] = await Promise.all([
    swizzinGit(['log', '-1', '--format=%H %cs']),
    swizzinGit(['config', '--get', 'remote.origin.url']),
    swizzinGit(['symbolic-ref', '-q', '--short', 'HEAD']),
  ])
  const [hash, date] = head.ok ? head.stdout.trim().split(' ') : []
  const url = origin.stdout.trim()
  // box update follows origin/develop on the develop branch, origin/master otherwise (a detached HEAD too)
  const ref = `refs/heads/${branch.stdout.trim() === 'develop' ? 'develop' : 'master'}`
  // only https: git runs other transports (ssh, ext) as commands
  const remote = hash && /^https:\/\/\S+$/.test(url) ? await remoteHead(`${url} ${ref}`).catch(() => null) : null
  return {
    name: 'swizzin',
    installed: hash ? `${hash.slice(0, 7)} ${date}` : null,
    available: remote ? remote.hash.slice(0, 7) : null,
    state: !remote ? 'unknown' : remote.hash === hash ? 'current' : 'update',
    checkedAt: remote?.at ?? null,
    command: 'box update',
  }
}

/** this swizdash against the latest release, and the command that installs it */
async function swizdashUpdate(version: string): Promise<SoftwareUpdate> {
  const latest = await latestRelease().catch(() => null)
  const cmp = latest ? compareVersions(latest.version, version) : null
  return {
    name: 'swizdash',
    installed: version,
    available: latest?.version ?? null,
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

/** world-readable sysfs and procfs, no root needed. null: the machine does not report it. */
export async function cpuHealth() {
  const online = parseCpuList((await readText(`${cpuDir}/online`)) ?? '')
  const present = parseCpuList((await readText(`${cpuDir}/present`)) ?? '')
  // the `offline` file also lists CPUs that could be plugged in but are not there
  const offline = present.filter((n) => !online.includes(n))
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
    cpus: present.length ? { online: online.length, present: present.length, offline } : null,
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
