import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Search } from 'lucide-react'
import type { TorrentStatus } from '@/lib/api'
import { useDownloads } from '@/lib/queries'
import { ago, bytes, cn, pct, rate } from '@/lib/format'
import type { Tone } from '@/lib/status'
import { clientNames, downloadKey } from '@/lib/downloads'
import { Badge, Button, Card, CardHead, Empty, ErrorNote, Pager, Spinner } from '@/components/ui'
import { BandwidthChart } from './SystemCharts'

const statusLabel: Record<TorrentStatus, string> = {
  downloading: 'Downloading',
  seeding: 'Seeding',
  queued: 'Queued',
  checking: 'Checking',
  stopped: 'Stopped',
  error: 'Error',
}
const statusTone: Record<TorrentStatus, Tone> = { downloading: 'blue', seeding: 'green', queued: 'grey', checking: 'amber', stopped: 'grey', error: 'red' }
const tiles: { status: TorrentStatus; label: string; ring: string }[] = [
  { status: 'downloading', label: 'Downloading', ring: 'aria-pressed:ring-info' },
  { status: 'seeding', label: 'Seeding', ring: 'aria-pressed:ring-accent' },
  { status: 'queued', label: 'Queued', ring: 'aria-pressed:ring-muted' },
  { status: 'checking', label: 'Checking', ring: 'aria-pressed:ring-warn' },
  { status: 'stopped', label: 'Stopped', ring: 'aria-pressed:ring-muted' },
  { status: 'error', label: 'Errors', ring: 'aria-pressed:ring-danger' },
]

/** Torrents of every client and user, read only: the clients' own pages manage them. */
export function Downloads() {
  const q = useDownloads(true)
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const list = useMemo(() => q.data ?? [], [q.data])
  const s = params.get('status')
  const status = s && s in statusLabel ? (s as TorrentStatus) : null
  const client = params.get('client')
  const severalUsers = new Set(list.map((d) => d.user)).size > 1

  // the tiles and the clients both filter the list, kept in the address so it survives a reload
  const filter = (k: 'status' | 'client', v: string | null) => {
    const next = new URLSearchParams(params)
    if (v === null || next.get(k) === v) next.delete(k)
    else next.set(k, v)
    setParams(next, { replace: true })
    setPage(1)
  }

  const picked = client ? list.filter((d) => downloadKey(d) === client) : list
  const total = (st: TorrentStatus) => picked.reduce((a, d) => a + d.counts[st], 0)
  const down = picked.reduce((a, d) => a + d.down, 0)
  const up = picked.reduce((a, d) => a + d.up, 0)
  const rows = useMemo(() => {
    const t = text.trim().toLowerCase()
    return list
      .filter((d) => !client || downloadKey(d) === client)
      .flatMap((d) => d.items.map((i) => ({ ...i, client: d.client, user: d.user })))
      .filter((i) => (!status || i.status === status) && (!t || i.name.toLowerCase().includes(t)))
  }, [list, client, status, text])
  const pages = Math.max(1, Math.ceil(rows.length / perPage))
  const current = Math.min(page, pages)
  const shown = rows.slice((current - 1) * perPage, current * perPage)
  const detail: Record<string, string> = {
    downloading: `↓ ${rate(down)}`,
    seeding: `↑ ${rate(up)}`,
    queued: 'waiting for a slot',
    checking: 'verifying data on disk',
    stopped: 'paused',
    error: 'tracker or disk problem',
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Downloads</h1>
          <p className="mt-1 text-sm text-muted">Every torrent client, every user. Read only: manage torrents in each client.</p>
        </div>
        <Button onClick={() => void qc.invalidateQueries({ queryKey: ['downloads'] })}>
          <RefreshCw className="size-4" /> Refresh
        </Button>
      </div>
      {q.error && q.data && <ErrorNote error={q.error} />}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6" role="group" aria-label="Filter by status">
        {tiles.map((t) => (
          <button
            key={t.status}
            type="button"
            aria-pressed={status === t.status}
            onClick={() => filter('status', t.status)}
            className={cn('glass rounded-2xl border px-4 py-3 text-left transition-transform active:scale-[0.98] aria-pressed:ring-2', t.ring)}
          >
            <span className="text-xs font-semibold text-muted">{t.label}</span>
            <p className={cn('text-2xl font-bold', t.status === 'error' && total('error') > 0 && 'text-danger')}>{q.data ? total(t.status) : '—'}</p>
            <span className="text-xs text-muted">{detail[t.status]}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CardHead
            title="Torrents"
            hint={q.dataUpdatedAt ? `${rows.length} shown${client ? '' : ', all clients'}, updated ${ago(q.dataUpdatedAt)}` : undefined}
            right={
              status || client ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setParams({}, { replace: true })
                    setText('')
                    setPage(1)
                  }}
                >
                  Show all
                </Button>
              ) : null
            }
          />
          <div className="relative mx-5 mb-3">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={text}
              onChange={(e) => (setText(e.target.value), setPage(1))}
              placeholder="Find a torrent"
              aria-label="Find a torrent"
              className="h-9 w-full rounded-lg border border-line bg-surface-2/60 pr-3 pl-9 text-sm placeholder:text-muted focus:border-accent/60 focus:outline-none"
            />
          </div>
          {q.isPending ? (
            <Spinner />
          ) : !q.data ? (
            <ErrorNote error={q.error} />
          ) : list.length === 0 ? (
            <Empty title="No torrent client is running" />
          ) : rows.length === 0 ? (
            <Empty title={picked.every((d) => d.total === 0) ? 'No torrent in this client' : 'No torrent matches'} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-2 pl-5 font-medium">Name</th>
                      <th className="hidden px-3 font-medium md:table-cell">Client</th>
                      <th className="px-3 font-medium">Status</th>
                      <th className="hidden w-36 px-3 font-medium sm:table-cell">Progress</th>
                      <th className="hidden px-3 text-right font-medium sm:table-cell">Size</th>
                      <th className="pr-5 text-right font-medium" title="Uploaded divided by downloaded">
                        Ratio
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((i, n) => (
                      <tr key={`${i.client}-${i.user}-${i.name}-${n}`} className="border-t border-line">
                        <td className="max-w-0 py-2 pl-5 sm:max-w-80">
                          <p className="truncate font-medium" title={i.name}>
                            {i.name}
                          </p>
                        </td>
                        <td className="hidden px-3 text-xs whitespace-nowrap text-muted md:table-cell">
                          {clientNames[i.client]}
                          {severalUsers && ` · ${i.user}`}
                        </td>
                        <td className="px-3">
                          <Badge tone={statusTone[i.status]}>{statusLabel[i.status]}</Badge>
                        </td>
                        <td className="hidden px-3 sm:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                              <div
                                className={cn('h-full rounded-full', i.status === 'error' ? 'bg-danger' : i.progress >= 1 ? 'bg-accent' : 'bg-info')}
                                style={{ width: `${Math.min(100, i.progress * 100)}%` }}
                              />
                            </div>
                            <span className="w-11 text-right text-xs text-muted">{pct(i.progress * 100, 0)}</span>
                          </div>
                        </td>
                        <td className="hidden px-3 text-right text-xs whitespace-nowrap sm:table-cell">{bytes(i.size)}</td>
                        <td className={cn('pr-5 text-right text-xs', i.ratio >= 1 ? 'text-accent' : 'text-muted')}>{i.ratio.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={current} pages={pages} onPage={setPage} total={rows.length} perPage={perPage} onPerPage={(n) => (setPerPage(n), setPage(1))} />
              {list.some((d) => d.truncated) && <p className="px-5 pb-3 text-xs text-muted">A client lists only its first 1000 torrents.</p>}
            </>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHead title="Clients" hint="Click one to filter" />
            <ul className="px-2 pb-2">
              {list.map((d) => {
                const k = downloadKey(d)
                return (
                  <li key={k}>
                    <button
                      type="button"
                      aria-pressed={client === k}
                      onClick={() => filter('client', k)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-2/60 aria-pressed:bg-accent/12"
                    >
                      <span className={cn('size-2 shrink-0 rounded-full', d.active > 0 ? 'bg-accent' : 'bg-muted/50')} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {clientNames[d.client]}
                          {severalUsers && <span className="font-normal text-muted"> · {d.user}</span>}
                        </span>
                        <span className="block text-xs text-muted">
                          {d.active} active of {d.total}, {bytes(d.size)}, {pct(d.size ? (100 * d.done) / d.size : 0, 0)} done
                        </span>
                        {d.folder && (
                          <code className="block truncate font-mono text-[11px] text-muted" title={d.folder}>
                            {d.folder}
                          </code>
                        )}
                      </span>
                      <span className="text-right font-mono text-[11px] leading-tight whitespace-nowrap text-muted">
                        ↓ {rate(d.down)}
                        <br />↑ {rate(d.up)}
                      </span>
                    </button>
                  </li>
                )
              })}
              {q.data && list.length === 0 && <li className="px-3 py-2 text-sm text-muted">No torrent client is running.</li>}
            </ul>
          </Card>
          <BandwidthChart />
        </div>
      </div>
    </div>
  )
}
