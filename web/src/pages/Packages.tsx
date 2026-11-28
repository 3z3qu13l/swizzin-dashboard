import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import type { AppRow } from '@/lib/api'
import { useApps, useMeta, useRunningJob } from '@/lib/queries'
import { usePaged } from '@/lib/hooks'
import { AppIcon } from '@/components/AppIcon'
import { JobConfirm } from '@/components/JobConfirm'
import { JobDialog } from '@/components/JobDialog'
import { Button, Card, Empty, ErrorNote, Pager, SearchInput, Spinner } from '@/components/ui'

/** apps box can install; the installed ones are managed in the main list */
export function Packages() {
  const q = useApps()
  const meta = useMeta()
  const [cat, setCat] = useState('all')
  const [text, setText] = useState('')
  const [confirm, setConfirm] = useState<{ app: AppRow; kind: 'install' | 'remove' } | null>(null)
  const [job, setJob] = useState<{ id: string; name: string } | null>(null)

  const running = useRunningJob()
  const all = useMemo(() => (q.data?.apps ?? []).filter((a) => a.hasScripts.install), [q.data])
  const rows = all.filter(
    (a) => (cat === 'all' || a.category === cat) && !a.installed && (!text.trim() || `${a.name} ${a.desc}`.toLowerCase().includes(text.trim().toLowerCase())),
  )
  const { shown, pager, reset } = usePaged(rows)

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <SearchInput value={text} onChange={(v) => (setText(v), reset())} label="Find a package" className="w-56" />
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
        <span className="ml-auto text-xs text-muted">{rows.length} available</span>
      </div>

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
                <div className="flex w-32 justify-end">
                  {a.canInstall ? (
                    <Button size="sm" variant="primary" disabled={!!running} onClick={() => setConfirm({ app: a, kind: 'install' })}>
                      <Download className="size-4" /> Install
                    </Button>
                  ) : (
                    <span className="text-right text-xs text-muted" title={a.note ?? undefined}>
                      SSH only
                    </span>
                  )}
                </div>
                {a.note && <p className="w-full pl-13 text-xs text-muted">{a.note}</p>}
              </li>
            ))}
          </ul>
          <Pager {...pager} />
        </>
      )}

      <JobConfirm
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
