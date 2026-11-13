import test from 'node:test'
import assert from 'node:assert/strict'
import { createWedge } from '../src/lib/wedgeCore.js'

function rig() {
  const got = []
  let t = 1000
  const w = createWedge(() => (c) => got.push(c), () => t)
  const key = (k, gap) => { t += gap; const e = { key: k, target: {}, prevented: false, preventDefault() { this.prevented = true }, stopPropagation() {} }; w.onKey(e); return e }
  return { got, key, w }
}

test('scanner : rafale rapide + Entrée = un scan', () => {
  const { got, key, w } = rig()
  '123456789012'.split('').forEach((c, i) => key(c, i === 0 ? 500 : 8))
  const enter = key('Enter', 8)
  assert.deepEqual(got, ['123456789012']); assert.ok(enter.prevented); w.dispose()
})

test('scanner : la saisie humaine (lente) n’est jamais prise pour un scan', () => {
  const { got, key, w } = rig()
  const evs = '123456'.split('').map((c) => key(c, 150))
  key('Enter', 150)
  assert.deepEqual(got, []); assert.ok(evs.every((e) => !e.prevented)); w.dispose()
})

test('scanner : deux scans de suite', () => {
  const { got, key, w } = rig()
  for (const code of ['TBABCD12', '99887766']) { code.split('').forEach((c, i) => key(c, i === 0 ? 400 : 10)); key('Enter', 10) }
  assert.deepEqual(got, ['TBABCD12', '99887766']); w.dispose()
})

test('scanner : code trop court ignoré', () => {
  const { got, key, w } = rig()
  '12'.split('').forEach((c, i) => key(c, i === 0 ? 400 : 10)); key('Enter', 10)
  assert.deepEqual(got, []); w.dispose()
})
