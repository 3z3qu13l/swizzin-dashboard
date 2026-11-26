import type { Status } from './api'

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'grey'

export const statusTone: Record<Status, Tone> = {
  running: 'green',
  partial: 'amber',
  stopped: 'grey',
  failed: 'red',
  none: 'grey',
}

export const statusLabel: Record<Status, string> = {
  running: 'Running',
  partial: 'Partly running',
  stopped: 'Stopped',
  failed: 'Failed',
  none: 'No service',
}
