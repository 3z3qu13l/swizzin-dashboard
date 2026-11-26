import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  publicDir: process.env.SWIZDASH_PUBLIC ?? join(root, 'public'),
  catalog: process.env.SWIZDASH_CATALOG ?? join(root, 'catalog', 'apps.json'),
  dataDir: process.env.SWIZDASH_DATA ?? '/var/lib/swizdash',
  /** written by the root helper only */
  jobsDir: process.env.SWIZDASH_JOBS ?? '/var/log/swizdash/jobs',
  helper: process.env.SWIZDASH_HELPER ?? '/usr/local/sbin/swizdash-helper',
  master: process.env.SWIZDASH_MASTER ?? '',
  /** shared secret nginx adds to every request, other local processes do not know it */
  token: token(),
}
