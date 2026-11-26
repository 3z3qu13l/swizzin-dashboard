import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, offlineCpus, parseCpuList, parseLsRemote, parseMicrocode, throttleTotals } from '../src/parse.ts'

test('git ls-remote: the commit of the asked branch only', () => {
  const hash = '41a8705763e7aae16091eb03d81f0a0bb71f9f9c'
  assert.equal(parseLsRemote(`${hash}\trefs/heads/master\n`, 'refs/heads/master'), hash)
  assert.equal(parseLsRemote(`${hash}\trefs/heads/masterx\n`, 'refs/heads/master'), null)
  assert.equal(parseLsRemote('', 'refs/heads/master'), null)
  assert.equal(parseLsRemote('fatal: repository not found\trefs/heads/master', 'refs/heads/master'), null)
})

test('versions compare by number, with or without a v, a pre-release before its release', () => {
  assert.equal(compareVersions('0.1.10', '0.1.9'), 1)
  assert.equal(compareVersions('v0.1.2', '0.1.2'), 0)
  assert.equal(compareVersions('0.1', '0.1.0'), 0)
  assert.equal(compareVersions('0.1.2', '0.2.0'), -1)
  assert.equal(compareVersions('dev', '0.1.2'), null)
  assert.equal(compareVersions('0.2.0-rc1', '0.1.2'), 1)
  assert.equal(compareVersions('0.2.0', '0.2.0-rc1'), 1)
  assert.equal(compareVersions('0.2.0-rc1', '0.2.0'), -1)
  assert.equal(compareVersions('0.2.0-rc10', '0.2.0-rc2'), 1)
  assert.equal(compareVersions('0.2.0-rc1', 'v0.2.0-rc1'), 0)
})

test('kernel CPU lists', () => {
  assert.deepEqual(parseCpuList('0-3\n'), [0, 1, 2, 3])
  assert.deepEqual(parseCpuList('0,2-3,7'), [0, 2, 3, 7])
  assert.deepEqual(parseCpuList('\n'), [])
})

test('offline CPUs: only the ones switched off for no stated reason are a problem', () => {
  const all = [0, 1, 2, 3, 4, 5, 6, 7]
  const cmdline = 'BOOT_IMAGE=/boot/vmlinuz root=UUID=x ro quiet'
  assert.deepEqual(offlineCpus(all, all, 'on\n', cmdline), { offline: [], reason: null })
  // an admin took CPU 3 down
  assert.deepEqual(offlineCpus(all, [0, 1, 2, 4, 5, 6, 7], 'on\n', cmdline), { offline: [3], reason: null })
  // SMT switched off (nosmt, mitigations=auto,nosmt or smt/control): the siblings stay present
  assert.deepEqual(offlineCpus(all, [0, 1, 2, 3], 'off\n', `${cmdline} nosmt`), { offline: [4, 5, 6, 7], reason: 'smt' })
  assert.deepEqual(offlineCpus(all, [0, 1, 2, 3], 'forceoff\n', cmdline), { offline: [4, 5, 6, 7], reason: 'smt' })
  // no SMT on this CPU: a CPU down is a real one
  assert.deepEqual(offlineCpus([0, 1, 2, 3], [0, 1, 2], 'notsupported\n', cmdline), { offline: [3], reason: null })
  assert.deepEqual(offlineCpus(all, [0, 1], '', `${cmdline} maxcpus=2`), { offline: [2, 3, 4, 5, 6, 7], reason: 'maxcpus' })
  assert.deepEqual(offlineCpus(all, [0, 1], '', `${cmdline} nomaxcpus=2`), { offline: [2, 3, 4, 5, 6, 7], reason: null })
})

test('microcode: one entry per value, nothing in a virtual machine', () => {
  const cpu = (mc: string, flags = 'fpu vme sse2') => `processor\t: 0\nmodel name\t: Intel\nflags\t\t: ${flags}\nmicrocode\t: ${mc}\n`
  assert.deepEqual(parseMicrocode([cpu('0xF4'), cpu('0xf4')].join('\n')), ['0xf4'])
  assert.deepEqual(parseMicrocode([cpu('0xf4'), cpu('0xf0')].join('\n')), ['0xf4', '0xf0'])
  // made up by the hypervisor: VMware, KVM
  assert.deepEqual(parseMicrocode(cpu('0xffffffff', 'fpu hypervisor sse2')), [])
  assert.deepEqual(parseMicrocode(cpu('0x1', 'fpu sse2 hypervisor')), [])
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
