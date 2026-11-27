import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Copy, Eye, EyeOff, ExternalLink, Play, RotateCw, Search, Square, Trash2 } from 'lucide-react'
import { get, post, type AppInfo, type AppRow, type AppUpdate } from '@/lib/api'
import { appUrl } from '@/lib/apps'
import { useAppUpdates, useApps, useJobs } from '@/lib/queries'
import { cn } from '@/lib/format'
import { AppIcon } from '@/components/AppIcon'
import { Badge, Button, Card, Empty, ErrorNote, Pager, Spinner } from '@/components/ui'
import { JobDialog } from '@/components/JobDialog'
import { Confirm } from './Packages'
import { statusLabel, statusTone } from '@/lib/status'

export type ControlFilter = 'installed' | 'running' | 'stopped'

function useServiceAction(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { action: 'start' | 'stop' | 'restart'; unit?: string }) => post(`/api/apps/${id}/service`, v),
    onSettled: () => qc.invalidateQueries({ queryKey: ['apps'] }),
  })
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={done ? 'Copied' : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        } catch {
          // clipboard needs https, which nginx provides
        }
      }}
    >
      <Copy className={cn('size-3.5', done && 'text-accent')} />
    </Button>
  )
}

const pathLabels: Record<string, string> = { config: 'Configuration', data: 'Data', log: 'Logs', install: 'Program' }

function Details({ app, svc, onRemove }: { app: AppRow; svc: ReturnType<typeof useServiceAction>; onRemove: (() => void) | null }) {
  const info = useQuery({ queryKey: ['appinfo', app.id], queryFn: () => get<AppInfo>(`/api/apps/${app.id}/info`) })
  const [showKey, setShowKey] = useState(false)
  return (
    <div className="grid gap-6 bg-surface-2/40 px-5 py-4 md:grid-cols-3">
      <div>
        <h4 className="mb-2 text-xs font-semibold text-muted">Services</h4>
        {app.units.length === 0 ? (
          <p className="text-sm text-muted">This app has no background service.</p>
        ) : (
          <ul className="space-y-1.5">
            {app.units.map((u) => {
              const running = u.active === 'active' || u.active === 'activating' || u.active === 'reloading'
              return (
                <li key={u.unit} className="flex items-center gap-2 text-sm">
                  <span className={cn('size-1.5 rounded-full', running ? 'bg-accent' : u.active === 'failed' ? 'bg-danger' : 'bg-muted/50')} />
                  <code className="flex-1 truncate font-mono text-xs">{u.unit}</code>
                  <span className="text-xs text-muted">{u.active === 'active' ? 'running' : u.active}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`${running ? 'Stop' : 'Start'} ${u.unit}`}
                    title={`${running ? 'Stop' : 'Start'} ${u.unit}`}
                    onClick={() => svc.mutate({ action: running ? 'stop' : 'start', unit: u.unit })}
                    disabled={svc.isPending || (running && !app.canStop)}
                  >
                    {running ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        {svc.error && <p className="mt-2 text-xs text-danger">{svc.error.message}</p>}
      </div>
      <div>
        <h4 className="mb-2 text-xs font-semibold text-muted">Files</h4>
        {info.isPending ? (
          <Spinner />
        ) : info.error ? (
          <p className="text-sm text-danger">{info.error.message}</p>
        ) : Object.keys(info.data.paths).length === 0 ? (
          <p className="text-sm text-muted">No known files for this app.</p>
        ) : (
          <dl className="space-y-2">
            {Object.entries(info.data.paths).map(([k, p]) => (
              <div key={k}>
                <dt className="flex items-center gap-2 text-xs text-muted">
                  {pathLabels[k] ?? k}
                  {!p.exists && <Badge tone="amber">missing</Badge>}
                </dt>
                <dd className="flex items-center gap-1">
                  <code className={cn('flex-1 truncate font-mono text-xs', !p.exists && 'text-muted line-through')}>{p.path}</code>
                  <CopyButton text={p.path} label="Copy path" />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div>
        <h4 className="mb-2 text-xs font-semibold text-muted">Access</h4>
        <dl className="space-y-2 text-sm">
          {appUrl(app) && (
            <div>
              <dt className="text-xs text-muted">Address</dt>
              <dd className="flex items-center gap-1">
                <code className="flex-1 truncate font-mono text-xs">{appUrl(app)}</code>
                <CopyButton text={appUrl(app)!} label="Copy address" />
              </dd>
            </div>
          )}
          {app.port && (
            <div>
              <dt className="text-xs text-muted">Local port</dt>
              <dd className="font-mono text-xs">{app.port}</dd>
            </div>
          )}
          {info.data?.apikey && (
            <div>
              <dt className="text-xs text-muted">API key</dt>
              <dd className="flex items-center gap-1">
                <code className="flex-1 truncate font-mono text-xs">{showKey ? info.data.apikey : '•'.repeat(24)}</code>
                <Button variant="ghost" size="icon" aria-label={showKey ? 'Hide API key' : 'Show API key'} onClick={() => setShowKey((s) => !s)}>
                  {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
                <CopyButton text={info.data.apikey} label="Copy API key" />
              </dd>
            </div>
          )}
          {!appUrl(app) && !app.port && !info.data?.apikey && <p className="text-muted">No web interface.</p>}
        </dl>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3 md:col-span-3">
        <Button size="sm" variant="ghost" className="text-danger hover:text-danger" disabled={!app.canRemove || !onRemove} onClick={() => onRemove?.()}>
          <Trash2 className="size-4" /> Remove {app.name}
        </Button>
        {app.note && <p className="flex-1 text-xs text-muted">{app.note}</p>}
      </div>
    </div>
  )
}

function Row({
  app,
  update,
  open,
  onToggle,
  onRemove,
}: {
  app: AppRow
  update?: AppUpdate
  open: boolean
  onToggle: () => void
  onRemove: (() => void) | null
}) {
  const svc = useServiceAction(app.id)
  const url = appUrl(app)
  const hasUnits = app.units.length > 0
  const running = app.status === 'running' || app.status === 'partial'
  return (
    <Fragment>
      <tr className={cn('border-t border-line', open && 'bg-surface-2/40')}>
        <td className="w-10 pl-3">
          <Button variant="ghost" size="icon" onClick={onToggle} aria-expanded={open} aria-label={`Details of ${app.name}`}>
            <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
          </Button>
        </td>
        <td className="py-3 pr-3">
          <div className="flex items-center gap-3">
            <AppIcon name={app.name} category={app.category} />
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-semibold">
                <span className="truncate">{app.name}</span>
                {/* the version column, which has the full badge, is hidden on small screens */}
                {update?.state === 'update' && (
                  <Badge tone="blue" className="md:hidden">
                    update
                  </Badge>
                )}
              </p>
              <p className="truncate text-xs text-muted">{app.category}</p>
            </div>
          </div>
        </td>
        <td className="px-3">
          <Badge tone={statusTone[app.status]}>{statusLabel[app.status]}</Badge>
        </td>
        <td className="hidden px-3 font-mono text-xs md:table-cell">
          {app.version ?? <span className="text-muted">—</span>}
          {update?.state === 'update' && (
            <Badge tone="blue" className="ml-2 font-sans">
              {update.available} available
            </Badge>
          )}
        </td>
        <td className="hidden px-3 font-mono text-xs text-muted lg:table-cell">{app.port ?? '—'}</td>
        <td className="pr-4">
          <div className="flex justify-end gap-1">
            {hasUnits && (
              <>
                {(app.canStop || !running) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    busy={svc.isPending && svc.variables?.action !== 'restart'}
                    aria-label={running ? `Stop ${app.name}` : `Start ${app.name}`}
                    title={running ? 'Stop' : 'Start'}
                    className={running ? 'hover:text-danger' : 'hover:text-accent'}
                    onClick={() => svc.mutate({ action: running ? 'stop' : 'start' })}
                  >
                    {!(svc.isPending && svc.variables?.action !== 'restart') && (running ? <Square className="size-4" /> : <Play className="size-4" />)}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  busy={svc.isPending && svc.variables?.action === 'restart'}
                  aria-label={`Restart ${app.name}`}
                  title="Restart"
                  onClick={() => svc.mutate({ action: 'restart' })}
                >
                  {!(svc.isPending && svc.variables?.action === 'restart') && <RotateCw className="size-4" />}
                </Button>
              </>
            )}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                title="Open"
                aria-label={`Open ${app.name}`}
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
              >
                <ExternalLink className="size-4" />
              </a>
            )}
          </div>
          {svc.error && <p className="mt-1 text-right text-xs text-danger">{svc.error.message}</p>}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="p-0">
            <Details app={app} svc={svc} onRemove={onRemove} />
          </td>
        </tr>
      )}
    </Fragment>
  )
}

export function AppControl({ filter }: { filter: ControlFilter }) {
  const q = useApps()
  const updates = useAppUpdates()
  const updateOf = useMemo(() => new Map((updates.data ?? []).map((u) => [u.id, u])), [updates.data])
  const busy = !!useJobs().data?.some((j) => j.state === 'running')
  const [remove, setRemove] = useState<AppRow | null>(null)
  const [job, setJob] = useState<{ id: string; name: string } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const installed = useMemo(() => (q.data?.apps ?? []).filter((a) => a.installed && a.id !== 'swizdash'), [q.data])
  const running = installed.filter((a) => a.status === 'running' || a.status === 'partial')
  const stopped = installed.filter((a) => a.status === 'stopped' || a.status === 'failed')
  const [text, setText] = useState('')
  const t = text.trim().toLowerCase()
  const rows = (filter === 'running' ? running : filter === 'stopped' ? stopped : installed)
    .filter((a) => !t || `${a.name} ${a.category}`.toLowerCase().includes(t))
    // a failed app needs a look before one stopped on purpose
    .sort((a, b) => Number(b.status === 'failed') - Number(a.status === 'failed'))
  const pages = Math.max(1, Math.ceil(rows.length / perPage))
  // the list shrinks when apps change state: never stay on a page past the end
  const current = Math.min(page, pages)
  const shown = rows.slice((current - 1) * perPage, current * perPage)

  return (
    <Card>
      <div className="relative mx-5 mt-4 mb-2 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={text}
          onChange={(e) => (setText(e.target.value), setPage(1))}
          placeholder="Find an app"
          aria-label="Find an app"
          className="h-9 w-full rounded-lg border border-line bg-surface-2/60 pr-3 pl-9 text-sm placeholder:text-muted focus:border-accent/60 focus:outline-none"
        />
      </div>
      {q.isPending ? (
        <Spinner />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : rows.length === 0 ? (
        <Empty title={t ? 'No app matches' : filter === 'installed' ? 'No app installed yet' : `No ${filter} app`}>
          {!t && filter === 'installed' && 'Install one from Available.'}
        </Empty>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="w-10" />
                  <th className="py-2 pr-3 font-medium">Application</th>
                  <th className="px-3 font-medium">Status</th>
                  <th className="hidden px-3 font-medium md:table-cell">Version</th>
                  <th className="hidden px-3 font-medium lg:table-cell">Port</th>
                  <th className="pr-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <Row
                    key={a.id}
                    app={a}
                    update={updateOf.get(a.id)}
                    open={open === a.id}
                    onToggle={() => setOpen(open === a.id ? null : a.id)}
                    onRemove={busy ? null : () => setRemove(a)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={current} pages={pages} onPage={setPage} total={rows.length} perPage={perPage} onPerPage={(n) => (setPerPage(n), setPage(1))} />
        </>
      )}
      <Confirm
        key={remove ? `remove-${remove.id}` : 'none'}
        app={remove}
        kind="remove"
        onClose={() => setRemove(null)}
        onStarted={(id, name) => setJob({ id, name })}
      />
      <JobDialog id={job?.id ?? null} name={job?.name ?? ''} onClose={() => setJob(null)} />
    </Card>
  )
}
