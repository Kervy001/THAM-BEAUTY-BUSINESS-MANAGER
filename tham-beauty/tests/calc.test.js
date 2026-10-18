import test from 'node:test'
import assert from 'node:assert/strict'
import { priceFromCoef, supplierDiscountAmount, projectStats, markupPct, marginPct, convert, saleTotals, saleSummary, projectCosting, purchaseSummary, itemStock, saleProfit } from '../src/lib/calc.js'

test('conversion USD/HTG', () => {
  assert.equal(convert(10, 'USD', 'HTG', 135), 1350)
  assert.equal(convert(1350, 'HTG', 'USD', 135), 10)
  assert.equal(convert(5, 'USD', 'USD', 135), 5)
})

test('réduction par article : 50 - 5 = 45', () => {
  const t = saleTotals({ lines: [{ qty: 1, unitPrice: 50, discount: { type: 'fixed', value: 5 } }] })
  assert.equal(t.net, 45)
  const p = saleTotals({ lines: [{ qty: 2, unitPrice: 50, discount: { type: 'percent', value: 10 } }] })
  assert.equal(p.net, 90)
})

test('réduction globale : 200 - 15 = 185, répartie sans double déduction', () => {
  const t = saleTotals({
    lines: [{ qty: 1, unitPrice: 120 }, { qty: 1, unitPrice: 80 }],
    globalDiscount: { type: 'fixed', value: 15 }
  })
  assert.equal(t.gross, 200)
  assert.equal(t.net, 185)
  assert.equal(t.lines[0].net, 120 - 9)
  assert.equal(t.lines[1].net, 80 - 6)
  assert.equal(t.totalDiscount, 15)
})

test('coût de revient : transport 100 USD réparti par valeur', () => {
  const project = {
    currency: 'USD', rate: 135, allocMethod: 'value',
    items: [
      { id: 'a', qtyOrdered: 10, qtyReceived: 10, unitCost: 20 }, // 200
      { id: 'b', qtyOrdered: 10, qtyReceived: 10, unitCost: 30 }  // 300
    ]
  }
  const c = projectCosting(project, [{ amount: 100, currency: 'USD', rate: 135 }], 'USD')
  assert.equal(c.perItem.a.share, 40)
  assert.equal(c.perItem.b.share, 60)
  assert.equal(c.perItem.a.unitCostRef, 24)
  assert.equal(c.perItem.b.unitCostRef, 36)
  const q = projectCosting({ ...project, allocMethod: 'qty' }, [{ amount: 100, currency: 'USD', rate: 135 }], 'USD')
  assert.equal(q.perItem.a.share, 50)
})

test('dépense en HTG convertie à son propre taux', () => {
  const project = { currency: 'USD', rate: 135, items: [{ id: 'a', qtyOrdered: 10, qtyReceived: 10, unitCost: 10 }] }
  const c = projectCosting(project, [{ amount: 13700, currency: 'HTG', rate: 137 }], 'USD')
  assert.equal(c.expensesRef, 100)
})

test('taux historiques conservés par commande', () => {
  const mk = (rate) => ({ currency: 'USD', rate, lines: [{ qty: 1, unitPrice: 100 }], payments: [{ amount: 13500, currency: 'HTG', rate: 135 }] })
  assert.equal(saleSummary(mk(135)).paid, 100)
  assert.equal(saleSummary(mk(135)).balance, 0)
  // un autre taux de paiement ne change pas la commande, seulement le crédit
  const s = saleSummary({ currency: 'USD', rate: 135, lines: [{ qty: 1, unitPrice: 100 }], payments: [{ amount: 13500, currency: 'HTG', rate: 140 }] })
  assert.ok(Math.abs(s.paid - 96.4286) < 0.001)
  assert.equal(s.payStatus, 'partiel')
})

test('vente partielle de 40 perruques : stock restant et bénéfice réalisé', () => {
  const project = { id: 'p1', currency: 'USD', rate: 135, items: [{ id: 'w', qtyOrdered: 40, qtyReceived: 40, unitCost: 50 }] }
  const costing = projectCosting(project, [{ amount: 400, currency: 'USD', rate: 135 }], 'USD') // +10/unité
  assert.equal(costing.perItem.w.unitCostRef, 60)
  const sales = [
    { status: 'valide', currency: 'USD', rate: 135, lines: [{ projectId: 'p1', itemId: 'w', qty: 5, unitPrice: 100 }] },
    { status: 'valide', currency: 'USD', rate: 135, lines: [{ projectId: 'p1', itemId: 'w', qty: 8, unitPrice: 90 }] },
    { status: 'valide', currency: 'USD', rate: 135, lines: [{ projectId: 'p1', itemId: 'w', qty: 3, unitPrice: 100, qtyReturned: 1 }] }
  ]
  const st = itemStock(project.items[0], sales)
  assert.equal(st.sold, 16)
  assert.equal(st.remaining, 25)
  const profit = sales.map((s) => saleProfit(s, {}, { p1: costing }, 'USD'))
  assert.equal(profit[0].profit, 5 * 40)
  assert.equal(profit[1].profit, 8 * 30)
  assert.equal(profit[2].profit, 2 * 40)
})

test('dette fournisseur', () => {
  const p = { currency: 'USD', rate: 135, supplierDiscount: 50, items: [{ id: 'a', qtyOrdered: 10, unitCost: 100 }], supplierPayments: [{ amount: 67500, currency: 'HTG', rate: 135 }] }
  const s = purchaseSummary(p)
  assert.equal(s.owed, 950)
  assert.equal(s.paid, 500)
  assert.equal(s.balance, 450)
  assert.equal(s.status, 'partiel')
})

test('stock direct : aucune dette fournisseur', () => {
  const p = { noSupplier: true, currency: 'USD', rate: 135, items: [{ id: 'a', qtyOrdered: 10, unitCost: 100 }], supplierPayments: [] }
  const s = purchaseSummary(p)
  assert.equal(s.owed, 0)
  assert.equal(s.balance, 0)
  assert.equal(s.status, 'paye')
})

test('pourcentages de gain : achat 10, vente 15 → +50 % sur coût, marge 33,3 %', () => {
  assert.equal(markupPct(15, 10), 50)
  assert.ok(Math.abs(marginPct(15, 10) - 33.3333) < 0.001)
  assert.equal(markupPct(15, 0), null)
  assert.equal(marginPct(0, 10), null)
  assert.equal(markupPct(8, 10), -20)
})

test('remise fournisseur : pourcentage du total commandé, même si réception partielle', () => {
  const p = { currency: 'USD', rate: 135, supplierDiscount: 100, items: [{ id: 'a', qtyOrdered: 10, qtyReceived: 5, unitCost: 100 }] }
  assert.equal(projectCosting(p, [], 'USD').perItem.a.unitPurchaseRef, 90)
})

test('remise fournisseur en pourcentage et prix = achat après remise × coefficient', () => {
  const p = { currency: 'USD', rate: 135, supplierDiscount: 10, supplierDiscountType: 'percent', items: [{ id: 'a', qtyOrdered: 10, unitCost: 10 }] }
  assert.equal(supplierDiscountAmount(p), 10) // 10 % de 100
  assert.equal(projectCosting(p, [], 'USD').perItem.a.unitPurchaseRef, 9)
  assert.equal(priceFromCoef(p, 10, 2.5, 'USD'), 22.5)
  assert.equal(priceFromCoef(p, 10, 2.5, 'HTG'), 3037.5)
  assert.equal(purchaseSummary(p).owed, 90)
})

test('frais globaux : pas dans le coût des articles, objectif à récupérer par les bénéfices', () => {
  const project = { id: 'p1', currency: 'USD', rate: 135, items: [{ id: 'w', qtyOrdered: 10, qtyReceived: 10, unitCost: 10, plannedPrice: 25, plannedCurrency: 'USD' }] }
  const exps = [{ amount: 50, currency: 'USD', rate: 135, global: true }, { amount: 10, currency: 'USD', rate: 135 }]
  const c = projectCosting(project, exps, 'USD')
  assert.equal(c.globalRef, 50)
  assert.equal(c.perItem.w.unitCostRef, 11) // 10 + 10/10 (frais réparti seulement)
  const sale = (qty) => [{ status: 'valide', currency: 'USD', rate: 135, lines: [{ projectId: 'p1', itemId: 'w', qty, unitPrice: 25 }] }]
  const s0 = projectStats(project, [], c, 'USD', 135)
  assert.equal(s0.netProfitRef, -50)
  assert.equal(s0.recoveryPct, 0)
  const s1 = projectStats(project, sale(2), c, 'USD', 135) // bénéfice 2 × (25 − 11) = 28
  assert.equal(s1.profitRef, 28)
  assert.equal(s1.recoveredRef, 28)
  assert.equal(s1.netProfitRef, -22)
  assert.equal(Math.round(s1.recoveryPct), 56)
  const s2 = projectStats(project, sale(5), c, 'USD', 135) // 70 > 50
  assert.equal(s2.recoveredRef, 50)
  assert.equal(s2.recoveryPct, 100)
  assert.equal(s2.netProfitRef, 20)
  assert.equal(s0.totalCostRef, 160) // 100 + 10 + 50
})

test('inRange lit une date sans heure comme date locale', async () => {
  const { inRange } = await import('../src/lib/calc.js')
  const r = [new Date(2026, 9, 1, 0, 0, 0), new Date(2026, 9, 31, 23, 59, 59)]
  assert.equal(inRange('2026-10-01', r), true)
  assert.equal(inRange('2026-10-31', r), true)
  assert.equal(inRange('2026-09-30', r), false)
  assert.equal(inRange('2026-11-01', r), false)
})
