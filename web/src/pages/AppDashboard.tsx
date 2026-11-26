import { useSearchParams } from 'react-router'
import { PackageOpen, SlidersHorizontal } from 'lucide-react'
import { Segmented } from '@/components/ui'
import { AppControl } from './AppControl'
import { Overview } from './Overview'
import { Packages } from './Packages'

export function AppDashboard() {
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') === 'packages' ? 'packages' : 'control'
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Your apps</h1>
        <p className="mt-1 text-sm text-muted">Start, stop and open what runs on this server, or add something new.</p>
      </div>
      <Overview />
      <Segmented
        value={mode}
        onChange={(m) => setParams(m === 'packages' ? { mode: 'packages' } : {}, { replace: true })}
        options={[
          {
            value: 'control',
            label: (
              <>
                <SlidersHorizontal className="size-3.5" /> Application control
              </>
            ),
          },
          {
            value: 'packages',
            label: (
              <>
                <PackageOpen className="size-3.5" /> Package management
              </>
            ),
          },
        ]}
      />
      {mode === 'packages' ? <Packages /> : <AppControl />}
    </div>
  )
}
