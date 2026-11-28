import { useQueryClient } from '@tanstack/react-query'
import { Package, RefreshCw } from 'lucide-react'
import { serverTime } from '@/lib/api'
import { useSoftwareUpdates, useUpdates } from '@/lib/queries'
import { ago } from '@/lib/format'
import { Badge, Button, Card, CardHead, Empty, ErrorNote, Spinner } from '@/components/ui'
import { AppUpdates } from './AppUpdates'

/** swizzin and swizdash against their remotes, apart from the apt list: a remote can be slow or out of reach */
function Software() {
  const q = useSoftwareUpdates()
  const checked = q.data?.map((s) => s.checkedAt).filter((t): t is number => t != null)
  return (
    <Card>
      <CardHead
        icon={<RefreshCw className="size-4" />}
        title="swizzin and swizdash"
        hint={checked?.length ? `Checked ${ago(serverTime(Math.min(...checked)))}` : undefined}
      />
      <div className="px-5 pb-3">
        {q.isPending ? (
          <p className="py-2 text-sm text-muted">Checking…</p>
        ) : q.error ? (
          <p className="py-2 text-sm text-muted">Could not check.</p>
        ) : (
          <ul>
            {q.data.map((s) => (
              <li key={s.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 text-sm first:border-t-0">
                <span className="flex-1 font-medium">{s.name}</span>
                <span className="text-xs text-muted">
                  installed <span className="font-mono text-text">{s.installed ?? 'unknown'}</span>
                </span>
                {s.installed == null ? (
                  <Badge>could not read the installed version</Badge>
                ) : s.state === 'update' ? (
                  <Badge tone="blue">{s.branch ? `newer commit on ${s.branch}` : `${s.available} available`}</Badge>
                ) : s.state === 'current' ? (
                  <Badge tone="green">up to date</Badge>
                ) : s.state === 'manual' ? (
                  <Badge>managed manually</Badge>
                ) : (
                  <Badge>could not check</Badge>
                )}
                {s.state === 'manual' && (
                  <p className="w-full text-xs text-muted">
                    <code className="font-mono text-text">box update</code> leaves /etc/swizzin as it is: it is a link, or has a .dev.lock file.
                  </p>
                )}
                {s.state === 'update' && (
                  <p className="w-full text-xs text-muted">
                    Update it over SSH with <code className="font-mono text-text">{s.command}</code>.
                    {s.name === 'swizdash' && ' box installs the release swizzin has checked, which can come a little after the release itself.'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

/** apt packages waiting for an upgrade, security ones flagged */
function SystemPackages() {
  const q = useUpdates()
  const pkgs = q.data?.packages ?? []
  const security = pkgs.filter((p) => p.security).length
  return (
    <Card>
      <CardHead
        icon={<Package className="size-4" />}
        title="System packages"
        hint={q.data ? `Checked ${ago(serverTime(q.data.checkedAt))}` : undefined}
        right={
          pkgs.length > 0 ? (
            <Badge tone={security ? 'amber' : 'blue'}>
              {pkgs.length} pending{security ? `, ${security} security` : ''}
            </Badge>
          ) : null
        }
      />
      {q.isPending ? (
        <Spinner />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : pkgs.length === 0 ? (
        <Empty title="Every system package is up to date" />
      ) : (
        <>
          <ul className="max-h-72 overflow-auto px-5">
            {pkgs.map((p) => (
              <li key={p.name} className="flex items-center gap-3 border-t border-line py-2 text-sm first:border-t-0">
                <span className="flex-1 truncate font-medium">{p.name}</span>
                {p.security && <Badge tone="amber">security</Badge>}
                <span className="hidden font-mono text-xs text-muted sm:inline">{p.version}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-5 py-3 text-xs text-muted">
            Apply them over SSH with <code className="font-mono text-text">box upgrade</code> for swizzin apps, or{' '}
            <code className="font-mono text-text">apt upgrade</code> for the system.
          </p>
        </>
      )}
    </Card>
  )
}

/** everything that can be updated on the server: swizzin, swizdash, the apps and the system packages */
export function UpdatesPage() {
  const qc = useQueryClient()
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Updates</h1>
          <p className="mt-1 text-sm text-muted">Everything that can be updated on this server, in one place. Updates run over SSH.</p>
        </div>
        <Button onClick={() => void qc.invalidateQueries({ queryKey: ['updates'] })}>
          <RefreshCw className="size-4" /> Refresh
        </Button>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Software />
        <SystemPackages />
      </div>
      <AppUpdates />
    </div>
  )
}
