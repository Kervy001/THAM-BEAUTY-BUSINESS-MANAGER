import test from 'node:test'
import assert from 'node:assert/strict'
const store = new Map()
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
const sec = await import('../src/lib/security.js')

test('PIN : haché, vérifié, refusé si faux, jamais stocké en clair', async () => {
  assert.equal(sec.hasPin('u1'), false)
  await assert.rejects(() => sec.setPin('u1', '12'))
  await assert.rejects(() => sec.setPin('u1', 'abcd'))
  await sec.setPin('u1', '4821')
  assert.equal(sec.hasPin('u1'), true)
  assert.equal(await sec.checkPin('u1', '4821'), true)
  assert.equal(await sec.checkPin('u1', '4822'), false)
  assert.equal(await sec.checkPin('u2', '4821'), false) // autre utilisateur
  assert.ok(![...store.values()].some((v) => v.includes('4821')))
  sec.removePin('u1')
  assert.equal(sec.hasPin('u1'), false)
})

test('Options de verrouillage : valeurs par défaut puis choix de l’utilisateur', () => {
  assert.deepEqual(sec.getLockOpts('u9', { lockMinutes: 10 }), { minutes: 10, onOpen: true })
  sec.setLockOpts('u9', { minutes: 0, onOpen: false })
  assert.deepEqual(sec.getLockOpts('u9', { lockMinutes: 10 }), { minutes: 0, onOpen: false })
})
