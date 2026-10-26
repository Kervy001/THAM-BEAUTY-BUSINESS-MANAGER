import test from 'node:test'
import assert from 'node:assert/strict'
import { bundleCandidates, simulateBundle, suggestBundle, allocateForSale } from '../src/lib/bundles.js'

const D = {
  projects: [
    { id: 'p1', number: 'PRJ-1', orderDate: '2026-01-01', receipts: [{ date: '2026-02-01' }], items: [
      { id: 'a', label: 'Cheveux 14"', qtyReceived: 10, plannedPrice: 30, plannedCurrency: 'USD' },
      { id: 'b', label: 'Cheveux 18"', qtyReceived: 5, plannedPrice: 50, plannedCurrency: 'USD' }] },
    { id: 'p2', number: 'PRJ-2', orderDate: '2026-08-01', receipts: [], items: [
      { id: 'c', label: 'Frange', qtyReceived: 4, plannedPrice: 10, plannedCurrency: 'USD' }] }
  ],
  sales: [{ status: 'valide', lines: [{ itemId: 'a', qty: 2, qtyReturned: 0 }] }]
}
const costing = { p1: { perItem: { a: { unitCostRef: 12 }, b: { unitCostRef: 20 } } }, p2: { perItem: { c: { unitCostRef: 4 } } } }
const cands = bundleCandidates(D, costing, { currency: 'USD', rate: 135, ref: 'USD', now: Date.parse('2026-10-01') })

test('candidats : stock restant et coût réel', () => {
  assert.equal(cands.a.remaining, 8)
  assert.equal(cands.b.unitCost, 20)
  assert.ok(cands.a.ageDays > cands.c.ageDays)
})

test('simulation : coût, bénéfice, marge et majoration', () => {
  const s = simulateBundle([{ itemId: 'a', qty: 5 }, { itemId: 'b', qty: 2 }], cands, 200)
  assert.equal(s.cost, 100) // 5*12 + 2*20
  assert.equal(s.profit, 100)
  assert.equal(s.marginPct, 50)
  assert.equal(s.markupPct, 100)
  assert.equal(s.perProject.length, 1)
  assert.equal(s.perProject[0].revenue, 200)
})

test('simulation : stock insuffisant et perte signalés', () => {
  const s = simulateBundle([{ itemId: 'b', qty: 9 }], cands, 100)
  assert.ok(s.warnings.some((w) => /Stock insuffisant/.test(w)))
  assert.ok(s.warnings.some((w) => /perte/.test(w)))
})

test('répartition du prix de la boîte entre projets : somme exacte', () => {
  const lines = [{ itemId: 'a', qty: 3 }, { itemId: 'c', qty: 3 }]
  const out = allocateForSale(lines, cands, 100)
  const total = out.reduce((t, r) => t + r.qty * r.unitPrice, 0)
  assert.ok(Math.abs(total - 100) < 0.05)
})

test('suggestion : respecte la marge minimale et le stock', () => {
  const lines = suggestBundle(cands, { price: 300, minMargin: 30, preferSlow: true, mix: true })
  const s = simulateBundle(lines, cands, 300, 30)
  assert.ok(s.marginPct >= 30)
  assert.ok(s.units > 0)
  lines.forEach((l) => assert.ok(l.qty <= cands[l.itemId].remaining))
  assert.equal(s.warnings.length, 0)
})

test('suggestion : nombre max de pièces et sans mélange', () => {
  const lines = suggestBundle(cands, { price: 1000, minMargin: 10, mix: false, maxUnits: 6 })
  assert.equal(lines.reduce((t, l) => t + l.qty, 0), 6)
})

test('rôles : défauts, modifiés, supprimés et personnalisés', async () => {
  const { rolesOf, ROLES, PERMS } = await import('../src/lib/perms.js')
  assert.deepEqual(Object.keys(rolesOf({})).sort(), Object.keys(ROLES).sort())
  const r = rolesOf({ roles: {
    commercial: { label: 'Vendeur', perms: ['sales.write', 'bundles.write', 'nimportequoi'] },
    stock: { deleted: true },
    r_1: { label: 'Gros', perms: ['bundles.write'] },
    admin: { label: 'Hack', perms: [] }
  } })
  assert.equal(r.commercial.label, 'Vendeur')
  assert.deepEqual(r.commercial.perms, ['sales.write', 'bundles.write'])
  assert.equal(r.stock, undefined)
  assert.equal(r.r_1.custom, true)
  assert.equal(r.admin.perms.length, Object.keys(PERMS).length) // l'admin ne peut pas être modifié
})
