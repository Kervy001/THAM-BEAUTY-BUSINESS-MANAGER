import { itemStock, itemStockAt } from './calc.js'

// Lignes de stock groupées par produit / variante (même regroupement que la page Stock).
// locId : stock d'un lieu précis (inventaire) ; sans locId : stock total.
export function stockRows(D, costing, locId, firstLoc) {
  const g = {}
  ;(D.projects || []).forEach((p) => (p.items || []).forEach((it) => {
    const st = itemStock(it, D.sales)
    if (st.received <= 0 && st.sold <= 0) return
    const key = `${it.productId || ''}|${it.variantId || ''}|${it.productId ? '' : it.label}`
    const q = locId ? itemStockAt(it, D.sales, locId, firstLoc) : st.remaining
    const c = costing?.[p.id]?.perItem?.[it.id]?.unitCostRef || 0
    const r = (g[key] ||= { key, label: it.label, sku: it.sku || '', productId: it.productId || '', variantId: it.variantId || '', expected: 0, value: 0, lots: [] })
    r.lots.push({ pid: p.id, itemId: it.id, number: p.number, expected: q, unitCost: c })
    r.expected += q
    r.value += q * c
  }))
  return Object.values(g).sort((a, b) => a.label.localeCompare(b.label))
}

// Articles dont le stock total est ≤ seuil (ruptures comprises)
export function lowStockRows(D, low) {
  return stockRows(D, null).filter((r) => r.expected <= low).sort((a, b) => a.expected - b.expected)
}
