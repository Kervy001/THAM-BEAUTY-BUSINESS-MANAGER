// Fonds de réinvestissement : l'argent REÇU des ventes qui sert à racheter du stock.
//  Alimentation automatique = (coût de revient des articles vendus + X % du bénéfice), au prorata de ce qui a été encaissé.
//  Mouvements manuels (administrateur) : réinvestir dans un projet, retrait (bénéfice personnel), dépôt externe.
// IMPORTANT : le fonds ne modifie JAMAIS les calculs d'un projet (coût de revient, bénéfice, objectif des frais…).
// Un réinvestissement crée simplement un paiement fournisseur marqué « financé par le fonds » ; les chiffres du projet restent identiques.
import { convert, itemStock, round2, saleProfit, saleSummary } from './calc.js'

export const FUND_DEFAULT_PCT = 30
export const MOVE_TYPES = { reinvest: 'Réinvesti dans un projet', withdraw: 'Retrait (bénéfice)', deposit: 'Dépôt externe' }
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const parseD = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00') : new Date(d))

// Réglage de la part du bénéfice versée au fonds : soit un POURCENTAGE du bénéfice encaissé, soit un MONTANT FIXE décidé par l'administrateur.
export const fundConfig = (settings) => {
  const f = settings?.fund || {}
  return { mode: f.mode === 'fixed' ? 'fixed' : 'percent', profitPct: f.profitPct ?? FUND_DEFAULT_PCT, fixedAmount: num(f.fixedAmount) }
}

export function fundSummary(D, costing, ref, cfg = FUND_DEFAULT_PCT) {
  const c = typeof cfg === 'object' && cfg ? cfg : { mode: 'percent', profitPct: cfg }
  const pct = Math.min(100, Math.max(0, num(c.profitPct)))
  let costPart = 0, profitPart = 0
  ;(D.sales || []).forEach((s) => {
    if (s.status === 'annule') return
    const sm = saleSummary(s)
    if (!(sm.netKept > 0) || !(sm.paid > 0)) return
    const frac = Math.min(1, sm.paid / sm.netKept)
    const pr = saleProfit(s, {}, costing || {}, ref)
    const paidRef = convert(sm.paid, s.currency, ref, s.rate)
    // jamais plus que l'argent réellement encaissé : d'abord le capital (coût de revient), puis le bénéfice encaissé
    const cp = Math.min(paidRef, frac * pr.cogs)
    costPart += cp
    profitPart += Math.min(paidRef - cp, frac * Math.max(0, pr.profit))
  })
  const profitShare = c.mode === 'fixed' ? Math.min(Math.max(0, num(c.fixedAmount)), profitPart) : (pct / 100) * profitPart
  const allocated = costPart + profitShare
  let deposits = 0, reinvested = 0, withdrawn = 0
  const perProject = {}
  const moves = (D.fundMoves || []).filter((m) => m.status !== 'annule')
  moves.forEach((m) => {
    const a = convert(m.amount, m.currency || ref, ref, m.rate)
    if (m.type === 'deposit') deposits += a
    else if (m.type === 'withdraw') withdrawn += a
    else if (m.type === 'reinvest') { reinvested += a; if (m.projectId) perProject[m.projectId] = (perProject[m.projectId] || 0) + a }
  })
  return {
    allocated: round2(allocated), costPart: round2(costPart), profitPart: round2(profitPart), profitShare: round2(profitShare), deposits: round2(deposits), reinvested: round2(reinvested), withdrawn: round2(withdrawn),
    available: round2(allocated + deposits - reinvested - withdrawn), perProject
  }
}

// Que racheter avec le budget disponible ? Classement par bénéfice généré par jour (vitesse de vente × gain par pièce).
// On propose de quoi couvrir `days` jours de ventes, moins ce qui reste en stock, dans la limite du budget.
export function restockSuggestions(D, costing, ref, budget, { days = 30, windowDays = 60, now = Date.now() } = {}) {
  const since = now - windowDays * 86400000
  const soldByItem = {}
  ;(D.sales || []).forEach((s) => {
    if (s.status === 'annule') return
    const t = parseD(s.date).getTime()
    if (!(t >= since)) return
    ;(s.lines || []).forEach((l) => { soldByItem[l.itemId] = (soldByItem[l.itemId] || 0) + Math.max(0, num(l.qty) - num(l.qtyReturned)) })
  })
  const g = {}
  ;(D.projects || []).filter((p) => p.status !== 'archive').forEach((p) => {
    ;(p.items || []).forEach((it) => {
      const key = `${it.productId || ''}|${it.variantId || ''}|${it.productId ? '' : it.label}`
      const unitCost = costing?.[p.id]?.perItem?.[it.id]?.unitCostRef || 0
      const price = it.plannedPrice ? convert(num(it.plannedPrice), it.plannedCurrency || 'USD', ref, p.rate) : 0
      const r = (g[key] ||= { key, label: it.label, sku: it.sku || '', remaining: 0, sold: 0, unitCost: 0, price: 0, last: '' })
      r.remaining += Math.max(0, itemStock(it, D.sales).remaining)
      r.sold += soldByItem[it.id] || 0
      const when = p.orderDate || ''
      if (unitCost > 0 && when >= r.last) { r.unitCost = unitCost; r.last = when; if (price > 0) r.price = price }
      else if (!r.price && price > 0) r.price = price
    })
  })
  const rows = Object.values(g).filter((r) => r.sold > 0 && r.unitCost > 0).map((r) => {
    const perDay = r.sold / windowDays
    const margin = r.price > 0 ? r.price - r.unitCost : 0
    return {
      ...r, perWeek: round2(perDay * 7), daysLeft: perDay > 0 ? Math.round(r.remaining / perDay) : Infinity,
      margin: round2(margin), marginPct: r.price > 0 ? round2((margin / r.price) * 100) : null,
      profitPerDay: perDay * margin, need: Math.max(0, Math.ceil(perDay * days - r.remaining))
    }
  }).sort((a, b) => b.profitPerDay - a.profitPerDay)
  let left = num(budget)
  const out = rows.map((r) => {
    const qty = r.need > 0 ? Math.min(r.need, Math.floor(left / r.unitCost)) : 0
    left -= qty * r.unitCost
    return { ...r, qty, cost: round2(qty * r.unitCost) }
  })
  return { rows: out, spent: round2(num(budget) - left), left: round2(left) }
}
