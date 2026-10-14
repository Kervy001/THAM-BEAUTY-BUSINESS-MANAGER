import test from 'node:test'
import assert from 'node:assert/strict'
import { code128Widths, qrMatrix, lookupCode, stockMatchesFor, codeOf } from '../src/lib/codes.js'

test('Code 128 : structure (start B + données + contrôle + stop)', () => {
  const w = code128Widths('LF-12')
  assert.equal(w.length, 6 * 7 + 7) // 7 symboles de 6 largeurs + stop de 7
  assert.equal(w.reduce((a, b) => a + b, 0), 11 * (1 + 5 + 1) + 13) // 7 symboles de 11 modules + stop de 13
  assert.deepEqual(w.slice(0, 6), [2, 1, 1, 2, 1, 4]) // START B = 211214
  assert.deepEqual(w.slice(-7), [2, 3, 3, 1, 1, 1, 2]) // STOP
  assert.deepEqual(code128Widths(''), [])
})

test('Code QR : taille selon la longueur et motifs de repérage', () => {
  assert.equal(qrMatrix('A').length, 21)
  assert.equal(qrMatrix('x'.repeat(15)).length, 25)
  assert.equal(qrMatrix('x'.repeat(106)).length, 41)
  assert.throws(() => qrMatrix('x'.repeat(107)))
  const m = qrMatrix('TBK7M2QX')
  for (let i = 0; i < 7; i++) { assert.equal(m[0][i], true); assert.equal(m[6][i], true); assert.equal(m[i][0], true) } // coin haut-gauche
  assert.equal(m[3][3], true)
})

test('Recherche d’un produit par code (variante > produit, sans tenir compte de la casse)', () => {
  const products = [
    { id: 'p1', name: 'Lace', sku: 'LF', variants: [{ id: 'v1', label: '12', sku: 'LF-12', barcode: '6191234567890' }, { id: 'v2', label: '14', sku: 'LF-14' }] },
    { id: 'p2', name: 'Bundle', sku: 'BD', barcode: 'TB123456', variants: [] }
  ]
  assert.equal(lookupCode('6191234567890', products).variant.id, 'v1')
  assert.equal(lookupCode(' lf-14 ', products).variant.id, 'v2')
  assert.equal(lookupCode('tb123456', products).product.id, 'p2')
  assert.equal(lookupCode('LF', products).variant, null)
  assert.equal(lookupCode('inconnu', products), null)
  assert.equal(codeOf(products[0].variants[0]), '6191234567890')
  assert.equal(codeOf(products[0].variants[1]), 'LF-14')
  const options = [{ it: { id: 'i1', productId: 'p1', variantId: 'v1', sku: 'LF-12' } }, { it: { id: 'i2', productId: 'p1', variantId: 'v2', sku: 'LF-14' } }, { it: { id: 'i3', productId: '', sku: 'LIBRE-1' } }]
  assert.deepEqual(stockMatchesFor('LF-14', products, options).map((o) => o.it.id), ['i2'])
  assert.deepEqual(stockMatchesFor('LF', products, options).map((o) => o.it.id), ['i1', 'i2'])
  assert.deepEqual(stockMatchesFor('libre-1', products, options).map((o) => o.it.id), ['i3'])
})
