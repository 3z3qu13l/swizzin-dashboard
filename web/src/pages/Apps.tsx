import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { Badge, Segmented } from '@/components/ui'
import { RunningJob } from '@/components/RunningJob'
import { useAppUpdates, useApps } from '@/lib/queries'
import { isRunning, listedApps } from '@/lib/apps'
import { AppControl } from './AppControl'
import { AppUpdates } from './AppUpdates'
import { Packages } from './Packages'

const shows = ['installed', 'running', 'stopped', 'updates', 'available'] as const
type Show = (typeof shows)[number]

/** every app in one list: installed ones to control, updates, and the ones box can install */
export function Apps() {
  const [params, setParams] = useSearchParams()
  const p = params.get('show')
  const show: Show = shows.includes(p as Show) ? (p as Show) : 'installed'
  const apps = useApps()
  const updates = useAppUpdates()
  const n = useMemo(() => {
    const all = apps.data?.apps ?? []
    const installed = listedApps(all)
    return {
      installed: installed.length,
      running: installed.filter(isRunning).length,
      stopped: installed.filter((a) => a.status === 'stopped' || a.status === 'failed').length,
      updates: (updates.data ?? []).filter((u) => u.state === 'update').length,
      available: all.filter((a) => !a.installed && a.hasScripts.install).length,
    }
  }, [apps.data, updates.data])
  const label = (s: Show, text: string, tone?: 'blue' | 'amber') => (
    <>
      {text}
      {tone && n[s] > 0 ? (
        <Badge tone={tone}>
          {n[s]}
          <span className="sr-only"> apps</span>
        </Badge>
      ) : (
        <span className="text-muted">{apps.data ? n[s] : ''}</span>
      )}
    </>
  )
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Apps</h1>
        <p className="mt-1 text-sm text-muted">Start, stop, open, install and update what runs on this server.</p>
      </div>
      <Segmented
        value={show}
        onChange={(v) => setParams(v === 'installed' ? {} : { show: v }, { replace: true })}
        className="flex-wrap"
        options={[
          { value: 'installed', label: label('installed', 'Installed') },
          { value: 'running', label: label('running', 'Running') },
          { value: 'stopped', label: label('stopped', 'Stopped', 'amber') },
          { value: 'updates', label: label('updates', 'Updates', 'blue') },
          { value: 'available', label: label('available', 'Available') },
        ]}
      />
      <RunningJob />
      {show === 'updates' ? <AppUpdates /> : show === 'available' ? <Packages /> : <AppControl key={show} filter={show} />}
    </div>
  )
}
