import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream, readFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { pipeline } from 'node:stream'
import { extname, join, normalize } from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import { uptime } from 'node:os'
import { config } from './config.ts'
import { allowedUnit, appInfo, catalog, catalogApp, forgetVersion, listApps, swizzinUsers } from './apps.ts'
import { bandwidth, cpuHealth, listJobs, platform, raid, readJob, softwareUpdates, updates } from './extra.ts'
import { helper, helperJson, HelperError } from './helper.ts'
import { clearHistory, history, historyStats, startHistory } from './history.ts'
import { cpuFreqMhz, cpuInfo, cpuTemp, disks, live, osInfo, sensors, startSampler } from './system.ts'
import { cached } from './util.ts'

const started = Date.now()
const version: string = (() => {
  try {
    return JSON.parse(readFileSync(join(config.root, 'package.json'), 'utf8')).version ?? 'dev'
  } catch {
    return 'dev'
  }
})()

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    // the page puts server times on its own clock with it (the Date header only has whole seconds)
    'x-server-time': String(Date.now()),
  })
  res.end(data)
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > 64 * 1024) throw new HttpError(413, 'Request too large')
    chunks.push(c as Buffer)
  }
  if (!chunks.length) return {}
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return v && typeof v === 'object' ? v : {}
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

function tokenOk(req: IncomingMessage): boolean {
  if (!config.token) return false
  const got = Buffer.from(String(req.headers['x-swizdash-token'] ?? ''))
  const want = Buffer.from(config.token)
  return got.length === want.length && timingSafeEqual(got, want)
}

/** Browsers always send these on cross-site requests, a forged form or fetch is refused. */
function sameOrigin(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.origin
  if (origin) {
    // nginx passes the browser's Host as is, X-Forwarded-Host would be the client's word
    const host = req.headers.host
    try {
      if (new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  return req.headers['content-type']?.startsWith('application/json') === true
}

const smart = cached(10 * 60_000, () => helperJson<unknown>(['smart'], 60_000))
interface Fail2banRaw {
  available: boolean
  jails?: unknown[]
  events?: { at: string; jail: string; ip: string }[]
}
// log times are the server's local time, Node parses them in that same zone
const fail2ban = cached(60_000, async () => {
  const r = await helperJson<Fail2banRaw>(['fail2ban'], 60_000)
  return { ...r, events: r.events?.map((e) => ({ ...e, at: Date.parse(e.at) })).filter((e) => Number.isFinite(e.at)) }
})
const quota = cached(60_000, () => helperJson<unknown>(['quota']))
const downloads = cached(60_000, () => helperJson<unknown[]>(['downloads'], 30_000))

async function summary() {
  const [cpu, ds, temp, freq, sys] = await Promise.all([cpuInfo(), disks(), cpuTemp(), cpuFreqMhz(), osInfo()])
  return { live: live(), cpu: { ...cpu, temp, freq }, disks: ds, os: sys, master: config.master }
}

type Handler = (req: IncomingMessage, params: string[], url: URL) => Promise<unknown>
const routes: { method: string; re: RegExp; h: Handler }[] = []
const route = (method: string, path: string, h: Handler) => routes.push({ method, re: new RegExp(`^${path.replace(/:\w+/g, '([a-z0-9_.@-]+)')}$`), h })

// boot: when the machine started, which tells a reboot from a restart of swizdash alone
route('GET', '/api/meta', async () => ({
  version,
  started,
  boot: Math.round(Date.now() - uptime() * 1000),
  master: config.master,
  categories: catalog.categories,
}))
route('GET', '/api/summary', summary)
route('GET', '/api/live', async () => live())
route('GET', '/api/history', async (_r, _p, url) => {
  const h = history(url.searchParams.get('range') ?? '15m')
  if (!h) throw new HttpError(400, 'Unknown range')
  return h
})
route('GET', '/api/history/stats', async () => historyStats())
route('POST', '/api/history/clear', async () => {
  clearHistory()
  return { ok: true }
})
route('GET', '/api/bandwidth', bandwidth)
route('GET', '/api/updates', updates)
// apart from the apt list: it waits on GitHub, the page must not
route('GET', '/api/updates/software', () => softwareUpdates(version))
route('GET', '/api/system/hardware', async () => {
  const [p, s, r, h] = await Promise.all([platform(), sensors(), raid(), cpuHealth()])
  return { platform: p, sensors: s, raid: r, health: h }
})
route('GET', '/api/system/smart', smart)
route('GET', '/api/system/fail2ban', fail2ban)
route('GET', '/api/system/quota', quota)
// the card only needs the counts, the list of torrents goes to the open panel
route('GET', '/api/downloads', async (_r, _p, url) => {
  const list = (await downloads()) as { items?: unknown[] }[]
  return url.searchParams.get('items') === '0' ? list.map((d) => ({ ...d, items: [] })) : list
})
route('POST', '/api/system/power', async (req) => {
  const b = await body(req)
  if (b.action !== 'reboot' && b.action !== 'poweroff') throw new HttpError(400, 'Unknown action')
  if (b.confirm !== b.action) throw new HttpError(400, 'Not confirmed')
  await helper(['power', b.action])
  return { ok: true }
})

route('GET', '/api/apps', async () => ({ apps: await listApps(), users: await swizzinUsers() }))
route('GET', '/api/apps/:id/info', async (_r, [id]) => {
  if (!catalogApp(id)) throw new HttpError(404, 'Unknown app')
  const { paths, apikey } = await appInfo(id)
  return { paths, apikey }
})
route('POST', '/api/apps/:id/service', async (req, [id]) => {
  const app = catalogApp(id)
  if (!app) throw new HttpError(404, 'Unknown app')
  const b = await body(req)
  const action = String(b.action ?? '')
  if (!['start', 'stop', 'restart'].includes(action)) throw new HttpError(400, 'Unknown action')
  const rows = await listApps()
  const row = rows.find((r) => r.id === id)
  if (!row?.installed) throw new HttpError(409, 'Not installed')
  const units = b.unit ? [String(b.unit)] : row.units.map((u) => u.unit)
  if (!units.length) throw new HttpError(409, 'This app has no service')
  for (const u of units) if (!allowedUnit(app, u)) throw new HttpError(400, 'Unit not allowed')
  for (const u of units) await helper(['service', action, u], 120_000)
  forgetVersion(id)
  return { ok: true }
})

route('GET', '/api/jobs', async () => listJobs())
route('GET', '/api/jobs/:id', async (_r, [id]) => {
  const j = await readJob(id, true)
  if (!j) throw new HttpError(404, 'Unknown job')
  return j
})
route('POST', '/api/jobs', async (req) => {
  const b = await body(req)
  const kind = String(b.kind ?? '')
  const app = String(b.app ?? '')
  if (kind !== 'install' && kind !== 'remove') throw new HttpError(400, 'Unknown job')
  if (!catalogApp(app)) throw new HttpError(404, 'Unknown app')
  const id = (await helper(['job', kind, app])).trim()
  forgetVersion(app, { reinstalled: true })
  return { id }
})

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
}

async function serveStatic(res: ServerResponse, pathname: string): Promise<void> {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    throw new HttpError(400, 'Bad path')
  }
  const rel = normalize(decoded).replace(/^([/\\])+/, '')
  let file = join(config.publicDir, rel)
  if (!file.startsWith(config.publicDir)) throw new HttpError(404, 'Not found')
  let s = await stat(file).catch(() => null)
  // client-side routes fall back to the app shell
  if (!s?.isFile()) {
    file = join(config.publicDir, 'index.html')
    s = await stat(file).catch(() => null)
    if (!s) throw new HttpError(404, 'Not found')
  }
  const immutable = rel.startsWith('assets/')
  res.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'content-length': s.size,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  // a file removed between stat and open must not crash the server
  pipeline(createReadStream(file), res, () => undefined)
}

const server = createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('referrer-policy', 'same-origin')
  res.setHeader('x-frame-options', 'DENY')
  // only swizdash's own files run; styles may be inline (React and Radix set style attributes)
  res.setHeader(
    'content-security-policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  )
  try {
    if (!tokenOk(req)) throw new HttpError(403, 'Forbidden')
    const url = new URL(req.url ?? '/', 'http://local')
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed')
      await serveStatic(res, url.pathname)
      return
    }
    if (req.method === 'POST' && !sameOrigin(req)) throw new HttpError(403, 'Cross-site request refused')
    for (const r of routes) {
      if (r.method !== req.method) continue
      const m = r.re.exec(url.pathname)
      if (!m) continue
      send(res, 200, await r.h(req, m.slice(1), url))
      return
    }
    throw new HttpError(404, 'Not found')
  } catch (e) {
    if (res.headersSent) {
      res.destroy()
      return
    }
    if (e instanceof HttpError) send(res, e.status, { error: e.message })
    else if (e instanceof HelperError) send(res, 409, { error: e.message })
    else {
      console.error(e)
      send(res, 500, { error: 'Internal error' })
    }
  }
})

if (!config.token) {
  console.error('swizdash: no token, every request would be refused (see SWIZDASH_TOKEN_FILE)')
  process.exit(1)
}

startSampler()
startHistory()

if (config.port) {
  server.listen(config.port, '127.0.0.1', () => console.log(`swizdash ${version} on 127.0.0.1:${config.port}`))
} else if (process.env.LISTEN_FDS === '1' && process.env.LISTEN_PID === String(process.pid)) {
  // systemd opens the socket (swizdash.socket): this process never needs the www-data group
  server.listen({ fd: 3 }, () => console.log(`swizdash ${version} on the socket from systemd`))
} else {
  console.error('swizdash: start it with swizdash.socket, or set SWIZDASH_PORT')
  process.exit(1)
}

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)))
