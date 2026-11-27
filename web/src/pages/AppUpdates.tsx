import { useMemo, useState } from 'react'
import { serverTime, type AppUpdate } from '@/lib/api'
import { useAppUpdates, useApps } from '@/lib/queries'
import { ago } from '@/lib/format'
import { AppIcon } from '@/components/AppIcon'
import { Badge, Card, Empty, ErrorNote, Segmented, Spinner } from '@/components/ui'
import { CopyButton } from './AppControl'

type Filter = 'update' | 'all' | 'unknown'

const stateBadge: Record<AppUpdate['state'], { tone: 'blue' | 'green' | 'grey'; label: string }> = {
  update: { tone: 'blue', label: 'update available' },
  current: { tone: 'green', label: 'up to date' },
  unknown: { tone: 'grey', label: 'could not check' },
}

const sourceLabel: Record<AppUpdate['source'], string> = { apt: 'apt', github: 'GitHub release' }

/** the installed apps against their newest version, apps to update first */
export function AppUpdates() {
  const q = useAppUpdates()
  const apps = useApps()
  const [filter, setFilter] = useState<Filter>('update')
  const categoryOf = useMemo(() => new Map((apps.data?.apps ?? []).map((a) => [a.id, a.category])), [apps.data])
  const all = useMemo(() => [...(q.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [q.data])
  const pending = all.filter((u) => u.state === 'update')
  const unknown = all.filter((u) => u.state === 'unknown')
  const rows = filter === 'update' ? pending : filter === 'unknown' ? unknown : all
  const checked = all.map((u) => u.checkedAt).filter((t): t is number => t != null)

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'update', label: `To update ${pending.length}` },
            { value: 'all', label: `All ${all.length}` },
            { value: 'unknown', label: `Could not check ${unknown.length}` },
          ]}
        />
        <p className="flex-1 text-xs text-muted sm:text-right">
          {checked.length ? `Checked ${ago(serverTime(Math.min(...checked)))}. ` : ''}apt apps without the network, GitHub releases every 6 hours.
        </p>
      </div>
      {q.isPending ? (
        <Spinner />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : rows.length === 0 ? (
        <Empty
          title={filter === 'update' ? 'Every app that can be checked is up to date' : filter === 'unknown' ? 'Every app could be checked' : 'No app to check'}
        >
          {filter === 'update' && unknown.length > 0 && `${unknown.length} could not be checked.`}
        </Empty>
      ) : (
        <ul>
          {rows.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-5 py-3 text-sm">
              <div className="flex min-w-48 flex-1 items-center gap-3">
                <AppIcon name={u.name} category={categoryOf.get(u.id) ?? ''} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{u.name}</p>
                  <p className="truncate text-xs text-muted">{sourceLabel[u.source]}</p>
                </div>
              </div>
              <div className="text-xs text-muted">
                installed <span className="font-mono text-text">{u.installed ?? 'unknown'}</span>
                {u.available && u.state !== 'current' && (
                  <>
                    {' '}
                    → <span className="font-mono text-text">{u.available}</span>
                  </>
                )}
              </div>
              <Badge tone={stateBadge[u.state].tone}>{stateBadge[u.state].label}</Badge>
              {u.state === 'update' && (
                <div className="flex w-full items-center gap-2 text-xs text-muted">
                  {u.command ? (
                    <>
                      <span>Over SSH:</span>
                      <code className="min-w-0 truncate rounded bg-surface-2 px-1.5 py-0.5 font-mono text-text">{u.command}</code>
                      <CopyButton text={u.command} label={`Copy the command to update ${u.name}`} />
                    </>
                  ) : (
                    <span>box has no upgrade for this app: a newer release exists upstream.</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
