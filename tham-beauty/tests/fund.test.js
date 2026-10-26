import test from 'node:test'
import assert from 'node:assert/strict'
import { fundSummary, restockSuggestions } from '../src/lib/fund.js'

const costing = { p1: { perItem: { a: { unitCostRef: 10 }, b: { unitCostRef: 20 } } } }
const mk = (items, paid, qty = 10, price = 20) => ({ id: 's' + Math.random(), status: 'valide', date: '2026-10-10', currency: 'USD', rate: 135,
  lines: [{ itemId: 'a', projectId: 'p1', qty, unitPrice: price, qtyReturned: 0, discount: { type: 'fixed', value: 0 } }],
  globalDiscount: { type: 'fixed', value: 0 }, payments: paid ? [{ type: 'payment', amount: paid, currency: 'USD', rate: 135, status: 'valide' }] : [], returns: [] })

test('fonds : coût de revient + % du bénéfice, au prorata de l\'encaissé', () => {
  // vente 10 x 20 = 200 ; coût 100 ; bénéfice 100 ; payé 200 => 100 + 30 % de 100 = 130
  const full = fundSummary({ sales: [mk(0, 200)] }, costing, 'USD', 30)
  assert.equal(full.allocated, 130)
  // payé la moitié => 65
  const half = fundSummary({ sales: [mk(0, 100)] }, costing, 'USD', 30)
  assert.equal(half.allocated, 65)
  // rien payé => 0
  assert.equal(fundSummary({ sales: [mk(0, 0)] }, costing, 'USD', 30).allocated, 0)
})

test('fonds : mouvements, annulations et disponible', () => {
  const D = { sales: [mk(0, 200)], fundMoves: [
    { type: 'reinvest', amount: 50, currency: 'USD', rate: 135, projectId: 'p9' },
    { type: 'withdraw', amount: 20, currency: 'USD', rate: 135 },
    { type: 'deposit', amount: 10, currency: 'USD', rate: 135 },
    { type: 'reinvest', amount: 500, currency: 'USD', rate: 135, status: 'annule' }
  ] }
  const f = fundSummary(D, costing, 'USD', 30)
  assert.equal(f.available, 130 + 10 - 50 - 20)
  assert.equal(f.perProject.p9, 50)
})

test('fonds : jamais plus que l\'argent encaissé (vente sous le coût)', () => {
  const f = fundSummary({ sales: [mk(0, 50, 10, 5)] }, costing, 'USD', 30) // vendu 50, coût 100
  assert.ok(f.allocated <= 50)
})

test('sijesyon : classement, quantité et budget', () => {
  const now = Date.parse('2026-10-20')
  const D = {
    projects: [{ id: 'p1', rate: 135, orderDate: '2026-09-01', items: [
      { id: 'a', label: 'Rapide', qtyReceived: 20, plannedPrice: 30, plannedCurrency: 'USD' },
      { id: 'b', label: 'Lent', qtyReceived: 20, plannedPrice: 40, plannedCurrency: 'USD' }] }],
    sales: [{ status: 'valide', date: '2026-10-10', lines: [{ itemId: 'a', qty: 18, qtyReturned: 0 }, { itemId: 'b', qty: 2, qtyReturned: 0 }] }]
  }
  const s = restockSuggestions(D, costing, 'USD', 300, { now })
  assert.equal(s.rows[0].label, 'Rapide') // plus de bénéfice par jour
  assert.ok(s.spent <= 300)
  s.rows.forEach((r) => assert.ok(r.qty >= 0))
})

test('fonds : montant fixe décidé, plafonné au bénéfice encaissé', () => {
  const D = { sales: [mk(0, 200)] } // capital 100 + bénéfice encaissé 100
  assert.equal(fundSummary(D, costing, 'USD', { mode: 'fixed', fixedAmount: 40 }).allocated, 140)
  assert.equal(fundSummary(D, costing, 'USD', { mode: 'fixed', fixedAmount: 999 }).allocated, 200) // plafonné
  assert.equal(fundSummary(D, costing, 'USD', { mode: 'fixed', fixedAmount: 0 }).allocated, 100)
  assert.equal(fundSummary(D, costing, 'USD', { mode: 'percent', profitPct: 50 }).allocated, 150)
})
