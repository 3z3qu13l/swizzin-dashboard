import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { config } from './config.ts'
import { live } from './system.ts'

// Every 10 s one row in `raw`, kept 2 days. Every 5 minutes the averages go to
// `rollup`, kept 35 days. Charts read whichever table covers their range.
const RAW_KEEP = 2 * 86400_000
const ROLLUP_KEEP = 35 * 86400_000
const ROLLUP_STEP = 300_000

const cols = ['cpu', 'iowait', 'load1', 'mem', 'swap', 'rx', 'tx'] as const

let db: DatabaseSync | null = null

function open(): DatabaseSync {
  if (db) return db
  mkdirSync(config.dataDir, { recursive: true })
  db = new DatabaseSync(join(config.dataDir, 'history.db'))
  db.exec('PRAGMA journal_mode = WAL')
  for (const t of ['raw', 'rollup']) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${t} (ts INTEGER PRIMARY KEY, ${cols.map((c) => `${c} REAL`).join(', ')})`)
  }
  return db
}

function record(): void {
  const l = live()
  if (!l) return
  const d = open()
  d.prepare(`INSERT OR REPLACE INTO raw VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    Math.floor(l.at / 1000) * 1000,
    l.cpu,
    l.iowait,
    l.load[0],
    l.mem.percent,
    l.swap.percent,
    l.net.rx,
    l.net.tx,
  )
}

function rollup(): void {
  const d = open()
  const last = (d.prepare('SELECT MAX(ts) AS m FROM rollup').get() as { m: number | null }).m ?? 0
  const until = Math.floor(Date.now() / ROLLUP_STEP) * ROLLUP_STEP
  d.prepare(
    `INSERT OR REPLACE INTO rollup SELECT (ts / ${ROLLUP_STEP}) * ${ROLLUP_STEP} AS b, ${cols.map((c) => `AVG(${c})`).join(', ')}
     FROM raw WHERE ts >= ? AND ts < ? GROUP BY b`,
  ).run(last + ROLLUP_STEP, until)
  d.prepare('DELETE FROM raw WHERE ts < ?').run(Date.now() - RAW_KEEP)
  d.prepare('DELETE FROM rollup WHERE ts < ?').run(Date.now() - ROLLUP_KEEP)
}

export function startHistory(): void {
  open()
  setInterval(() => {
    try {
      record()
    } catch {
      // a locked or full disk must not stop the dashboard
    }
  }, 10_000).unref()
  setInterval(() => {
    try {
      rollup()
    } catch {
      // retried next time
    }
  }, 60_000).unref()
}

const ranges: Record<string, { span: number; bucket: number }> = {
  '5m': { span: 300_000, bucket: 10_000 },
  '15m': { span: 900_000, bucket: 10_000 },
  '1h': { span: 3600_000, bucket: 30_000 },
  '6h': { span: 6 * 3600_000, bucket: 120_000 },
  '24h': { span: 86400_000, bucket: 600_000 },
  '7d': { span: 7 * 86400_000, bucket: 3600_000 },
  '30d': { span: 30 * 86400_000, bucket: 4 * 3600_000 },
}

export function history(range: string): { range: string; bucket: number; points: Record<string, number>[] } | null {
  const r = ranges[range]
  if (!r) return null
  const d = open()
  // raw up to 24 hours: the rollup only holds whole 5-minute slices, the last minutes would be missing
  const table = r.span <= RAW_KEEP ? 'raw' : 'rollup'
  const since = Date.now() - r.span
  const rows = d
    .prepare(
      `SELECT (ts / ${r.bucket}) * ${r.bucket} AS t, ${cols.map((c) => `ROUND(AVG(${c}), 2) AS ${c}`).join(', ')}
       FROM ${table} WHERE ts >= ? GROUP BY t ORDER BY t`,
    )
    .all(since) as Record<string, number>[]
  return { range, bucket: r.bucket, points: rows }
}

export function historyStats(): { raw: number; rollup: number; bytes: number } {
  const d = open()
  const count = (t: string) => (d.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n
  let bytes = 0
  for (const f of ['history.db', 'history.db-wal']) {
    try {
      bytes += statSync(join(config.dataDir, f)).size
    } catch {
      // no WAL yet
    }
  }
  return { raw: count('raw'), rollup: count('rollup'), bytes }
}

export function clearHistory(): void {
  const d = open()
  d.exec('DELETE FROM raw; DELETE FROM rollup; VACUUM')
}
