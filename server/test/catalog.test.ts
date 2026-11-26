import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The root helper trusts the catalog: it must stay well formed.
const catalog = JSON.parse(readFileSync(new URL('../../catalog/apps.json', import.meta.url), 'utf8'))

test('every app is complete and its id is unique', () => {
  const ids = new Set<string>()
  for (const a of catalog.apps) {
    assert.match(a.id, /^[a-z0-9_-]{1,32}$/, a.id)
    assert.ok(!ids.has(a.id), `duplicate ${a.id}`)
    ids.add(a.id)
    assert.ok(a.name && a.desc, a.id)
    assert.ok(catalog.categories.includes(a.category), `${a.id}: unknown category ${a.category}`)
    assert.ok(Array.isArray(a.units), a.id)
  }
})

test('units match what the helper accepts', () => {
  for (const a of catalog.apps) for (const u of a.units) assert.match(u, /^[a-z0-9-]{1,40}@?$/, `${a.id}: ${u}`)
})

test('version patterns compile and have a group', () => {
  for (const a of catalog.apps) {
    const re = a.version?.re
    if (!re) continue
    assert.ok(new RegExp(re).source.includes('('), `${a.id}: no group in ${re}`)
  }
})

test('web paths and links are well formed', () => {
  for (const a of catalog.apps) {
    if (a.web !== null) assert.match(a.web, /^\/([a-z0-9._-]+\/)*$/, a.id)
    if (a.link) {
      assert.ok(['http', 'https'].includes(a.link.scheme), a.id)
      assert.ok(a.link.port || /^[a-z0-9-]+$/.test(a.link.site), a.id)
      assert.match(a.link.path, /^\//, a.id)
    }
  }
})

test('paths are absolute, {user} is the only placeholder', () => {
  for (const a of catalog.apps) {
    for (const p of Object.values(a.paths) as string[]) {
      assert.match(p, /^\//, `${a.id}: ${p}`)
      assert.doesNotMatch(p.replaceAll('{user}', 'x'), /[{}]/, `${a.id}: ${p}`)
    }
  }
})
