import type { Download } from './api'

export const clientNames: Record<Download['client'], string> = {
  rtorrent: 'rTorrent',
  qbittorrent: 'qBittorrent',
  transmission: 'Transmission',
  deluge: 'Deluge',
}

/** one client of one user */
export const downloadKey = (d: Pick<Download, 'client' | 'user'>) => `${d.client}:${d.user}`
