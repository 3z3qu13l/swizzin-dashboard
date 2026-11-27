import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  allowedUnit,
  firstMatch,
  jobResult,
  parseAptList,
  parseAptPolicy,
  parseMdstat,
  parseSystemctlShow,
  releaseTag,
  statusOf,
  versionNumber,
  type UnitState,
} from '../src/parse.ts'

test('systemctl show: one state per unit, users of templates, unknown units dropped', () => {
  const text = [
    'Id=rtorrent@bob.service\nLoadState=loaded\nActiveState=active\nSubState=running\nUnitFileState=enabled',
    'Id=sonarr.service\nLoadState=loaded\nActiveState=failed\nSubState=failed\nUnitFileState=enabled',
    'Id=ghost.service\nLoadState=not-found\nActiveState=inactive\nSubState=dead\nUnitFileState=',
  ].join('\n\n')
  const m = parseSystemctlShow(text)
  assert.deepEqual([...m.keys()], ['rtorrent@bob', 'sonarr'])
  assert.deepEqual(m.get('rtorrent@bob'), { unit: 'rtorrent@bob', user: 'bob', active: 'active', sub: 'running', enabled: 'enabled' })
  assert.equal(m.get('sonarr')?.user, null)
})

const unit = (active: string): UnitState => ({ unit: 'u', user: null, active, sub: '', enabled: 'enabled' })

test('status of an app from its units', () => {
  assert.equal(statusOf([]), 'none')
  assert.equal(statusOf([unit('active'), unit('activating')]), 'running')
  assert.equal(statusOf([unit('active'), unit('inactive')]), 'partial')
  assert.equal(statusOf([unit('active'), unit('failed')]), 'partial')
  assert.equal(statusOf([unit('failed'), unit('inactive')]), 'failed')
  assert.equal(statusOf([unit('inactive')]), 'stopped')
})

test('only catalog units, and templates for plain user names', () => {
  const units = ['sonarr', 'rtorrent@']
  assert.equal(allowedUnit(units, 'sonarr'), true)
  assert.equal(allowedUnit(units, 'rtorrent@bob'), true)
  assert.equal(allowedUnit(units, 'rtorrent@'), false)
  assert.equal(allowedUnit(units, 'rtorrent@../root'), false)
  assert.equal(allowedUnit(units, 'rtorrent@Bob'), false)
  assert.equal(allowedUnit(units, 'sonarr2'), false)
  assert.equal(allowedUnit(units, 'ssh'), false)
})

test('versions found in program output', () => {
  const re = 'version ([0-9]+(?:\\.[0-9]+)*)'
  assert.equal(firstMatch("Rakshasa's BitTorrent client version 0.16.28.", re), '0.16.28')
  assert.equal(firstMatch('no version here', re), null)
  assert.equal(firstMatch('  2.8.0\nmore', undefined), '2.8.0')
  assert.equal(firstMatch('', undefined), null)
})

test('apt list --upgradable', () => {
  const text = [
    'Listing...',
    'firefox-esr/stable-security 153.8.0esr-1~deb13u1 amd64 [upgradable from: 153.7.0esr-1~deb13u1]',
    'nginx/trixie-updates 1.26.4-1 amd64 [upgradable from: 1.26.3-1]',
    'garbage line',
  ].join('\n')
  assert.deepEqual(parseAptList(text), [
    { name: 'firefox-esr', origin: 'stable-security', version: '153.8.0esr-1~deb13u1', from: '153.7.0esr-1~deb13u1', security: true },
    { name: 'nginx', origin: 'trixie-updates', version: '1.26.4-1', from: '1.26.3-1', security: false },
  ])
})

test('mdstat: healthy, rebuilding and faulty arrays', () => {
  const mdstat = `Personalities : [raid1] [raid6] [raid5] [raid4]
md1 : active raid5 sdd2[3] sdc2[4] sdb2[1] sda2[0]
      5860270080 blocks super 1.2 level 5, 512k chunk, algorithm 2 [4/3] [UUU_]
      [=========>...........]  recovery = 47.7% (930978516/1953423360) finish=51.3min speed=174235K/sec
      bitmap: 2/15 pages [8KB], 65536KB chunk

md0 : active raid1 sdb1[1] sda1[0](F)
      1953382400 blocks super 1.2 [2/1] [_U]

md2 : active raid1 sdf1[1] sde1[0]
      976630464 blocks super 1.2 [2/2] [UU]

unused devices: <none>
`
  const arrays = parseMdstat(mdstat, '/dev/md1 /home ext4 rw 0 0\n/dev/md0 /boot ext4 rw 0 0\n')
  assert.equal(arrays.length, 3)
  const [md1, md0, md2] = arrays
  assert.equal(md1.health, 'rebuilding')
  assert.equal(md1.mount, '/home')
  assert.deepEqual([md1.total, md1.up], [4, 3])
  assert.deepEqual(md1.progress, { action: 'recovery', percent: 47.7, finish: '51.3min', speed: '174235K/sec' })
  assert.equal(md0.health, 'degraded')
  assert.equal(md0.devices.find((d) => d.name === 'sda1')?.state, 'faulty')
  assert.equal(md2.health, 'healthy')
  assert.equal(md2.mount, null)
})

test('job result: exit code and lock file must agree', () => {
  assert.equal(jobResult('Installing...\n', 'install'), null)
  assert.deepEqual(jobResult('...\n[swizdash] exit 0 lock 1\n', 'install'), { state: 'success', exitCode: 0 })
  // box printed an error but exited 0: no lock file, so it failed
  assert.deepEqual(jobResult('[swizdash] exit 0 lock 0\n', 'install'), { state: 'failed', exitCode: 0 })
  assert.deepEqual(jobResult('[swizdash] exit 0 lock 0', 'remove'), { state: 'success', exitCode: 0 })
  assert.deepEqual(jobResult('[swizdash] exit 1 lock 1\n', 'install'), { state: 'failed', exitCode: 1 })
})

test('version numbers from release tags and probes', () => {
  assert.equal(versionNumber('v5.3.27'), '5.3.27')
  assert.equal(versionNumber('release_3.37.1'), '3.37.1')
  assert.equal(versionNumber('5.1.3'), '5.1.3')
  assert.equal(versionNumber('2.19.1-16-ga125cf08'), '2.19.1')
  assert.equal(versionNumber('nightly'), null)
})

test('apt-cache policy: installed and candidate, (none) as null', () => {
  const text = 'jellyfin-server:\n  Installed: 10.11.2+deb13u1\n  Candidate: 10.11.3+deb13u1\n  Version table:\n *** 10.11.2+deb13u1 100\n'
  assert.deepEqual(parseAptPolicy(text), { installed: '10.11.2+deb13u1', candidate: '10.11.3+deb13u1' })
  assert.deepEqual(parseAptPolicy('znc:\n  Installed: (none)\n  Candidate: 1.10.1-1\n'), { installed: null, candidate: '1.10.1-1' })
  assert.deepEqual(parseAptPolicy(''), { installed: null, candidate: null })
})

test('release tag from the redirect of releases/latest', () => {
  assert.equal(releaseTag('https://github.com/Novik/ruTorrent/releases/tag/v5.3.27'), 'v5.3.27')
  assert.equal(releaseTag('https://github.com/SickGear/SickGear/releases/tag/release_3.37.1'), 'release_3.37.1')
  assert.equal(releaseTag('https://github.com/a/b/releases/tag/v1.0%2Bbuild'), 'v1.0+build')
  assert.equal(releaseTag('https://github.com/a/b/releases/tag/foo%2Fv1'), 'foo/v1')
  assert.equal(releaseTag('/a/b/releases/tag/v1.2.0'), 'v1.2.0')
  // no release yet: GitHub sends the release list
  assert.equal(releaseTag('https://github.com/a/b/releases'), null)
  assert.equal(releaseTag(null), null)
})
