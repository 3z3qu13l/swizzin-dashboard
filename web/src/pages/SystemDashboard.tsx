import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownUp, ClipboardCopy, Cpu, Database, HardDrive, MemoryStick, Package, Power, RefreshCw, Server } from 'lucide-react'
import { get, post, serverTime, type Meta } from '@/lib/api'
import { useBandwidth, useLive, useMeta, useSoftwareUpdates, useSummary, useUpdates } from '@/lib/queries'
import { ago, bytes, cn, duration, pct, rate } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { Badge, Bar, Button, Card, CardHead, Dialog, Empty, ErrorNote, Menu, MenuItem, Spinner } from '@/components/ui'
import { BandwidthChart, HistoryCharts } from './SystemCharts'
import { Disks, Fail2ban, Hardware } from './SystemHealth'

function Tile({
  icon,
  label,
  value,
  detail,
  percent,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
  percent?: number
  color?: string
}) {
  return (
    <Card className="px-5 py-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-0.5 truncate text-xs text-muted">{detail}</p>
      {percent != null && <Bar value={percent} className="mt-3" color={color} />}
    </Card>
  )
}

function Tiles() {
  const { live } = useLive()
  const s = useSummary()
  const bw = useBandwidth()
  const root = s.data?.disks[0]
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Tile
        icon={<Cpu className="size-4" />}
        label="CPU"
        value={pct(live?.cpu)}
        detail={live ? `Load ${live.load.map((l) => l.toFixed(2)).join(', ')}` : '—'}
        percent={live?.cpu}
        color="bg-cpu"
      />
      <Tile
        icon={<MemoryStick className="size-4" />}
        label="Memory"
        value={pct(live?.mem.percent)}
        detail={live ? `${bytes(live.mem.used)} of ${bytes(live.mem.total)}` : '—'}
        percent={live?.mem.percent}
        color="bg-mem"
      />
      <Tile
        icon={<HardDrive className="size-4" />}
        label="Disk"
        value={pct(root?.percent)}
        detail={root ? `${bytes(root.used)} of ${bytes(root.total)} on ${root.mount}` : '—'}
        percent={root?.percent}
        color="bg-disk"
      />
      <Tile
        icon={<ArrowDownUp className="size-4" />}
        label="Swap"
        value={live?.swap.total ? pct(live.swap.percent) : 'Off'}
        detail={live?.swap.total ? `${bytes(live.swap.used)} of ${bytes(live.swap.total)}` : 'No swap configured'}
        percent={live?.swap.total ? live.swap.percent : undefined}
        color="bg-swap"
      />
      <Tile
        icon={<ArrowDownUp className="size-4" />}
        label="Today"
        value={bw.data?.available ? bytes((bw.data.today?.rx ?? 0) + (bw.data.today?.tx ?? 0)) : '—'}
        detail={bw.data?.available ? `↓ ${bytes(bw.data.today?.rx)}  ↑ ${bytes(bw.data.today?.tx)}` : 'vnStat not available'}
      />
      <Tile
        icon={<ArrowDownUp className="size-4" />}
        label="This month"
        value={bw.data?.available ? bytes((bw.data.month?.rx ?? 0) + (bw.data.month?.tx ?? 0)) : '—'}
        detail={bw.data?.available ? `↓ ${bytes(bw.data.month?.rx)}  ↑ ${bytes(bw.data.month?.tx)}` : 'vnStat not available'}
      />
    </div>
  )
}

function Dl({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 pb-5 sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="mt-0.5 text-sm font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Details() {
  const { live } = useLive()
  const s = useSummary()
  const cpu = s.data?.cpu
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHead icon={<Cpu className="size-4" />} title="Processor" hint={cpu?.model ?? ' '} />
        <Dl
          rows={[
            ['Cores', cpu ? `${cpu.cores} cores, ${cpu.threads} threads` : '—'],
            ['Frequency', cpu?.freq ? `${(cpu.freq / 1000).toFixed(2)} GHz` : '—'],
            ['Temperature', cpu?.temp != null ? `${cpu.temp.toFixed(0)}°C` : '—'],
            ['Usage', pct(live?.cpu)],
            ['Waiting for disks', pct(live?.iowait)],
            ['Load 1, 5, 15 min', live ? live.load.map((l) => l.toFixed(2)).join(', ') : '—'],
          ]}
        />
      </Card>
      <Card>
        <CardHead icon={<MemoryStick className="size-4" />} title="Memory" hint={live ? `${bytes(live.mem.total)} installed` : ' '} />
        <Dl
          rows={[
            ['Used by apps', live ? bytes(live.mem.used) : '—'],
            ['Cache', live ? bytes(live.mem.cached) : '—'],
            ['Available', live ? bytes(live.mem.available) : '—'],
            ['Swap used', live?.swap.total ? `${bytes(live.swap.used)} of ${bytes(live.swap.total)}` : 'No swap'],
            ['Network now', live ? `↓ ${rate(live.net.rx)}  ↑ ${rate(live.net.tx)}` : '—'],
            ['Uptime', live ? duration(live.uptime) : '—'],
          ]}
        />
      </Card>
    </div>
  )
}

function SubHead({ title, checked }: { title: string; checked?: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted">
      <h3 className="font-semibold">{title}</h3>
      {checked && <p>{checked}</p>}
    </div>
  )
}

/** swizzin and swizdash against GitHub, apart from the apt list: GitHub can be slow or out of reach */
function Software() {
  const q = useSoftwareUpdates()
  const checked = q.data?.map((s) => s.checkedAt).filter((t): t is number => t != null)
  return (
    <div className="px-5 pb-3">
      <SubHead title="swizzin and swizdash" checked={checked?.length ? `Checked on GitHub ${ago(serverTime(Math.min(...checked)))}` : undefined} />
      {q.isPending ? (
        <p className="py-2 text-sm text-muted">Checking GitHub…</p>
      ) : q.error ? (
        <p className="py-2 text-sm text-muted">Could not check.</p>
      ) : (
        <ul>
          {q.data.map((s) => (
            <li key={s.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 text-sm first:border-t-0">
              <span className="flex-1 font-medium">{s.name}</span>
              <span className="text-xs text-muted">
                installed <span className="font-mono text-text">{s.installed ?? 'unknown'}</span>
              </span>
              {s.state === 'update' ? (
                <Badge tone="blue">{s.available} available</Badge>
              ) : s.state === 'current' ? (
                <Badge tone="green">up to date</Badge>
              ) : (
                <Badge>could not check</Badge>
              )}
              {s.state === 'update' && (
                <p className="w-full text-xs text-muted">
                  Update it over SSH with <code className="font-mono text-text">{s.command}</code>.
                  {s.name === 'swizdash' && ' box installs the release swizzin has checked, which can come a little after the release itself.'}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Updates() {
  const q = useUpdates()
  const pkgs = q.data?.packages ?? []
  const security = pkgs.filter((p) => p.security).length
  return (
    <Card>
      <CardHead
        icon={<Package className="size-4" />}
        title="System updates"
        hint="swizzin, swizdash and the system packages"
        right={
          pkgs.length > 0 ? (
            <Badge tone={security ? 'amber' : 'blue'}>
              {pkgs.length} pending{security ? `, ${security} security` : ''}
            </Badge>
          ) : null
        }
      />
      <Software />
      <div className="border-t border-line px-5 pt-3">
        <SubHead title="System packages" checked={q.data ? `Checked ${ago(serverTime(q.data.checkedAt))}` : undefined} />
      </div>
      {q.isPending ? (
        <Spinner />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : pkgs.length === 0 ? (
        <Empty title="Every system package is up to date" />
      ) : (
        <>
          <ul className="max-h-72 overflow-auto px-5">
            {pkgs.map((p) => (
              <li key={p.name} className="flex items-center gap-3 border-t border-line py-2 text-sm first:border-t-0">
                <span className="flex-1 truncate font-medium">{p.name}</span>
                {p.security && <Badge tone="amber">security</Badge>}
                <span className="hidden font-mono text-xs text-muted sm:inline">{p.version}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-5 py-3 text-xs text-muted">
            Apply them over SSH with <code className="font-mono text-text">box upgrade</code> for swizzin apps, or{' '}
            <code className="font-mono text-text">apt upgrade</code> for the system.
          </p>
        </>
      )}
    </Card>
  )
}

function Inventory() {
  const s = useSummary()
  const meta = useMeta()
  const { live } = useLive()
  const qc = useQueryClient()
  const stats = useQuery({
    queryKey: ['historyStats'],
    queryFn: () => get<{ raw: number; rollup: number; bytes: number }>('/api/history/stats'),
    refetchInterval: 60_000,
  })
  const [confirm, setConfirm] = useState(false)
  const clear = useMutation({
    mutationFn: () => post('/api/history/clear'),
    onSuccess: () => {
      setConfirm(false)
      void qc.invalidateQueries({ queryKey: ['history'] })
      void qc.invalidateQueries({ queryKey: ['historyStats'] })
    },
  })
  const o = s.data?.os
  return (
    <Card>
      <CardHead icon={<Server className="size-4" />} title="Server" hint={o?.hostname ?? ' '} />
      <Dl
        rows={[
          ['System', o?.os ?? '—'],
          ['Kernel', o?.kernel ?? '—'],
          ['Up for', live ? duration(live.uptime) : '—'],
          ['nginx', o?.nginx ?? '—'],
          ['Node.js', o?.node ?? '—'],
          ['swizzin', o?.swizzin ?? '—'],
          ['swizdash', meta.data?.version ?? '—'],
          ['Running since', meta.data ? ago(serverTime(meta.data.started)) : '—'],
          ['Signed in as', meta.data?.master ?? '—'],
        ]}
      />
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 text-sm">
        <Database className="size-4 text-muted" />
        <span className="flex-1 text-muted">
          History store: {stats.data ? `${(stats.data.raw + stats.data.rollup).toLocaleString()} points, ${bytes(stats.data.bytes)}` : '—'}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
          Clear history
        </Button>
      </div>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Clear the history?"
        description="The charts start again from now. The apps and their data are not touched."
      >
        {clear.error && <p className="mb-3 text-sm text-danger">{clear.error.message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
          <Button variant="danger" busy={clear.isPending} onClick={() => clear.mutate()}>
            Clear history
          </Button>
        </div>
      </Dialog>
    </Card>
  )
}

function PowerDialog({ action, onClose }: { action: 'reboot' | 'poweroff' | null; onClose: () => void }) {
  const [typed, setTyped] = useState('')
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: async () => {
      const before = await get<Meta>('/api/meta')
      await post('/api/system/power', { action, confirm: action })
      return before
    },
  })
  // a later boot time means the machine itself restarted, not only swizdash
  // (the time comes from the uptime, a second either way)
  const rebooted = (now?: Meta) => !!now && !!m.data && now.boot > m.data.boot + 5000
  const back = useQuery({
    queryKey: ['power', 'back'],
    queryFn: () => get<Meta>('/api/meta'),
    enabled: m.isSuccess && action === 'reboot',
    retry: false,
    gcTime: 0,
    refetchInterval: (q) => (rebooted(q.state.data) ? false : 3000),
  })
  const isBack = rebooted(back.data)
  const now = useNow(5000)
  const late = m.isSuccess && !isBack && now - m.submittedAt > 5 * 60_000
  useEffect(() => {
    if (!isBack) return
    // another swizdash version came up with the server: its page files have new names
    if (back.data?.version !== m.data?.version) window.location.reload()
    else void qc.invalidateQueries()
  }, [isBack, back.data, m.data, qc])
  const word = action ?? ''
  const label = action === 'reboot' ? 'Restart the server' : 'Shut down the server'
  return (
    <Dialog
      open={!!action}
      onOpenChange={(o) => !o && onClose()}
      title={`${label}?`}
      description={
        action === 'reboot'
          ? 'Every app stops for a few minutes, then starts again.'
          : 'Every app stops and the server stays off: you will need your host’s console to start it again.'
      }
    >
      {m.isSuccess ? (
        <div role="status">
          <p className="text-sm">
            {action === 'poweroff'
              ? 'The server shuts down in a few seconds.'
              : isBack
                ? 'The server is back up.'
                : late
                  ? 'The server is still not back after 5 minutes. Check it from your host’s console.'
                  : 'The server restarts in a few seconds. This window tells you when it is back up.'}
          </p>
          {(isBack || late) && (
            <div className="mt-4 flex justify-end">
              <Button autoFocus onClick={onClose}>
                Close
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <label className="block text-sm">
            Type <code className="font-mono text-danger">{word}</code> to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-2 h-9 w-full rounded-lg border border-line bg-surface-2 px-3 font-mono text-sm"
              autoComplete="off"
            />
          </label>
          {m.error && <p className="mt-2 text-sm text-danger">{m.error.message}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" disabled={typed !== word} busy={m.isPending} onClick={() => m.mutate()}>
              {label}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  )
}

export function SystemDashboard() {
  const qc = useQueryClient()
  const s = useSummary()
  const meta = useMeta()
  const { updatedAt } = useLive()
  const now = useNow(2000)
  const fresh = now - updatedAt < 10_000
  const [power, setPower] = useState<'reboot' | 'poweroff' | null>(null)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const [summary, apps] = await Promise.all([
      get('/api/summary'),
      get<{ apps: { id: string; installed: boolean; status: string; version: string | null }[] }>('/api/apps'),
    ])
    const text = JSON.stringify(
      {
        swizdash: meta.data?.version,
        at: new Date().toISOString(),
        summary,
        apps: apps.apps.filter((a) => a.installed).map(({ id, status, version }) => ({ id, status, version })),
      },
      null,
      2,
    )
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            System
            <span
              className={cn('size-2.5 rounded-full', fresh ? 'bg-accent' : 'bg-warn')}
              title={fresh ? 'Live' : 'Not updating'}
              role="status"
              aria-label={fresh ? 'Live' : 'Not updating'}
            />
          </h1>
          <p className="mt-1 text-sm text-muted">How the server is doing right now, and over the last 30 days.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void qc.invalidateQueries()}>
            <RefreshCw className="size-4" /> Refresh
          </Button>
          <Button onClick={() => void copy()}>
            <ClipboardCopy className="size-4" /> {copied ? 'Copied' : 'Copy diagnostics'}
          </Button>
          <Menu
            trigger={
              <Button aria-label="Power">
                <Power className="size-4" /> Power
              </Button>
            }
          >
            <MenuItem onSelect={() => setPower('reboot')}>Restart the server</MenuItem>
            <MenuItem danger onSelect={() => setPower('poweroff')}>
              Shut down the server
            </MenuItem>
          </Menu>
        </div>
      </div>

      {s.error ? <ErrorNote error={s.error} /> : <Tiles />}
      <Details />
      <HistoryCharts />
      <BandwidthChart />
      <Hardware />
      <Disks />
      <Fail2ban />
      <div className="grid gap-4 lg:grid-cols-2">
        <Updates />
        <Inventory />
      </div>
      {/* a new dialog each time: no word typed or error left from the last one */}
      <PowerDialog key={power ?? 'none'} action={power} onClose={() => setPower(null)} />
    </div>
  )
}
