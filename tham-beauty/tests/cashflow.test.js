import test from 'node:test'
import assert from 'node:assert/strict'
import { changeFor, cashEffect, saleTime } from '../src/lib/cashflow.js'
import { barcodeRaster } from '../src/lib/escposLogo.js'
import { receiptToEscpos } from '../src/lib/escpos.js'

test('monnaie : 80 HTG payés avec 100 → 20 HTG', () => {
  assert.deepEqual(changeFor(100, 80, 'HTG', 135, 'HTG'), { amount: 20, currency: 'HTG' })
  assert.equal(changeFor(80, 80, 'HTG', 135, 'HTG'), null)
})
test('monnaie rendue dans l’autre devise', () => {
  assert.deepEqual(changeFor(100, 80, 'USD', 135, 'HTG'), { amount: 2700, currency: 'HTG' })
})
test('effet en caisse', () => {
  assert.deepEqual(cashEffect({ currency: 'HTG', amount: 80, tendered: 100, change: { amount: 20, currency: 'HTG' } }), { HTG: 80 })
  assert.deepEqual(cashEffect({ currency: 'USD', amount: 80, tendered: 100, change: { amount: 2700, currency: 'HTG' } }), { USD: 100, HTG: -2700 })
  assert.deepEqual(cashEffect({ currency: 'USD', amount: 10 }), { USD: 10 })
})
test('heure de vente', () => { assert.match(saleTime({ createdAtIso: '2026-01-01T14:35:00' }), /^\d\d:\d\d$/); assert.equal(saleTime({}), '') })
test('code-barres ESC/POS', () => {
  const r = barcodeRaster('VTE-2026-0001', { widthDots: 384 })
  assert.equal(r[0], 0x1d); assert.equal(r[1], 0x76)
  const b = receiptToEscpos({ company: {}, lines: [], totals: [], barcodeText: 'VTE-1' }, { cols: 32, barcode: r })
  assert.ok(b.length > r.length)
})
