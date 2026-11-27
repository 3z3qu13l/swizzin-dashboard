import { useAppUpdates, useApps, useSoftwareUpdates, useUpdates } from './queries'

/** What needs a look, shared by the Home page and the menu counters. */
export function useAttention() {
  const apps = useApps()
  const appUpdates = useAppUpdates()
  const software = useSoftwareUpdates()
  const packages = useUpdates()
  const installed = (apps.data?.apps ?? []).filter((a) => a.installed && a.id !== 'swizdash')
  const failed = installed.filter((a) => a.status === 'failed')
  const apps2update = (appUpdates.data ?? []).filter((u) => u.state === 'update').length
  const self = (software.data ?? []).filter((s) => s.state === 'update').length
  const pkgs = packages.data?.packages.length ?? 0
  return {
    loaded: !!apps.data,
    checked: !!(apps.data && appUpdates.data && software.data && packages.data),
    failedCheck: !!(apps.error || appUpdates.error || software.error || packages.error),
    installed: installed.length,
    running: installed.filter((a) => a.status === 'running' || a.status === 'partial').length,
    failed,
    apps2update,
    self,
    pkgs,
    updates: apps2update + self + pkgs,
  }
}
