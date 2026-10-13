import test from 'node:test'
import assert from 'node:assert/strict'
import { computeMetrics } from '../src/lib/metrics.js'
import { projectCosting, saleProfit, periodRange } from '../src/lib/calc.js'

const mk = () => {
  const projects = [
    { id: 'p1', number: 'PRJ-1', name: 'A', status: 'vente', currency: 'USD', rate: 135, orderDate: '2026-09-01', items: [{ id: 'i1', productId: 'x', qtyOrdered: 10, qtyReceived: 10, unitCost: 20, plannedPrice: 50, plannedCurrency: 'USD' }], supplierPayments: [{ amount: 100, currency: 'USD', rate: 135, date: '2026-10-02' }] },
    { id: 'p2', number: 'PRJ-2', name: 'B', status: 'vente', currency: 'USD', rate: 135, orderDate: '2026-09-01', items: [{ id: 'i2', productId: 'y', qtyOrdered: 10, qtyReceived: 10, unitCost: 30, plannedPrice: 80, plannedCurrency: 'USD' }], supplierPayments: [] }
  ]
  const expenses = [{ id: 'e1', projectId: 'p1', amount: 50, currency: 'USD', rate: 135, date: '2026-10-03' }, { id: 'e2', projectId: '', amount: 13500, currency: 'HTG', rate: 135, date: '2026-10-04' }]
  const costing = {}
  projects.forEach((p) => (costing[p.id] = projectCosting(p, expenses.filter((e) => e.projectId === p.id), 'USD')))
  const sales = [{ id: 's1', status: 'valide', date: '2026-10-05', currency: 'USD', rate: 135, customerId: 'c1', customerName: 'C', delivery: 'a_livrer',
    lines: [{ id: 'l1', projectId: 'p1', itemId: 'i1', label: 'A', qty: 2, unitPrice: 50 }, { id: 'l2', projectId: 'p2', itemId: 'i2', label: 'B', qty: 1, unitPrice: 100 }],
    globalDiscount: { type: 'fixed', value: 20 }, payments: [{ id: 'pay', type: 'payment', amount: 6750, currency: 'HTG', rate: 135, date: '2026-10-06', status: 'valide' }] }]
  return { D: { projects, expenses, sales, suppliers: [], customers: [], products: [] }, costing, ref: 'USD', rate: 135, settings: { lowStock: 3 } }
}

test('réduction globale fixe : filtre par projet sans la compter deux fois', () => {
  const ctx = mk()
  const s = ctx.D.sales[0]
  const a = saleProfit(s, {}, ctx.costing, 'USD', (l) => l.projectId === 'p1')
  const b = saleProfit(s, {}, ctx.costing, 'USD', (l) => l.projectId === 'p2')
  const all = saleProfit(s, {}, ctx.costing, 'USD')
  assert.equal(Math.round((a.discount + b.discount) * 100) / 100, 20)
  assert.equal(Math.round((a.revenue + b.revenue) * 100) / 100, Math.round(all.revenue * 100) / 100)
  assert.equal(all.revenue, 180)
})

test('indicateurs du tableau de bord', () => {
  const ctx = mk()
  const m = computeMetrics(ctx, { range: periodRange('tout') })
  assert.equal(m.net, 180)
  assert.equal(m.gross, 200)
  assert.equal(m.discount, 20)
  assert.equal(m.nbSales, 1)
  assert.equal(m.expGeneral, 100)       // 13500 HTG / 135
  assert.equal(m.cashIn, 50)            // 6750 HTG / 135
  assert.equal(m.cashOut, 100 + 50 + 100) // fournisseur + dépense projet + dépense générale
  assert.equal(m.receivables, 130)
  assert.equal(m.refs, 2)
  assert.equal(m.available, 17)
  // coût : p1 20+5 (frais 50/10) = 25/unité ; p2 30
  assert.equal(m.cogs, 2 * 25 + 30)
  const only = computeMetrics(ctx, { range: periodRange('tout'), projectId: 'p1' })
  assert.equal(only.expGeneral, 0)
  assert.equal(only.nbSales, 1)
})
