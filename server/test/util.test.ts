import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cached, keyed } from '../src/util.ts'

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

test('a slow computation runs once, however many callers wait for it', async () => {
  let runs = 0
  const get = cached(5, async () => {
    runs++
    await tick(30)
    return runs
  })
  // the TTL (5 ms) expires while the first call still runs: no second run
  const first = get()
  await tick(15)
  const second = get()
  assert.equal(await first, 1)
  assert.equal(await second, 1)
  assert.equal(runs, 1)
})

test('the TTL counts from the answer, then a new value is computed', async () => {
  let runs = 0
  const get = cached(20, async () => ++runs)
  assert.equal(await get(), 1)
  assert.equal(await get(), 1)
  await tick(30)
  assert.equal(await get(), 2)
})

test('a failure is not cached', async () => {
  let runs = 0
  const get = cached(60_000, async () => {
    runs++
    if (runs === 1) throw new Error('first try fails')
    return runs
  })
  await assert.rejects(get())
  assert.equal(await get(), 2)
})

test('keyed caches per key, and forget drops one key', async () => {
  let runs = 0
  const get = keyed(60_000, async (k) => `${k}${++runs}`)
  assert.equal(await get('a'), 'a1')
  assert.equal(await get('b'), 'b2')
  assert.equal(await get('a'), 'a1')
  get.forget('a')
  assert.equal(await get('a'), 'a3')
  assert.equal(await get('b'), 'b2')
})
