// One TanStack Query hook per API resource, with how often each refreshes.

import { useQuery } from '@tanstack/react-query'
import { get } from './api'
import type {
  AppRow,
  AppUpdate,
  Bandwidth,
  Download,
  Fail2ban,
  Hardware,
  HistoryPoint,
  Job,
  Live,
  Meta,
  Quota,
  Smart,
  SoftwareUpdate,
  Summary,
  Updates,
} from './api'

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => get<Meta>('/api/meta'), staleTime: Infinity })
export const useSummary = () => useQuery({ queryKey: ['summary'], queryFn: () => get<Summary>('/api/summary'), refetchInterval: 15_000 })
export const useApps = () => useQuery({ queryKey: ['apps'], queryFn: () => get<{ apps: AppRow[] }>('/api/apps'), refetchInterval: 8_000 })
export const useBandwidth = () => useQuery({ queryKey: ['bandwidth'], queryFn: () => get<Bandwidth>('/api/bandwidth'), refetchInterval: 60_000 })
export const useUpdates = () => useQuery({ queryKey: ['updates'], queryFn: () => get<Updates>('/api/updates'), staleTime: 5 * 60_000 })
// the server asks GitHub at most every few hours
export const useSoftwareUpdates = () =>
  useQuery({ queryKey: ['updates', 'software'], queryFn: () => get<SoftwareUpdate[]>('/api/updates/software'), staleTime: 5 * 60_000 })
// apt's lists and GitHub releases, which the server checks at most every few hours
export const useAppUpdates = () => useQuery({ queryKey: ['updates', 'apps'], queryFn: () => get<AppUpdate[]>('/api/updates/apps'), staleTime: 5 * 60_000 })
export const useHardware = () => useQuery({ queryKey: ['hardware'], queryFn: () => get<Hardware>('/api/system/hardware'), refetchInterval: 30_000 })
export const useSmart = () => useQuery({ queryKey: ['smart'], queryFn: () => get<Smart>('/api/system/smart'), staleTime: 5 * 60_000 })
export const useFail2ban = () => useQuery({ queryKey: ['fail2ban'], queryFn: () => get<Fail2ban>('/api/system/fail2ban'), refetchInterval: 60_000 })
export const useQuota = () => useQuery({ queryKey: ['quota'], queryFn: () => get<Quota>('/api/system/quota'), refetchInterval: 60_000 })
/** counts for the card; `withItems` adds every torrent, for the Downloads page only */
export const useDownloads = (withItems = false) =>
  useQuery({
    queryKey: ['downloads', withItems],
    queryFn: () => get<Download[]>(withItems ? '/api/downloads' : '/api/downloads?items=0'),
    // each refresh logs into every torrent client: once a minute is enough
    refetchInterval: 60_000,
  })
export const useJobs = () => useQuery({ queryKey: ['jobs'], queryFn: () => get<Job[]>('/api/jobs'), refetchInterval: 5_000 })
/** The install or removal box is running, if any: only one runs at a time. */
export const useRunningJob = () => useJobs().data?.find((j) => j.state === 'running')
export const useHistory = (range: string) =>
  useQuery({
    queryKey: ['history', range],
    queryFn: () => get<{ range: string; bucket: number; points: HistoryPoint[] }>(`/api/history?range=${range}`),
    refetchInterval: range === '5m' || range === '15m' ? 10_000 : 60_000,
  })

// last minute of samples for the sparklines, shared by every component
let trail: Live[] = []

async function fetchLive(): Promise<{ live: Live | null; trail: Live[] }> {
  const live = await get<Live | null>('/api/live')
  if (live && trail.at(-1)?.at !== live.at) trail = [...trail.slice(-29), live]
  return { live, trail }
}

/** live sample every 2 s, plus the last minute of values */
export function useLive(): { live: Live | null; trail: Live[]; updatedAt: number } {
  const q = useQuery({ queryKey: ['live'], queryFn: fetchLive, refetchInterval: 2_000 })
  return { live: q.data?.live ?? null, trail: q.data?.trail ?? [], updatedAt: q.dataUpdatedAt }
}
