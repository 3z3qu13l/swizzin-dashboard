import { open, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from './config.ts'
import { defaultIface } from './system.ts'
import { cached, readText, run } from './util.ts'
import { jobResult, parseAptList, parseMdstat } from './parse.ts'

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
