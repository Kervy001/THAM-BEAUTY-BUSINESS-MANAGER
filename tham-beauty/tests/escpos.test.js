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
  assert.deepEqual(sent, [70])
  await btPrint(new Uint8Array(5), { delay: 0 }) // réutilise l'appareil
  assert.equal(sent.length, 2)
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
  await assert.rejects(() => btPrint(new Uint8Array(3)), /Bluetooth direct/)
})

test('ligne justifiée : les espaces du milieu sont conservés à l\'envoi', () => {
  const u = receiptToEscpos({ lines: [], totals: [['Net', '24,00 $']] }, { cols: 32, feed: 0 })
  assert.ok(txt(u).includes('Net' + ' '.repeat(32 - 3 - 7) + '24,00 $'))
})

import { usbPrint, usbForget } from '../src/lib/usbprint.js'
const mkUsb = (outEp = true) => {
  const sent = []
  const d = { vendorId: 1, productId: 2, productName: 'PT-210', opened: false, configuration: null,
    configurations: [{ configurationValue: 1, interfaces: [{ interfaceNumber: 0, alternates: [{ alternateSetting: 0, interfaceClass: 7, endpoints: outEp ? [{ direction: 'in', type: 'bulk', endpointNumber: 1 }, { direction: 'out', type: 'bulk', endpointNumber: 2 }] : [] }] }] }],
    open: async () => { d.opened = true }, close: async () => { d.opened = false }, selectConfiguration: async () => { d.configuration = { configurationValue: 1 } }, claimInterface: async () => {}, selectAlternateInterface: async () => {},
    transferOut: async (n, data) => { sent.push([n, data.length]) } }
  return { d, sent }
}
test('usbPrint : choisit la sortie bulk OUT et envoie par blocs', async () => {
  const { d, sent } = mkUsb()
  setNav({ usb: { requestDevice: async () => d, getDevices: async () => [] } })
  await usbForget()
  await usbPrint(new Uint8Array(1100), { pick: true })
  assert.deepEqual(sent, [[2, 512], [2, 512], [2, 76]])
})
test('usbPrint : sans sortie utilisable → message clair', async () => {
  const { d } = mkUsb(false)
  setNav({ usb: { requestDevice: async () => d, getDevices: async () => [] } })
  await usbForget()
  await assert.rejects(() => usbPrint(new Uint8Array(3), { pick: true }), /recharger/)
})
test('usbPrint : accès refusé (pilote Windows) → message clair', async () => {
  const { d } = mkUsb(); d.claimInterface = async () => { throw new Error('Access denied') }
  setNav({ usb: { requestDevice: async () => d, getDevices: async () => [] } })
  await usbForget()
  await assert.rejects(() => usbPrint(new Uint8Array(3), { pick: true }), /Windows/)
})
test('usbPrint : navigateur sans WebUSB', async () => {
  setNav({}); await usbForget()
  await assert.rejects(() => usbPrint(new Uint8Array(3)), /USB indisponible/)
})

test('compact : article court + détail + total sur UNE seule ligne ; article long sur plusieurs lignes', () => {
  const u = receiptToEscpos({ lines: [{ label: 'Colle', qty: 1, unit: '3,00 $', total: '3,00 $' }, { label: 'Perruque Brésilienne 24 pouces très longue', qty: 2, unit: '12,50 $', total: '25,00 $' }], totals: [] }, { cols: 32, feed: 0 })
  const rows = txt(u).split('\n').map((x) => x.replace(/[\x00-\x1f]/g, '').replace(/^[!E]+/, ''))
  assert.ok(rows.some((x) => /^Colle\s+1x3,00 \$ 3,00 \$$/.test(x)), rows.join('|'))
  assert.ok(rows.some((x) => /^2 x 12,50 \$\s+25,00 \$$/.test(x)), rows.join('|'))
})
test('compact : numéro et date sur une ligne', () => {
  const u = receiptToEscpos({ number: 'V-0001', date: '21/11/2026', lines: [], totals: [] }, { cols: 32, feed: 0 })
  assert.ok(txt(u).includes('V-0001  21/11/2026'))
})

import { rasterToEscpos, rgbaToGray, logoDots } from '../src/lib/escposLogo.js'
test('logo raster : en-tête GS v 0, 1 = noir, largeur arrondie à 8', () => {
  const w = 10, h = 3, g = new Float32Array(w * h).fill(255)
  g[0] = 0 // pixel noir en haut à gauche
  const u = rasterToEscpos(g, w, h, { dither: false })
  assert.deepEqual([...u.slice(0, 8)], [0x1d, 0x76, 0x30, 0, 2, 0, 3, 0]) // 16 points = 2 octets, 3 lignes
  assert.equal(u.length, 8 + 2 * 3)
  assert.equal(u[8], 0x80); assert.equal(u[9], 0)
})
test('logo raster : bandes de 128 lignes et gris moyen tramé ≈ 50 % de points', () => {
  const w = 64, h = 300, g = new Float32Array(w * h).fill(128)
  const u = rasterToEscpos(g, w, h)
  assert.equal(u.length, 3 * 8 + 8 * 300) // 3 bandes (128+128+44)
  let ones = 0; for (let i = 0; i < u.length; i++) for (let b = 0; b < 8; b++) ones += (u[i] >> b) & 1
  assert.ok(ones > 0.2 * w * h && ones < 0.9 * w * h)
})
test('logo clair sur fond transparent : inversé pour rester visible', () => {
  const rgba = new Uint8ClampedArray(4 * 4); for (let i = 0; i < 4; i++) { rgba.set([255, 255, 255, i < 2 ? 255 : 0], i * 4) }
  const g = rgbaToGray(rgba, 2, 2)
  assert.ok(g[0] < 10 && g[3] > 250) // pixel blanc opaque → noir ; transparent → blanc
})
test('reçu avec logo : octets du logo insérés au début', () => {
  const logo = rasterToEscpos(new Float32Array(16 * 2).fill(0), 16, 2, { dither: false })
  const u = receiptToEscpos({ lines: [], totals: [] }, { cols: 32, logo, feed: 0 })
  assert.ok(u.join(',').includes('29,118,48,0,2,0,2,0'))
})
test('logoDots : largeur selon le papier', () => { assert.ok(logoDots(32, 90) <= 384 && logoDots(48, 90) <= 576 && logoDots(32, 260) === 384) })
test('btPrint : si l’imprimante refuse les gros blocs, repasse à 20 octets', async () => {
  const sent = []
  const wchar = { properties: { writeWithoutResponse: true }, writeValueWithoutResponse: async (p) => { if (p.length > 20) throw new Error('too long'); sent.push(p.length) } }
  const dev = { name: 'P', gatt: { connected: false, connect: async () => { dev.gatt.connected = true; return { getPrimaryServices: async () => [{ getCharacteristics: async () => [wchar] }] } } } }
  setNav({ bluetooth: { requestDevice: async () => dev } })
  btForget()
  await btPrint(new Uint8Array(50), { pick: true, delay: 0 })
  assert.deepEqual(sent, [20, 20, 10])
})
