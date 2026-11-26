import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, parseCpuList, parseLsRemote, parseMicrocode, throttleTotals } from '../src/parse.ts'

test('git ls-remote: the commit of the asked branch only', () => {
  const hash = '41a8705763e7aae16091eb03d81f0a0bb71f9f9c'
  assert.equal(parseLsRemote(`${hash}\trefs/heads/master\n`, 'refs/heads/master'), hash)
  assert.equal(parseLsRemote(`${hash}\trefs/heads/masterx\n`, 'refs/heads/master'), null)
  assert.equal(parseLsRemote('', 'refs/heads/master'), null)
  assert.equal(parseLsRemote('fatal: repository not found\trefs/heads/master', 'refs/heads/master'), null)
})

test('versions compare by number, with or without a v', () => {
  assert.equal(compareVersions('0.1.10', '0.1.9'), 1)
  assert.equal(compareVersions('v0.1.2', '0.1.2'), 0)
  assert.equal(compareVersions('0.1', '0.1.0'), 0)
  assert.equal(compareVersions('0.1.2', '0.2.0'), -1)
  assert.equal(compareVersions('dev', '0.1.2'), null)
  assert.equal(compareVersions('0.2.0-rc1', '0.1.2'), null)
})

test('kernel CPU lists', () => {
  assert.deepEqual(parseCpuList('0-3\n'), [0, 1, 2, 3])
  assert.deepEqual(parseCpuList('0,2-3,7'), [0, 2, 3, 7])
  assert.deepEqual(parseCpuList('\n'), [])
})

test('microcode: one entry per value, the hypervisor placeholder dropped', () => {
  const cpu = (mc: string) => `processor\t: 0\nmodel name\t: Intel\nmicrocode\t: ${mc}\n`
  assert.deepEqual(parseMicrocode([cpu('0xF4'), cpu('0xf4')].join('\n')), ['0xf4'])
  assert.deepEqual(parseMicrocode([cpu('0xf4'), cpu('0xf0')].join('\n')), ['0xf4', '0xf0'])
  assert.deepEqual(parseMicrocode(cpu('0xffffffff')), [])
  assert.deepEqual(parseMicrocode('processor\t: 0\n'), [])
})

test('thermal throttling: each core and package counted once', () => {
  // 2 cores with 2 threads each, on one package
  const cpus = [
    { package: 0, core: 0, coreCount: 5, packageCount: 12 },
    { package: 0, core: 0, coreCount: 5, packageCount: 12 },
    { package: 0, core: 1, coreCount: 0, packageCount: 12 },
    { package: 0, core: 1, coreCount: 0, packageCount: 12 },
  ]
  assert.deepEqual(throttleTotals(cpus), { core: 5, package: 12, throttledCores: 1 })
  assert.deepEqual(throttleTotals([...cpus, { package: 1, core: 0, coreCount: 2, packageCount: 3 }]), { core: 7, package: 15, throttledCores: 2 })
  // virtual machines have no counter: not reported rather than zero
  assert.equal(throttleTotals([{ package: 0, core: 0, coreCount: null, packageCount: null }]), null)
  assert.equal(throttleTotals([]), null)
})
