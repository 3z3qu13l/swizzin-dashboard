import { config } from './config.ts'
import { run } from './util.ts'

export class HelperError extends Error {}

/** Runs the root helper through sudo, see helper/swizdash-helper. */
export async function helper(args: string[], timeoutMs = 30_000): Promise<string> {
  const r = await run('sudo', ['-n', config.helper, ...args], timeoutMs)
  if (!r.ok) {
    // sudo-rs may print warnings about other sudoers files before the helper's own message
    const own = r.stderr.split('\n').findLast((l) => l.startsWith('swizdash-helper:'))
    throw new HelperError(own?.replace(/^swizdash-helper:\s*/, '') ?? `The helper failed (exit code ${r.code})`)
  }
  return r.stdout
}

export async function helperJson<T>(args: string[], timeoutMs?: number): Promise<T> {
  const out = await helper(args, timeoutMs)
  try {
    return JSON.parse(out) as T
  } catch {
    throw new HelperError(`The helper gave no readable answer to ${args[0]}`)
  }
}
