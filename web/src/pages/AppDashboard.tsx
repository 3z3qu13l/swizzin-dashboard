import { useSearchParams } from 'react-router'
import { CircleArrowUp, PackageOpen, SlidersHorizontal } from 'lucide-react'
import { Badge, Segmented } from '@/components/ui'
import { useAppUpdates } from '@/lib/queries'
import { AppControl } from './AppControl'
import { AppUpdates } from './AppUpdates'
import { Overview } from './Overview'
import { Packages } from './Packages'

export function AppDashboard() {
  const [params, setParams] = useSearchParams()
  const m = params.get('mode')
  const mode = m === 'packages' || m === 'updates' ? m : 'control'
  const pending = (useAppUpdates().data ?? []).filter((u) => u.state === 'update').length
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Your apps</h1>
        <p className="mt-1 text-sm text-muted">Start, stop and open what runs on this server, or add something new.</p>
      </div>
      <Overview />
      <Segmented
        value={mode}
        onChange={(v) => setParams(v === 'control' ? {} : { mode: v }, { replace: true })}
        options={[
          {
            value: 'control',
            label: (
              <>
                <SlidersHorizontal className="size-3.5" />
                {/* three tabs do not fit a phone with the long names */}
                <span className="sm:hidden">Control</span>
                <span className="hidden sm:inline">Application control</span>
              </>
            ),
          },
          {
            value: 'packages',
            label: (
              <>
                <PackageOpen className="size-3.5" />
                <span className="sm:hidden">Packages</span>
                <span className="hidden sm:inline">Package management</span>
              </>
            ),
          },
          {
            value: 'updates',
            label: (
              <>
                <CircleArrowUp className="size-3.5" /> Updates
                {pending > 0 && (
                  <Badge tone="blue">
                    {pending}
                    <span className="sr-only"> to update</span>
                  </Badge>
                )}
              </>
            ),
          },
        ]}
      />
      {mode === 'packages' ? <Packages /> : mode === 'updates' ? <AppUpdates /> : <AppControl />}
    </div>
  )
}
