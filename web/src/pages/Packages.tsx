import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Info, MoreHorizontal, Search, Trash2 } from 'lucide-react'
import { post, serverTime, type AppRow } from '@/lib/api'
import { useApps, useJobs, useMeta } from '@/lib/queries'
import { ago } from '@/lib/format'
import { AppIcon } from '@/components/AppIcon'
import { JobDialog } from '@/components/JobDialog'
import { Badge, Button, Card, Dialog, Empty, ErrorNote, Menu, MenuItem, Pager, Segmented, Spinner } from '@/components/ui'

type Show = 'all' | 'installed' | 'available'

function Confirm({
  app,
  kind,
  onClose,
  onStarted,
}: {
  app: AppRow | null
  kind: 'install' | 'remove'
  onClose: () => void
  onStarted: (id: string, name: string) => void
}) {
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: () => post<{ id: string }>('/api/jobs', { kind, app: app!.id }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['jobs'] })
      onStarted(r.id, app!.name)
      onClose()
    },
  })
  if (!app) return null
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={kind === 'install' ? `Install ${app.name}?` : `Remove ${app.name}?`}
      description={
        kind === 'install'
          ? `box installs ${app.name} with its default settings for the swizzin users. It can take a few minutes.`
          : `box removes ${app.name} from the server. Depending on the app, its settings may be deleted too.`
      }
    >
      {m.error && <p className="mb-3 text-sm text-danger">{m.error.message}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant={kind === 'install' ? 'primary' : 'danger'} busy={m.isPending} onClick={() => m.mutate()}>
          {kind === 'install' ? `Install ${app.name}` : `Remove ${app.name}`}
        </Button>
      </div>
    </Dialog>
  )
}

export function Packages() {
  const q = useApps()
  const meta = useMeta()
  const jobs = useJobs()
  const [cat, setCat] = useState('all')
  const [show, setShow] = useState<Show>('all')
  const [text, setText] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [confirm, setConfirm] = useState<{ app: AppRow; kind: 'install' | 'remove' } | null>(null)
  const [job, setJob] = useState<{ id: string; name: string } | null>(null)

  const running = jobs.data?.find((j) => j.state === 'running')
  const all = useMemo(() => (q.data?.apps ?? []).filter((a) => a.hasScripts.install || a.installed), [q.data])
  const rows = all.filter(
    (a) =>
      (cat === 'all' || a.category === cat) &&
      (show === 'all' || (show === 'installed' ? a.installed : !a.installed)) &&
      (!text.trim() || `${a.name} ${a.desc}`.toLowerCase().includes(text.trim().toLowerCase())),
  )
  const pages = Math.max(1, Math.ceil(rows.length / perPage))
  // the list shrinks when apps change state: never stay on a page past the end
  const current = Math.min(page, pages)
  const shown = rows.slice((current - 1) * perPage, current * perPage)
  const reset = () => setPage(1)

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={text}
            onChange={(e) => (setText(e.target.value), reset())}
            placeholder="Find a package"
            aria-label="Find a package"
            className="h-9 w-56 rounded-lg border border-line bg-surface-2/60 pr-3 pl-9 text-sm placeholder:text-muted focus:border-accent/60 focus:outline-none"
          />
        </div>
        <select
          value={cat}
          onChange={(e) => (setCat(e.target.value), reset())}
          aria-label="Category"
          className="h-9 rounded-lg border border-line bg-surface-2/60 px-3 text-sm"
        >
          <option value="all">All categories</option>
          {(meta.data?.categories ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Segmented
          value={show}
          onChange={(v) => (setShow(v), reset())}
          options={[
            { value: 'all', label: 'All' },
            { value: 'installed', label: 'Installed' },
            { value: 'available', label: 'Not installed' },
          ]}
        />
        <span className="ml-auto text-xs text-muted">{rows.length} packages</span>
      </div>

      {running && (
        <button
          onClick={() => setJob({ id: running.id, name: running.app })}
          className="mx-5 mb-3 flex w-[calc(100%-2.5rem)] items-center gap-3 rounded-lg border border-info/30 bg-info/10 px-4 py-2.5 text-left text-sm"
        >
          <span className="size-2 animate-pulse rounded-full bg-info" />
          box is {running.kind === 'install' ? 'installing' : 'removing'} {running.app}, started {ago(serverTime(running.startedAt))}. Show progress
        </button>
      )}

      {q.isPending ? (
        <Spinner />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : rows.length === 0 ? (
        <Empty title="No package matches">Try another category or search.</Empty>
      ) : (
        <>
          <ul>
            {shown.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-5 py-3">
                <AppIcon name={a.name} category={a.category} />
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-semibold">{a.name}</p>
                  <p className="text-sm text-muted">{a.desc}</p>
                </div>
                <span className="hidden text-xs text-muted sm:inline">{a.category}</span>
                {a.installed ? <Badge tone="green">Installed</Badge> : <Badge>Not installed</Badge>}
                <div className="flex w-32 justify-end">
                  {a.installed ? (
                    <Menu
                      trigger={
                        <Button size="sm" variant="outline">
                          <MoreHorizontal className="size-4" /> Actions
                        </Button>
                      }
                    >
                      <MenuItem danger disabled={!a.canRemove || !!running} onSelect={() => setConfirm({ app: a, kind: 'remove' })}>
                        <Trash2 className="size-4" /> Remove
                      </MenuItem>
                      {a.note && (
                        <p className="flex max-w-60 gap-2 px-2.5 py-1.5 text-xs text-muted">
                          <Info className="mt-0.5 size-3.5 shrink-0" /> {a.note}
                        </p>
                      )}
                    </Menu>
                  ) : a.canInstall ? (
                    <Button size="sm" variant="primary" disabled={!!running} onClick={() => setConfirm({ app: a, kind: 'install' })}>
                      <Download className="size-4" /> Install
                    </Button>
                  ) : (
                    <span className="text-right text-xs text-muted" title={a.note ?? undefined}>
                      SSH only
                    </span>
                  )}
                </div>
                {!a.installed && a.note && <p className="w-full pl-13 text-xs text-muted">{a.note}</p>}
              </li>
            ))}
          </ul>
          <Pager page={current} pages={pages} onPage={setPage} total={rows.length} perPage={perPage} onPerPage={(n) => (setPerPage(n), setPage(1))} />
        </>
      )}

      <Confirm
        key={confirm ? `${confirm.kind}-${confirm.app.id}` : 'none'}
        app={confirm?.app ?? null}
        kind={confirm?.kind ?? 'install'}
        onClose={() => setConfirm(null)}
        onStarted={(id, name) => setJob({ id, name })}
      />
      <JobDialog id={job?.id ?? null} name={job?.name ?? ''} onClose={() => setJob(null)} />
    </Card>
  )
}
