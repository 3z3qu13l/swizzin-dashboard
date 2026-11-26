import { useMemo } from 'react'
import { Activity, Cpu, Fan, HardDrive, ShieldAlert, ShieldCheck, Thermometer } from 'lucide-react'
import type { EChartsCoreOption } from 'echarts/core'
import { useFail2ban, useHardware, useSmart } from '@/lib/queries'
import { serverTime, type Hardware as HardwareData } from '@/lib/api'
import { cn } from '@/lib/format'
import { EChart } from '@/components/charts'
import { useThemeColors } from '@/lib/hooks'
import { Badge, Bar, Card, CardHead, Empty, ErrorNote, Spinner } from '@/components/ui'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-2 first:border-t-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  )
}

export function Hardware() {
  const q = useHardware()
  if (q.isPending)
    return (
      <Card>
        <Spinner />
      </Card>
    )
  if (q.error)
    return (
      <Card>
        <ErrorNote error={q.error} />
      </Card>
    )
  const { platform: p, sensors } = q.data
  const temps = sensors.filter((s) => s.kind === 'temp')
  const fans = sensors.filter((s) => s.kind === 'fan')
  const vuln = p.vulnerabilities
  const count = (s: string) => vuln.filter((v) => v.state === s).length
  const vm = p.virtualization !== 'none'
  return (
    <Card>
      <CardHead icon={<Cpu className="size-4" />} title="Hardware" hint={vm ? `Virtual machine (${p.virtualization})` : 'Physical server'} />
      <div className="grid gap-6 px-5 pb-5 md:grid-cols-3">
        <dl>
          <Row label="Maker">{p.vendor ?? '—'}</Row>
          <Row label="Model">{p.product ?? '—'}</Row>
          <Row label="Board">{p.board ?? '—'}</Row>
          <Row label="BIOS">
            {p.bios ?? '—'}
            {p.biosDate && <span className="block text-xs text-muted">{p.biosDate}</span>}
          </Row>
          {p.governor && <Row label="CPU governor">{p.governor}</Row>}
        </dl>
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted">
            <Thermometer className="size-3.5" /> Temperatures
          </h3>
          {temps.length === 0 ? (
            <p className="text-sm text-muted">{vm ? 'A virtual machine has no temperature sensors.' : 'No sensor found. Installing lm-sensors can help.'}</p>
          ) : (
            <ul className="space-y-2">
              {temps.slice(0, 8).map((t) => {
                const max = t.max ?? 100
                return (
                  <li key={`${t.chip}-${t.label}`}>
                    <div className="flex justify-between text-sm">
                      <span className="truncate">
                        {t.label} <span className="text-xs text-muted">{t.chip}</span>
                      </span>
                      <span className={cn(t.value >= max * 0.9 ? 'text-danger' : t.value >= max * 0.75 ? 'text-warn' : '')}>{t.value.toFixed(0)}°C</span>
                    </div>
                    <Bar value={(100 * t.value) / max} className="mt-1" color="bg-info" />
                  </li>
                )
              })}
            </ul>
          )}
          {fans.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {fans.map((f) => (
                <li key={`${f.chip}-${f.label}`} className="flex items-center gap-2">
                  <Fan className="size-3.5 text-muted" />
                  <span className="flex-1">{f.label}</span>
                  <span>{f.value} rpm</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted">
            <ShieldCheck className="size-3.5" /> CPU vulnerabilities
          </h3>
          {vuln.length === 0 ? (
            <p className="text-sm text-muted">The kernel does not report them.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge tone={count('vulnerable') ? 'red' : 'green'}>{count('vulnerable')} vulnerable</Badge>
                <Badge tone="blue">{count('mitigated')} mitigated</Badge>
                <Badge>{count('not-affected')} not affected</Badge>
              </div>
              {count('vulnerable') > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-danger">
                  {vuln
                    .filter((v) => v.state === 'vulnerable')
                    .map((v) => (
                      <li key={v.name}>{v.name.replaceAll('_', ' ')}</li>
                    ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
      <CpuHealth health={q.data.health} />
    </Card>
  )
}

const notHere = <span className="text-muted">Not available on this machine</span>

/** counters since boot; a source the machine lacks says so, never a green "none" */
function CpuHealth({ health: h }: { health: HardwareData['health'] }) {
  const t = h.throttle
  const ecc = h.ecc
  return (
    <div className="border-t border-line px-5 py-4">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted">
        <Activity className="size-3.5" /> CPU and memory health, since the last boot
      </h3>
      <dl className="grid gap-x-6 sm:grid-cols-2 sm:[&>div:nth-child(2)]:border-t-0">
        <Row label="CPU cores">
          {!h.cpus ? (
            notHere
          ) : h.cpus.offline.length ? (
            <>
              <Badge tone="amber">{h.cpus.offline.length} offline</Badge>
              <span className="block text-xs text-muted">CPU {h.cpus.offline.join(', ')}</span>
            </>
          ) : (
            <Badge tone="green">all {h.cpus.online} online</Badge>
          )}
        </Row>
        <Row label="Thermal throttling">
          {!t ? (
            notHere
          ) : t.core + t.package === 0 ? (
            <Badge tone="green">never</Badge>
          ) : (
            <>
              <Badge tone="amber">
                {t.core} core, {t.package} package events
              </Badge>
              <span className="block text-xs text-muted">
                {t.throttledCores} core{t.throttledCores === 1 ? '' : 's'} slowed down to cool off
              </span>
            </>
          )}
        </Row>
        <Row label="ECC memory errors">
          {!ecc ? (
            notHere
          ) : ecc.uncorrected ? (
            <Badge tone="red">
              {ecc.uncorrected} uncorrected, {ecc.corrected} corrected
            </Badge>
          ) : ecc.corrected ? (
            <Badge tone="amber">{ecc.corrected} corrected</Badge>
          ) : (
            <Badge tone="green">none</Badge>
          )}
        </Row>
        <Row label="CPU microcode">
          {h.microcode.length === 0 ? (
            notHere
          ) : h.microcode.length === 1 ? (
            <span className="font-mono">{h.microcode[0]}</span>
          ) : (
            <>
              <Badge tone="amber">differs between CPUs</Badge>
              <span className="block font-mono text-xs text-muted">{h.microcode.join(', ')}</span>
            </>
          )}
        </Row>
      </dl>
    </div>
  )
}

const raidTone = { healthy: 'green', syncing: 'blue', rebuilding: 'amber', degraded: 'red' } as const

export function Disks() {
  const hw = useHardware()
  const smart = useSmart()
  const arrays = hw.data?.raid.arrays ?? []
  const disks = smart.data?.disks ?? []
  if (!arrays.length && !disks.length && !smart.isPending) {
    return (
      <Card>
        <CardHead icon={<HardDrive className="size-4" />} title="Disk health" />
        <Empty title="No disk health data">
          {smart.data?.available === false ? 'Install smartmontools to read the SMART status of your disks.' : 'Virtual disks do not report SMART data.'}
        </Empty>
      </Card>
    )
  }
  return (
    <Card>
      <CardHead
        icon={<HardDrive className="size-4" />}
        title="Disk health"
        hint={arrays.length ? `${arrays.length} software RAID array${arrays.length > 1 ? 's' : ''}` : 'SMART status'}
      />
      <div className="space-y-4 px-5 pb-5">
        {arrays.map((a) => (
          <div key={a.name} className="rounded-lg border border-line p-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-semibold">{a.name}</p>
              <Badge>{a.level.toUpperCase()}</Badge>
              <Badge tone={raidTone[a.health]}>{a.health}</Badge>
              <span className="ml-auto text-xs text-muted">
                {a.up} of {a.total} disks up{a.mount ? `, mounted on ${a.mount}` : ''}
              </span>
            </div>
            {a.progress && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-muted">
                  <span>
                    {a.progress.action} {a.progress.percent}%
                  </span>
                  <span>
                    {a.progress.finish} left at {a.progress.speed}
                  </span>
                </div>
                <Bar value={a.progress.percent} className="mt-1" color="bg-info" />
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {a.devices.map((d) => (
                <Badge key={d.name} tone={d.state === 'faulty' ? 'red' : d.state === 'spare' ? 'blue' : 'grey'}>
                  {d.name} {d.state !== 'active' && d.state}
                </Badge>
              ))}
            </div>
          </div>
        ))}
        {disks.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2 font-medium">Disk</th>
                  <th className="font-medium">SMART</th>
                  <th className="font-medium">Temperature</th>
                  <th className="font-medium">Powered on</th>
                  <th className="font-medium">Reallocated sectors</th>
                </tr>
              </thead>
              <tbody>
                {disks.map((d) => (
                  <tr key={d.device} className="border-t border-line">
                    <td className="py-2">
                      <span className="font-mono text-xs">{d.device}</span>
                      <span className="block text-xs text-muted">{d.model ?? ''}</span>
                    </td>
                    <td>{d.passed == null ? <Badge>unknown</Badge> : d.passed ? <Badge tone="green">passed</Badge> : <Badge tone="red">failing</Badge>}</td>
                    <td>{d.temperature != null ? `${d.temperature}°C` : '—'}</td>
                    <td>{d.power_on_hours != null ? `${(d.power_on_hours / 8766).toFixed(1)} years` : '—'}</td>
                    <td className={cn(d.reallocated ? 'text-warn' : '')}>{d.reallocated ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  )
}

export function Fail2ban() {
  const q = useFail2ban()
  const c = useThemeColors()
  const data = q.data
  // the 7 days end when the data was read, which keeps the render pure
  const until = q.dataUpdatedAt
  const week = useMemo(() => (data?.events ?? []).map((e) => ({ ...e, at: serverTime(e.at) })).filter((e) => e.at >= until - 7 * 86400_000), [data, until])
  const option = useMemo<EChartsCoreOption>(() => {
    const days: string[] = []
    const dayOf = (ms: number) => new Date(ms).toLocaleDateString('en-CA')
    for (let i = 6; i >= 0; i--) days.push(dayOf(until - i * 86400_000))
    const counts = days.map((d) => week.filter((e) => dayOf(e.at) === d).length)
    return {
      animation: false,
      grid: { left: 4, right: 4, top: 8, bottom: 4, containLabel: true },
      tooltip: { trigger: 'axis', backgroundColor: c.surface, borderColor: c.line, textStyle: { color: c.text, fontSize: 12 } },
      xAxis: { type: 'category', data: days.map((d) => d.slice(5)), axisLine: { lineStyle: { color: c.line } }, axisLabel: { color: c.muted, fontSize: 11 } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: c.muted, fontSize: 11 }, splitLine: { lineStyle: { color: c.line, opacity: 0.5 } } },
      series: [{ name: 'Bans', type: 'bar', data: counts, itemStyle: { color: c.danger, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 26 }],
    }
  }, [week, c, until])

  if (q.isPending)
    return (
      <Card>
        <Spinner />
      </Card>
    )
  if (q.error)
    return (
      <Card>
        <ErrorNote error={q.error} />
      </Card>
    )
  if (!data?.available) {
    return (
      <Card>
        <CardHead icon={<ShieldAlert className="size-4" />} title="Fail2Ban" />
        <Empty title="Fail2Ban is not running">It blocks addresses that keep failing to log in. Install it with apt install fail2ban.</Empty>
      </Card>
    )
  }
  const jails = data.jails ?? []
  const bannedNow = jails.reduce((a, j) => a + j.banned.length, 0)
  const ips = new Set(week.map((e) => e.ip))
  const byJail = new Map<string, number>()
  const byIp = new Map<string, { n: number; jail: string }>()
  for (const e of week) {
    byJail.set(e.jail, (byJail.get(e.jail) ?? 0) + 1)
    const x = byIp.get(e.ip) ?? { n: 0, jail: e.jail }
    x.n++
    byIp.set(e.ip, x)
  }
  const busiest = [...byJail].sort((a, b) => b[1] - a[1])[0]
  const top = [...byIp].sort((a, b) => b[1].n - a[1].n).slice(0, 8)
  const stats = [
    { label: 'Blocked right now', value: bannedNow },
    { label: 'Bans in 7 days', value: week.length },
    { label: 'Addresses in 7 days', value: ips.size },
    { label: 'Busiest jail', value: busiest ? busiest[0] : '—' },
  ]
  return (
    <Card>
      <CardHead
        icon={<ShieldAlert className="size-4" />}
        title="Fail2Ban"
        hint={`${jails.length} jail${jails.length === 1 ? '' : 's'}: ${jails.map((j) => j.jail).join(', ')}`}
      />
      <div className="grid grid-cols-2 gap-3 px-5 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-line bg-surface-2/40 px-4 py-3">
            <p className="text-2xl font-semibold">{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 px-5 py-5 lg:grid-cols-2">
        <figure>
          <figcaption className="mb-1 text-xs font-medium text-muted">Bans per day</figcaption>
          <EChart option={option} className="h-48" />
        </figure>
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted">Most blocked addresses, 7 days</h3>
          {top.length === 0 ? (
            <p className="text-sm text-muted">No ban in the last 7 days.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {top.map(([ip, x]) => (
                  <tr key={ip} className="border-t border-line first:border-t-0">
                    <td className="py-1.5 font-mono text-xs">{ip}</td>
                    <td className="text-xs text-muted">{x.jail}</td>
                    <td className="text-right">{x.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {bannedNow > 0 && (
        <div className="border-t border-line px-5 py-4">
          <h3 className="mb-2 text-xs font-medium text-muted">Blocked right now</h3>
          <div className="flex flex-wrap gap-2">
            {jails.flatMap((j) =>
              j.banned.map((ip) => (
                <Badge key={`${j.jail}-${ip}`} tone="red">
                  <span className="font-mono">{ip}</span> <span className="opacity-70">{j.jail}</span>
                </Badge>
              )),
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
