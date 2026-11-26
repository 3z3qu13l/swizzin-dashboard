import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download as DownloadIcon, Folder, HardDrive, Layers, Search } from 'lucide-react'
import type { Download, TorrentStatus } from '@/lib/api'
import { useDownloads } from '@/lib/queries'
import { ago, bytes, cn, pct, rate } from '@/lib/format'
import { Badge, Empty, ErrorNote, Segmented, Sheet, Spinner } from './ui'
import type { Tone } from '@/lib/status'
import { clientNames, downloadKey } from '@/lib/downloads'

const statuses: { value: TorrentStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'downloading', label: 'Downloading' },
  { value: 'seeding', label: 'Seeding' },
  { value: 'queued', label: 'Queued' },
  { value: 'checking', label: 'Checking' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'error', label: 'Error' },
]

const statusTone: Record<TorrentStatus, Tone> = {
  downloading: 'blue',
  seeding: 'green',
  queued: 'grey',
  checking: 'amber',
  stopped: 'grey',
  error: 'red',
}

function Stat({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 px-4 py-3">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="text-sm font-semibold text-text">{value}</span>
      </div>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  )
}

function ClientView({ d }: { d: Download }) {
  const [status, setStatus] = useState<TorrentStatus | 'all'>('all')
  const [text, setText] = useState('')
  const rows = useMemo(() => {
    const t = text.trim().toLowerCase()
    return d.items.filter((i) => (status === 'all' || i.status === status) && (!t || i.name.toLowerCase().includes(t)))
  }, [d.items, status, text])
  const c = d.counts
  return (
    <div className="space-y-4 px-5 py-4">
      {d.folder && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Folder className="size-3.5" /> Download folder <code className="truncate font-mono text-text">{d.folder}</code>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Stat icon={<ArrowDown className="size-3.5" />} label="Down" value={rate(d.down)} detail={`${c.downloading} downloading`} />
        <Stat icon={<ArrowUp className="size-3.5" />} label="Up" value={rate(d.up)} detail={`${c.seeding} seeding`} />
        <Stat icon={<Layers className="size-3.5" />} label="Torrents" value={String(d.total)} detail={`${c.stopped} stopped, ${c.error} with an error`} />
        <Stat
          icon={<HardDrive className="size-3.5" />}
          label="Size"
          value={bytes(d.size)}
          detail={`${pct(d.size ? (100 * d.done) / d.size : 0, 0)} complete`}
        />
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Find a torrent"
          aria-label="Find a torrent"
          className="h-9 w-full rounded-lg border border-line bg-surface-2/60 pr-3 pl-9 text-sm placeholder:text-muted focus:border-accent/60 focus:outline-none"
        />
      </div>
      <Segmented
        value={status}
        onChange={setStatus}
        className="flex-wrap"
        options={statuses.map((s) => ({
          value: s.value,
          label: (
            <>
              {s.label} <span className="text-muted">{s.value === 'all' ? d.total : c[s.value]}</span>
            </>
          ),
        }))}
      />
      {rows.length === 0 ? (
        <Empty title={d.total ? 'No torrent matches' : 'No torrent in this client'} />
      ) : (
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-2 font-medium">Name</th>
              <th className="w-28 font-medium">Status</th>
              <th className="hidden w-32 font-medium sm:table-cell">Progress</th>
              <th className="w-20 text-right font-medium">Size</th>
              <th className="w-14 text-right font-medium" title="Uploaded divided by downloaded">
                Ratio
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i, n) => (
              <tr key={`${i.name}-${n}`} className="border-t border-line">
                <td className="truncate py-2 pr-2 font-medium" title={i.name}>
                  {i.name}
                </td>
                <td>
                  <Badge tone={statusTone[i.status]}>{statuses.find((s) => s.value === i.status)?.label}</Badge>
                </td>
                <td className="hidden sm:table-cell">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, i.progress * 100)}%` }} />
                    </div>
                    <span className="w-11 text-right text-xs text-muted">{pct(i.progress * 100)}</span>
                  </div>
                </td>
                <td className="text-right text-xs">{bytes(i.size)}</td>
                <td className={cn('text-right text-xs', i.ratio >= 1 ? 'text-accent' : 'text-muted')}>{i.ratio.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {d.truncated && <p className="text-xs text-muted">Only the first 1000 torrents are listed.</p>}
    </div>
  )
}

/** Torrents of every client and user, read only: the clients' own pages manage them. */
export function DownloadActivity({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial: string | null }) {
  const q = useDownloads()
  const list = q.data ?? []
  const [picked, setPicked] = useState<string | null>(initial)
  const current = list.find((d) => downloadKey(d) === picked) ?? list[0]
  const severalUsers = new Set(list.map((d) => d.user)).size > 1
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <>
          <DownloadIcon className="size-4 text-muted" /> Download activity
        </>
      }
      description="Torrents of every client, read only"
      footer={
        <div className="flex justify-between gap-3">
          <span>{q.dataUpdatedAt ? `Updated ${ago(q.dataUpdatedAt)}` : ' '}</span>
          <span>Read only: manage torrents in each client</span>
        </div>
      }
    >
      {q.isPending ? (
        <Spinner />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : !current ? (
        <Empty title="No torrent client is running" />
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-3" role="group" aria-label="Clients">
            {list.map((d) => {
              const k = downloadKey(d)
              const on = k === downloadKey(current)
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(k)}
                  className={cn(
                    '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm',
                    on ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text',
                  )}
                >
                  {clientNames[d.client]}
                  {severalUsers && <span className="text-xs text-muted">{d.user}</span>}
                  {d.active > 0 && <span className="rounded-md bg-accent/15 px-1.5 text-xs font-semibold text-accent">{d.active}</span>}
                </button>
              )
            })}
          </div>
          <ClientView key={downloadKey(current)} d={current} />
        </>
      )}
    </Sheet>
  )
}
