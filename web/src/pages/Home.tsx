import { Link, Navigate, useSearchParams } from 'react-router'
import { ExternalLink, LayoutGrid } from 'lucide-react'
import { useApps, useMeta } from '@/lib/queries'
import { useAttention } from '@/lib/attention'
import { appUrl, isRunning } from '@/lib/apps'
import { AppIcon } from '@/components/AppIcon'
import { Card, CardHead, Empty, Spinner } from '@/components/ui'
import { Overview } from './Overview'

function Chip({ to, tone, children }: { to: string; tone: 'danger' | 'info' | 'warn'; children: React.ReactNode }) {
  const tones = { danger: 'border-danger/40 bg-danger/10', info: 'border-info/40 bg-info/10', warn: 'border-warn/40 bg-warn/10' }
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-transform active:scale-[0.97] ${tones[tone]}`}
    >
      {children}
    </Link>
  )
}

function OpenApps() {
  const apps = useApps()
  const list = (apps.data?.apps ?? []).filter((a) => a.installed && appUrl(a) && isRunning(a))
  return (
    <Card>
      <CardHead icon={<LayoutGrid className="size-4" />} title="Open an app" hint={apps.data ? `${list.length} running with a web page` : undefined} />
      {apps.isPending ? (
        <Spinner />
      ) : apps.data && list.length === 0 ? (
        <Empty title="No running app has a web page" />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2 px-5 pb-5">
          {list.map((a) => (
            <li key={a.id}>
              <a
                href={appUrl(a)!}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/40 p-2 text-sm font-semibold transition-transform hover:border-accent/50 active:scale-[0.98]"
              >
                <AppIcon name={a.name} category={a.category} className="size-7 text-[11px]" />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <ExternalLink className="size-3.5 text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function Home() {
  const [params] = useSearchParams()
  const mode = params.get('mode')
  const meta = useMeta()
  const a = useAttention()
  const things = a.failed.length + (a.apps2update ? 1 : 0) + (a.self ? 1 : 0) + (a.pkgs ? 1 : 0)
  if (mode === 'packages') return <Navigate to="/apps?show=available" replace />
  if (mode === 'updates') return <Navigate to="/apps?show=updates" replace />
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{meta.data ? `Hello, ${meta.data.master}` : 'Hello'}</h1>
        <p className="mt-1 text-sm text-muted">
          {a.loaded ? `${a.running} of ${a.installed} apps are running. ` : ''}
          {things > 0
            ? `${things === 1 ? 'One thing needs' : `${things} things need`} a look.`
            : a.failedCheck
              ? 'Some checks could not run.'
              : a.checked
                ? 'No app or update needs a look.'
                : ''}
        </p>
      </div>
      {things > 0 && (
        <div className="flex flex-wrap gap-2">
          {a.failed.map((f) => (
            <Chip key={f.id} to="/apps?show=stopped" tone="danger">
              <span className="size-2 rounded-full bg-danger" /> {f.name} failed
            </Chip>
          ))}
          {a.apps2update > 0 && (
            <Chip to="/apps?show=updates" tone="info">
              {a.apps2update} app update{a.apps2update === 1 ? '' : 's'}
            </Chip>
          )}
          {a.self > 0 && (
            <Chip to="/updates" tone="info">
              swizzin or swizdash update
            </Chip>
          )}
          {a.pkgs > 0 && (
            <Chip to="/updates" tone="warn">
              {a.pkgs} system package{a.pkgs === 1 ? '' : 's'}
            </Chip>
          )}
        </div>
      )}
      <Overview />
      <OpenApps />
    </div>
  )
}
