import { useQuery } from '@tanstack/react-query'
import { get } from './api'
import type { AppRow, Bandwidth, Download, Fail2ban, Hardware, HistoryPoint, Job, Live, Meta, Quota, Smart, Summary, Updates } from './api'

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => get<Meta>('/api/meta'), staleTime: Infinity })
export const useSummary = () => useQuery({ queryKey: ['summary'], queryFn: () => get<Summary>('/api/summary'), refetchInterval: 15_000 })
export const useApps = () => useQuery({ queryKey: ['apps'], queryFn: () => get<{ apps: AppRow[]; users: string[] }>('/api/apps'), refetchInterval: 8_000 })
export const useBandwidth = () => useQuery({ queryKey: ['bandwidth'], queryFn: () => get<Bandwidth>('/api/bandwidth'), refetchInterval: 60_000 })
export const useUpdates = () => useQuery({ queryKey: ['updates'], queryFn: () => get<Updates>('/api/updates'), staleTime: 5 * 60_000 })
export const useHardware = () => useQuery({ queryKey: ['hardware'], queryFn: () => get<Hardware>('/api/system/hardware'), refetchInterval: 30_000 })
export const useSmart = () => useQuery({ queryKey: ['smart'], queryFn: () => get<Smart>('/api/system/smart'), staleTime: 5 * 60_000 })
export const useFail2ban = () => useQuery({ queryKey: ['fail2ban'], queryFn: () => get<Fail2ban>('/api/system/fail2ban'), refetchInterval: 60_000 })
export const useQuota = () => useQuery({ queryKey: ['quota'], queryFn: () => get<Quota>('/api/system/quota'), refetchInterval: 60_000 })
export const useDownloads = () => useQuery({ queryKey: ['downloads'], queryFn: () => get<Download[]>('/api/downloads'), refetchInterval: 10_000 })
export const useJobs = () => useQuery({ queryKey: ['jobs'], queryFn: () => get<Job[]>('/api/jobs'), refetchInterval: 5_000 })
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
