// Boîtes (vente en gros) : simulation de prix / bénéfice à partir des coûts RÉELS des projets.
// Une boîte est un brouillon : elle ne touche NI le stock, NI le chiffre d'affaires, NI le bénéfice des projets.
// Elle ne devient réelle que lorsqu'on la convertit en vente (le prix de la boîte est alors réparti sur les articles).
import { convert, itemStock, round2 } from './calc.js'

export const BUNDLE_STATUS = { brouillon: 'Brouillon', envoye: 'Envoyée au client', accepte: 'Acceptée', vendu: 'Vendue', annule: 'Annulée' }

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v))

// Articles disponibles pour une boîte : stock restant, coût de revient réel, prix prévu (en devise de la boîte), ancienneté du lot.
export function bundleCandidates(D, costing, { currency, rate, ref, now = Date.now() }) {
  const out = {}
  ;(D.projects || []).filter((p) => p.status !== 'archive').forEach((p) => {
    ;(p.items || []).forEach((it) => {
      const remaining = itemStock(it, D.sales).remaining
      if (remaining <= 0) return
      const unitCostRef = costing?.[p.id]?.perItem?.[it.id]?.unitCostRef || 0
      const dates = [...(p.receipts || []).map((r) => r.date), p.orderDate].filter(Boolean).sort()
      const t = dates.length ? Date.parse(dates[0]) : now
      out[it.id] = {
        itemId: it.id, projectId: p.id, projectNumber: p.number, label: it.label, sku: it.sku || '', remaining,
        unitCost: round2(convert(unitCostRef, ref, currency, rate)),
        planned: it.plannedPrice ? round2(convert(num(it.plannedPrice), it.plannedCurrency || 'USD', currency, rate)) : 0,
        ageDays: Math.max(0, Math.round((now - (Number.isNaN(t) ? now : t)) / 86400000)),
        variety: it.productId || it.label
      }
    })
  })
  return out
}

// Simulation d'une boîte. lines : [{ itemId, qty }] ; cands : résultat de bundleCandidates ; price : prix de la boîte (devise de la boîte).
export function simulateBundle(lines, cands, price, minMargin = 0) {
  const P = round2(num(price))
  const rows = []
  let cost = 0, units = 0, weightTotal = 0
  const warnings = []
  ;(lines || []).forEach((l) => {
    const c = cands[l.itemId]
    const qty = Math.max(0, Math.floor(num(l.qty)))
    if (!c) { warnings.push(`« ${l.label || 'Article'} » n’est plus disponible en stock.`); return }
    if (qty > c.remaining) warnings.push(`Stock insuffisant pour « ${c.label} » (${c.remaining} disponible, ${qty} demandé).`)
    // poids de répartition du prix : prix prévu ; à défaut, le coût de revient
    const w = c.planned > 0 ? c.planned : c.unitCost
    rows.push({ ...c, qty, lineCost: round2(qty * c.unitCost), weight: w * qty, w })
    cost += qty * c.unitCost
    units += qty
    weightTotal += w * qty
  })
  cost = round2(cost)
  rows.forEach((r) => {
    const share = weightTotal > 0 ? r.weight / weightTotal : (units > 0 ? r.qty / units : 0)
    r.lineRevenue = round2(P * share)
    r.unitPrice = r.qty > 0 ? round2(P * share / r.qty) : 0
    r.profit = round2(r.lineRevenue - r.lineCost)
  })
  const profit = round2(P - cost)
  const perProject = {}
  rows.forEach((r) => {
    const g = (perProject[r.projectId] ||= { projectId: r.projectId, number: r.projectNumber, units: 0, cost: 0, revenue: 0, profit: 0 })
    g.units += r.qty; g.cost = round2(g.cost + r.lineCost); g.revenue = round2(g.revenue + r.lineRevenue); g.profit = round2(g.profit + r.profit)
  })
  const marginPct = P > 0 ? round2((profit / P) * 100) : 0
  const markupPct = cost > 0 ? round2((profit / cost) * 100) : 0
  if (units > 0 && P > 0 && profit < 0) warnings.push('Le prix est inférieur au coût de revient : cette boîte ferait une perte.')
  else if (units > 0 && P > 0 && marginPct < minMargin) warnings.push(`Marge de ${marginPct} % : sous votre minimum (${minMargin} %).`)
  return { rows, units, cost, price: P, profit, marginPct, markupPct, perProject: Object.values(perProject), warnings, avgCost: units ? round2(cost / units) : 0, avgPrice: units ? round2(P / units) : 0 }
}

// Prix unitaires pour la vente réelle : prix de la boîte réparti proportionnellement (somme exacte au centime près si possible).
export function allocateForSale(lines, cands, price) {
  const sim = simulateBundle(lines, cands, price)
  const out = sim.rows.filter((r) => r.qty > 0).map((r) => ({ itemId: r.itemId, projectId: r.projectId, label: r.label, sku: r.sku, qty: r.qty, unitPrice: r.unitPrice, remaining: r.remaining, projectNumber: r.projectNumber }))
  const diff = round2(sim.price - out.reduce((t, r) => t + r.qty * r.unitPrice, 0))
  const one = out.find((r) => r.qty === 1)
  if (one && Math.abs(diff) > 0 && Math.abs(diff) < 1) one.unitPrice = round2(one.unitPrice + diff)
  return out
}

// Suggestion de composition : remplit la boîte, au prix donné, en respectant la marge minimale (en % du prix de vente).
//  - preferSlow : les articles qui dorment le plus longtemps en stock passent en premier ;
//  - mix        : on prend 1 pièce de chaque article à tour de rôle (variété) au lieu de vider un article après l'autre ;
//  - maxUnits   : nombre maximum de pièces (facultatif).
export function suggestBundle(cands, { price, minMargin = 0, preferSlow = true, mix = true, maxUnits = 0 }) {
  const ceiling = num(price) * (1 - num(minMargin) / 100)
  const list = Object.values(cands).filter((c) => c.unitCost > 0 && c.remaining > 0)
  list.sort((a, b) => (preferSlow ? b.ageDays - a.ageDays : 0) || b.remaining - a.remaining || a.label.localeCompare(b.label))
  const qty = {}
  let cost = 0, units = 0
  const cap = Math.floor(num(maxUnits)) || Infinity
  const room = (c) => (qty[c.itemId] || 0) < c.remaining && cost + c.unitCost <= ceiling + 1e-9 && units < cap
  const add = (c) => { qty[c.itemId] = (qty[c.itemId] || 0) + 1; cost += c.unitCost; units++ }
  if (mix) {
    let added = true
    while (added) {
      added = false
      for (const c of list) if (room(c)) { add(c); added = true }
    }
  } else {
    for (const c of list) while (room(c)) add(c)
  }
  return list.filter((c) => qty[c.itemId]).map((c) => ({ itemId: c.itemId, projectId: c.projectId, label: c.label, sku: c.sku, qty: qty[c.itemId] }))
}
