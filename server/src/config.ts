import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Paths and settings, overridable through SWIZDASH_* variables for development.
// The root helper does not read them: its catalog and jobs paths are fixed, root must not trust this environment.

/** where the release is unpacked */
const root = process.env.SWIZDASH_ROOT ?? '/opt/swizdash'

function token(): string {
  const file = process.env.SWIZDASH_TOKEN_FILE ?? '/etc/swizdash/token'
  try {
    return readFileSync(file, 'utf8').trim()
  } catch {
    return ''
  }
}

export const config = {
  root,
  /** listens on 127.0.0.1 (development), otherwise on the socket systemd hands over */
  port: process.env.SWIZDASH_PORT ? Number(process.env.SWIZDASH_PORT) : null,
  /** the built web app */
  publicDir: process.env.SWIZDASH_PUBLIC ?? join(root, 'public'),
  catalog: process.env.SWIZDASH_CATALOG ?? join(root, 'catalog', 'apps.json'),
  /** history database */
  dataDir: process.env.SWIZDASH_DATA ?? '/var/lib/swizdash',
  /** install and removal logs, written by the root helper only */
  jobsDir: process.env.SWIZDASH_JOBS ?? '/var/log/swizdash/jobs',
  helper: process.env.SWIZDASH_HELPER ?? '/usr/local/sbin/swizdash-helper',
  /** the swizzin master, set by the systemd unit */
  master: process.env.SWIZDASH_MASTER ?? '',
  /** shared secret nginx adds to every request (file in SWIZDASH_TOKEN_FILE), other local processes do not know it */
  token: token(),
}
