import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'

export interface RunResult {
  ok: boolean
  code: number
  stdout: string
  stderr: string
}

/** Runs a program without a shell. Never throws. */
export function run(file: string, args: string[], timeoutMs = 10_000): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0
      resolve({ ok: !err, code, stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

/** Runs a shell command line from the root-owned catalog (version probes only). */
export function sh(cmd: string, timeoutMs = 10_000): Promise<RunResult> {
  return run('/bin/sh', ['-c', cmd], timeoutMs)
}

export async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/** Caches an async value for ttlMs; concurrent callers share one computation. */
export function cached<T>(ttlMs: number, fn: () => Promise<T>): () => Promise<T> {
  let at = 0
  let value: Promise<T> | null = null
  return () => {
    const now = Date.now()
    if (!value || now - at > ttlMs) {
      at = now
      value = fn().catch((e) => {
        at = 0
        throw e
      })
    }
    return value
  }
}

/** One cache per key; `forget(key)` drops a value that is known to be stale. */
export function keyed<T>(ttlMs: number, fn: (key: string) => Promise<T>): ((key: string) => Promise<T>) & { forget: (key: string) => void } {
  const map = new Map<string, () => Promise<T>>()
  const get = (key: string) => {
    let f = map.get(key)
    if (!f) {
      f = cached(ttlMs, () => fn(key))
      map.set(key, f)
    }
    return f()
  }
  return Object.assign(get, { forget: (key: string) => void map.delete(key) })
}
