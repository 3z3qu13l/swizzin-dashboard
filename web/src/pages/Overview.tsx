import { useState } from 'react'
import { Download, HardDrive } from 'lucide-react'
import { useDownloads, useLive, useQuota, useSummary } from '@/lib/queries'
import { bytes, pct } from '@/lib/format'
import { Ring } from '@/components/charts'
import { useThemeColors } from '@/lib/hooks'
import { Bar, Button, Card, CardHead, Empty, ErrorNote, Segmented, Spinner } from '@/components/ui'
import { DownloadActivity } from '@/components/DownloadActivity'
import { clientNames, downloadKey } from '@/lib/downloads'

function Storage() {
  const s = useSummary()
  const quota = useQuota()
  const [view, setView] = useState<'system' | 'quota'>('system')
  const hasQuota = quota.data?.available
  return (
    <Card className="lg:col-span-2">
      <CardHead
        icon={<HardDrive className="size-4" />}
        title="Storage"
        right={
          hasQuota ? (
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'system', label: 'Disks' },
                { value: 'quota', label: 'My quota' },
              ]}
            />
          ) : null
        }
      />
      <div className="space-y-4 px-5 pb-5">
        {view === 'quota' && quota.data?.available ? (
          <div>
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-semibold">
                {bytes(quota.data.used)} <span className="text-base font-normal text-muted">of {quota.data.limit ? bytes(quota.data.limit) : 'unlimited'}</span>
              </p>
              {quota.data.limit ? <span className="text-sm text-muted">{pct((100 * (quota.data.used ?? 0)) / quota.data.limit, 0)}</span> : null}
            </div>
            <Bar className="mt-3" value={quota.data.limit ? (100 * (quota.data.used ?? 0)) / quota.data.limit : 0} color="bg-disk" />
          </div>
        ) : s.isPending ? (
          <Spinner />
        ) : s.error ? (
          <ErrorNote error={s.error} />
        ) : (
          s.data.disks.map((d, i) => (
            <div key={d.mount}>
              <div className="flex items-baseline justify-between gap-3">
                <p className={i === 0 ? 'text-2xl font-semibold' : 'text-base font-semibold'}>
                  {bytes(d.used)} <span className="text-sm font-normal text-muted">of {bytes(d.total)}</span>
                </p>
                <span className="text-sm text-muted">{pct(d.percent, 0)}</span>
              </div>
              <Bar className="mt-2" value={d.percent} color="bg-disk" />
              <p className="mt-2 text-xs text-muted">
                {bytes(d.free)} free on <span className="text-text">{d.mount}</span> ({d.fstype})
              </p>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

function Resources() {
  const { live } = useLive()
  const s = useSummary()
  const c = useThemeColors()
  return (
    <Card className="lg:col-span-2">
      <div className="grid grid-cols-2 gap-2 px-3 py-5">
        <div className="flex flex-col items-center gap-2">
          <Ring value={live?.cpu ?? 0} color={c.cpu}>
            <div>
              <p className="text-2xl font-semibold">{pct(live?.cpu)}</p>
              <p className="text-xs text-muted">CPU</p>
            </div>
          </Ring>
          <p className="text-center text-xs text-muted">
            {s.data ? `${s.data.cpu.cores} cores, ${s.data.cpu.threads} threads` : ' '}
            <br />
            Load {live ? live.load[0].toFixed(2) : '—'}
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Ring value={live?.mem.percent ?? 0} color={c.mem}>
            <div>
              <p className="text-2xl font-semibold">{pct(live?.mem.percent)}</p>
              <p className="text-xs text-muted">Memory</p>
            </div>
          </Ring>
          <p className="text-center text-xs text-muted">
            {live ? `${bytes(live.mem.used)} used` : ' '}
            <br />
            {live ? `${bytes(live.mem.total)} total` : ' '}
          </p>
        </div>
      </div>
    </Card>
  )
}

function Downloads() {
  const q = useDownloads()
  const [open, setOpen] = useState<string | null>(null)
  const list = q.data ?? []
  const active = list.reduce((a, d) => a + d.active, 0)
  return (
    <Card className="lg:col-span-4">
      <CardHead
        icon={<Download className="size-4" />}
        title={q.data ? `${active} active download${active === 1 ? '' : 's'}` : 'Downloads'}
        hint="rTorrent, qBittorrent, Transmission and Deluge, every user"
        right={
          list.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setOpen(downloadKey(list[0]))}>
              Show torrents
            </Button>
          ) : null
        }
      />
      <div className="flex flex-wrap gap-2 px-5 pb-4">
        {q.isPending ? (
          <Spinner />
        ) : !q.data ? (
          <ErrorNote error={q.error} />
        ) : list.length === 0 ? (
          <Empty title="No torrent client is running" />
        ) : (
          list.map((d) => (
            <button
              key={downloadKey(d)}
              type="button"
              onClick={() => setOpen(downloadKey(d))}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-3 py-1.5 text-sm hover:border-accent/50"
            >
              {clientNames[d.client]}
              {new Set(list.map((x) => x.user)).size > 1 && <span className="text-xs text-muted">{d.user}</span>}
              <span className="rounded-md bg-accent/15 px-1.5 text-xs font-semibold text-accent">{d.active}</span>
              <span className="text-xs text-muted">of {d.total}</span>
            </button>
          ))
        )}
      </div>
      {/* mounted per opening, so it starts on the client that was clicked */}
      {open && <DownloadActivity open onOpenChange={(o) => !o && setOpen(null)} initial={open} />}
    </Card>
  )
}

export function Overview() {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <Storage />
      <Resources />
      <Downloads />
    </div>
  )
}
