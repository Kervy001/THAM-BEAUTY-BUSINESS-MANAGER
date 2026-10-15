import test from 'node:test'
import assert from 'node:assert/strict'
import { itemStock, itemStockAt, commissionOf, sellerStats, saleSummary } from '../src/lib/calc.js'
import { waPhone, waLink, saleMessage, reminderMessage } from '../src/lib/whatsapp.js'

const item = { id: 'i1', qtyReceived: 20, qtyLost: 1, locationId: 'main', transfers: [{ from: 'main', to: 'depot', qty: 6 }], adjustments: [{ qty: -2, locationId: 'depot' }, { qty: 1 }] }
const sales = [
  { id: 's1', status: 'valide', locationId: 'main', lines: [{ itemId: 'i1', qty: 5, qtyReturned: 1 }] },
  { id: 's2', status: 'valide', locationId: 'depot', lines: [{ itemId: 'i1', qty: 2, qtyReturned: 0 }] },
  { id: 's3', status: 'annule', locationId: 'main', lines: [{ itemId: 'i1', qty: 9, qtyReturned: 0 }] }
]

test('Stock par lieu : la somme des lieux = le stock total (transferts, ajustements, ventes, retours)', () => {
  const total = itemStock(item, sales).remaining
  const main = itemStockAt(item, sales, 'main')
  const depot = itemStockAt(item, sales, 'depot')
  assert.equal(total, 20 - 5 + 1 - 2 - 1 + (-2 + 1)) // reçu − vendu + retourné − vendu s2 − perdu + ajustements
  assert.equal(main + depot, total)
  assert.equal(main, 20 - 1 - 6 + 1 - (5 - 1)) // 10
  assert.equal(depot, 6 - 2 - 2) // 2
})

test('Ancien article sans lieu : tout est dans le lieu principal', () => {
  const old = { id: 'x', qtyReceived: 10 }
  assert.equal(itemStockAt(old, [], 'main'), 10)
  assert.equal(itemStockAt(old, [], 'depot'), 0)
})

test('Commission : % du CA ou du bénéfice, désactivable', () => {
  assert.equal(commissionOf({ enabled: true, rate: 5, basis: 'ca' }, 1000, 300), 50)
  assert.equal(commissionOf({ enabled: true, rate: 10, basis: 'profit' }, 1000, 300), 30)
  assert.equal(commissionOf({ enabled: false, rate: 10 }, 1000, 300), 0)
  assert.equal(commissionOf(undefined, 1000, 300), 0)
})

test('Totaux par vendeur (ventes annulées exclues)', () => {
  const ss = [
    { status: 'valide', currency: 'USD', rate: 135, sellerName: 'Marie', lines: [{ qty: 2, unitPrice: 100, qtyReturned: 0, projectId: 'p', itemId: 'i', costSnapshot: 40 }], payments: [] },
    { status: 'valide', currency: 'USD', rate: 135, sellerName: 'Marie', lines: [{ qty: 1, unitPrice: 50, qtyReturned: 0, projectId: 'p', itemId: 'i', costSnapshot: 20 }], payments: [] },
    { status: 'annule', currency: 'USD', rate: 135, sellerName: 'Jean', lines: [{ qty: 1, unitPrice: 500, qtyReturned: 0 }], payments: [] }
  ]
  const g = sellerStats(ss, {}, 'USD', (s) => s.sellerName)
  assert.equal(Object.keys(g).length, 1)
  assert.equal(g.Marie.count, 2)
  assert.equal(g.Marie.ca, 250)
  assert.equal(g.Marie.profit, 250 - (2 * 40 + 20))
})

test('WhatsApp : numéros haïtiens et messages', () => {
  assert.equal(waPhone('37 01-2345'), '50937012345')
  assert.equal(waPhone('+509 3701 2345'), '50937012345')
  assert.equal(waPhone('0050937012345'), '50937012345')
  assert.equal(waPhone('+1 305 555 0100'), '13055550100')
  assert.equal(waPhone('', '509'), '')
  assert.match(waLink('37012345', 'Bonjour é'), /^https:\/\/wa\.me\/50937012345\?text=Bonjour%20%C3%A9$/)
  const s = { number: 'VTE-1', date: '2026-10-05', currency: 'USD', rate: 135, customerName: 'Marie', lines: [{ id: 'l', label: 'Lace', qty: 2, unitPrice: 100, qtyReturned: 0 }], payments: [{ type: 'payment', amount: 50, currency: 'USD', rate: 135, status: 'valide' }] }
  const r = saleSummary(s)
  const m = saleMessage(s, r, { name: 'THAM BEAUTY' })
  assert.match(m, /VTE-1/); assert.match(m, /Lace × 2/); assert.match(m, /Reste à payer/)
  assert.match(reminderMessage(s, r, { name: 'THAM BEAUTY' }), /reste à payer/)
})

import { stockRows, lowStockRows } from '../src/lib/stockRows.js'
test('Lignes de stock par lieu et alertes de stock bas', () => {
  const D = {
    projects: [
      { id: 'p1', number: 'PRJ-1', items: [{ id: 'a', label: 'Lace 12', sku: 'LF-12', productId: 'pr1', variantId: 'v1', qtyReceived: 10, transfers: [{ from: 'main', to: 'depot', qty: 4 }] }, { id: 'b', label: 'Parfum', sku: 'PF', productId: 'pr2', variantId: '', qtyReceived: 2 }] },
      { id: 'p2', number: 'PRJ-2', items: [{ id: 'c', label: 'Lace 12', sku: 'LF-12', productId: 'pr1', variantId: 'v1', qtyReceived: 3, locationId: 'depot' }] }
    ],
    sales: [{ status: 'valide', locationId: 'main', lines: [{ itemId: 'a', qty: 1, qtyReturned: 0 }] }]
  }
  const main = stockRows(D, {}, 'main', 'main')
  const depot = stockRows(D, {}, 'depot', 'main')
  assert.equal(main.find((r) => r.sku === 'LF-12').expected, 10 - 4 - 1)
  assert.equal(depot.find((r) => r.sku === 'LF-12').expected, 4 + 3)
  assert.equal(stockRows(D, {}).find((r) => r.sku === 'LF-12').expected, 10 - 1 + 3) // total, lots regroupés
  assert.deepEqual(lowStockRows(D, 3).map((r) => r.sku), ['PF'])
})
