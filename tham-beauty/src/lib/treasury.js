// Trésorerie : tous les mouvements d'argent RÉELS (encaissements, remboursements, dépenses, paiements fournisseurs,
// retraits / dépôts du fonds), en devise de référence, avec ventilation par type, moyen de paiement, devise et jour.
// Les paiements fournisseurs financés par le fonds de réinvestissement sont isolés (« Réinvesti via le fonds ») :
// ils ne changent ni le chiffre d'affaires, ni le bénéfice, ni les calculs des projets.
import { convert, inRange, purchaseSummary, round2, saleSummary } from './calc.js'

const parseD = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00') : new Date(d))

export const KINDS = {
  vente: 'Ventes encaissées', depot: 'Dépôts externes (fonds)',
  remboursement: 'Remboursements clients', depense_generale: 'Dépenses générales', depense_projet: 'Dépenses de projets',
  fournisseur: 'Paiements fournisseurs', fonds: 'Réinvesti via le fonds', retrait: 'Retraits (prélèvements)'
}

export function cashEvents(D, ref) {
  const ev = []
  const add = (e) => ev.push({ ...e, amountRef: convert(e.amount, e.currency, ref, e.rate) })
  ;(D.sales || []).filter((s) => s.status !== 'annule').forEach((s) => {
    ;(s.payments || []).filter((p) => p.status !== 'annule').forEach((p) => {
      add({ date: p.date, dir: p.type === 'refund' ? 'out' : 'in', kind: p.type === 'refund' ? 'remboursement' : 'vente', amount: p.amount, currency: p.currency, rate: p.rate || s.rate, method: p.method || 'Autre', label: s.number || '' })
    })
  })
  ;(D.expenses || []).filter((e) => e.status !== 'annule').forEach((e) => {
    add({ date: e.date, dir: 'out', kind: e.projectId ? 'depense_projet' : 'depense_generale', amount: e.amount, currency: e.currency, rate: e.rate, method: e.method || 'Autre', label: e.category || '' })
  })
  ;(D.projects || []).forEach((p) => {
    ;(p.supplierPayments || []).filter((x) => x.status !== 'annule').forEach((x) => {
      add({ date: x.date, dir: 'out', kind: x.fundMoveId ? 'fonds' : 'fournisseur', amount: x.amount, currency: x.currency, rate: x.rate || p.rate, method: x.fundMoveId ? 'Fonds' : (x.method || 'Autre'), label: p.number || '' })
    })
  })
  ;(D.fundMoves || []).filter((m) => m.status !== 'annule' && (m.type === 'withdraw' || m.type === 'deposit')).forEach((m) => {
    add({ date: m.date, dir: m.type === 'deposit' ? 'in' : 'out', kind: m.type === 'deposit' ? 'depot' : 'retrait', amount: m.amount, currency: m.currency, rate: m.rate, method: 'Fonds', label: m.note || '' })
  })
  return ev
}

const sumBy = (arr, f) => arr.reduce((t, x) => t + f(x), 0)

export function treasuryReport(D, ref, range, { opening = 0, now = Date.now() } = {}) {
  const all = cashEvents(D, ref)
  const per = all.filter((e) => inRange(e.date, range))
  const inn = sumBy(per.filter((e) => e.dir === 'in'), (e) => e.amountRef)
  const out = sumBy(per.filter((e) => e.dir === 'out'), (e) => e.amountRef)

  const byKind = {}
  per.forEach((e) => { byKind[e.kind] = (byKind[e.kind] || 0) + e.amountRef })

  const byMethod = {}
  per.forEach((e) => { const m = (byMethod[e.method] ||= { in: 0, out: 0 }); m[e.dir] += e.amountRef })
  const byCurrency = {}
  per.forEach((e) => { const c = (byCurrency[e.currency] ||= { in: 0, out: 0 }); c[e.dir] += Number(e.amount) || 0 })

  const dayMap = {}
  per.forEach((e) => { const d = (dayMap[e.date] ||= { date: e.date, in: 0, out: 0 }); d[e.dir] += e.amountRef })
  const byDay = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, in: round2(d.in), out: round2(d.out), net: round2(d.in - d.out) }))

  const cumIn = sumBy(all.filter((e) => e.dir === 'in'), (e) => e.amountRef)
  const cumOut = sumBy(all.filter((e) => e.dir === 'out'), (e) => e.amountRef)
  const balance = Number(opening || 0) + cumIn - cumOut

  // À venir : créances clients et dettes fournisseurs (soldes à ce jour)
  let receivables = 0, overdue = 0, overdueCount = 0
  const rec = []
  ;(D.sales || []).filter((s) => s.status !== 'annule').forEach((s) => {
    const r = saleSummary(s)
    if (r.balance > 0.005) {
      const v = convert(r.balance, s.currency, ref, s.rate)
      const age = Math.floor((now - parseD(s.date).getTime()) / 86400000)
      receivables += v
      if (age > 30) { overdue += v; overdueCount++ }
      rec.push({ id: s.id, label: `${s.number || ''} ${s.customerName || ''}`.trim(), value: v, age })
    }
  })
  let payables = 0
  const pay = []
  ;(D.projects || []).forEach((p) => {
    const b = purchaseSummary(p).balance
    if (b > 0.005) { const v = convert(b, p.currency, ref, p.rate); payables += v; pay.push({ id: p.id, label: `${p.number || ''} ${p.name || ''}`.trim(), value: v }) }
  })
  const top = (l) => l.sort((a, b) => b.value - a.value).slice(0, 5).map((x) => ({ ...x, value: round2(x.value) }))

  return {
    in: round2(inn), out: round2(out), net: round2(inn - out), byKind, byMethod, byCurrency, byDay,
    cumulative: { in: round2(cumIn), out: round2(cumOut), net: round2(cumIn - cumOut) }, balance: round2(balance),
    receivables: round2(receivables), payables: round2(payables), overdue: round2(overdue), overdueCount,
    forecast: round2(balance + receivables - payables), topReceivables: top(rec), topPayables: top(pay)
  }
}
