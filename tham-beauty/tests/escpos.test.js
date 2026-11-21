import test from 'node:test'
import assert from 'node:assert/strict'
import { receiptToEscpos, clean, pad2, colsFor } from '../src/lib/escpos.js'
import { btPrint, btForget } from '../src/lib/btprint.js'

const setNav = (v) => Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true, writable: true })
const M = { company: { name: 'THAM BEAUTY', address: 'Rue 1, Port-au-Prince', phone: '+509 0000 0000' }, docTitle: 'Reçu de paiement', number: 'V-0001', date: '21/11/2026', customer: 'Marie Jean', seller: 'Itama',
  lines: [{ label: 'Perruque Brésilienne 24 pouces très longue description', qty: 2, unit: '12,50 $', total: '25,00 $', disc: '1,00 $' }, { label: 'Colle', qty: 1, unit: '3,00 $', total: '3,00 $', returned: 1 }],
  totals: [['Net', '27,00 $'], ['Payé', '27,00 $'], ['Solde', '0,00 $', true]], payments: ['21/11/2026 - Paiement 27,00 $ (cash)'], footer: 'Merci pour votre achat !' }
const txt = (u) => Buffer.from(u).toString('latin1')

test('clean : accents retirés, espaces insécables, symboles', () => {
  assert.equal(clean('Reçu à 1 250,00 $ — l’été'), "Recu a 1 250,00 $ - l'ete")
  assert.equal(clean('Reçu', true), 'Reçu')
})
test('pad2 : justifié ou sur deux lignes', () => {
  assert.equal(pad2('Net', '27,00 $', 20)[0].length, 20)
  assert.equal(pad2('A'.repeat(30), '12,00 $', 32).length, 2)
})
test('reçu ESC/POS : init, texte, lignes ≤ colonnes, pas de caractères > 0x7e sans accents', () => {
  const u = receiptToEscpos(M, { cols: 32, accents: false, cut: true })
  assert.deepEqual([...u.slice(0, 2)], [0x1b, 0x40])
  assert.deepEqual([...u.slice(-4)], [0x1d, 0x56, 66, 0])
  const body = [...u].slice(2, -4)
  assert.ok(!body.some((b) => b > 0x7e && b !== 0x7f), 'octets hors ASCII')
  for (const l of txt(u).split('\n')) { const t = l.replace(/[\x00-\x1f]/g, '').replace(/^[!&-0@-Ea-z]{0,0}/, ''); assert.ok(t.length <= 36, l) }
  assert.match(txt(u), /Recu de paiement/); assert.match(txt(u), /Solde/); assert.match(txt(u), /retourne : 1/)
})
test('reçu ESC/POS avec accents : CP858 sélectionnée et « é » = 0x82', () => {
  const u = receiptToEscpos(M, { cols: 32, accents: true })
  assert.ok(u.join(',').includes('27,116,19'))
  assert.ok([...u].includes(0x82))
})
test('colsFor', () => { assert.equal(colsFor('ticket58'), 32); assert.equal(colsFor('ticket'), 48); assert.ok(colsFor('ticketc', 72) >= 24) })

test('btPrint : choisit la caractéristique inscriptible et envoie par blocs', async () => {
  const sent = []
  const wchar = { properties: { writeWithoutResponse: true, write: false }, writeValueWithoutResponse: async (p) => { sent.push(p.length) } }
  const dev = { name: 'PT-210', gatt: { connected: false, connect: async () => { dev.gatt.connected = true; return { getPrimaryServices: async () => [{ getCharacteristics: async () => [{ properties: { read: true } }, wchar] }] } } } }
  setNav({ bluetooth: { requestDevice: async () => dev } })
  btForget()
  await btPrint(new Uint8Array(70), { pick: true, delay: 0 })
  assert.deepEqual(sent, [20, 20, 20, 10])
  await btPrint(new Uint8Array(5), { delay: 0 }) // réutilise l'appareil
  assert.equal(sent.length, 5)
})
test('btPrint : imprimante sans caractéristique BLE inscriptible → message clair', async () => {
  const dev = { name: 'X', gatt: { connected: false, connect: async () => { dev.gatt.connected = true; return { getPrimaryServices: async () => [{ getCharacteristics: async () => [{ properties: { read: true } }] }] } } } }
  setNav({ bluetooth: { requestDevice: async () => dev } })
  btForget()
  await assert.rejects(() => btPrint(new Uint8Array(3), { pick: true }), /Bluetooth classique/)
})
test('btPrint : navigateur sans Web Bluetooth', async () => {
  setNav({})
  btForget()
  await assert.rejects(() => btPrint(new Uint8Array(3)), /Bluetooth indisponible/)
})

test('ligne justifiée : les espaces du milieu sont conservés à l\'envoi', () => {
  const u = receiptToEscpos({ lines: [], totals: [['Net', '24,00 $']] }, { cols: 32, feed: 0 })
  assert.ok(txt(u).includes('Net' + ' '.repeat(32 - 3 - 7) + '24,00 $'))
})
