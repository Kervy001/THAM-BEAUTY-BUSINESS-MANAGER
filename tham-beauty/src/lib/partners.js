// Associés (partenaires) : leurs apports (argent qu'ils avancent pour payer fournisseurs / dépenses),
// les remboursements qu'on leur fait, et les distributions de parts (bénéfices versés).
// Un paiement ou une dépense peut avoir un tableau `funding: [{ partnerId, name, amount }]` (même devise que le paiement) :
// le reste est payé par la caisse. Les apports entrent dans la trésorerie comme entrées (« Apports des associés »).
import { convert, inRange, round2 } from './calc.js'

export const DEFAULT_PARTNERS = [
  { id: 'p_itama', name: 'Itama TREZIL', share: '' },
  { id: 'p_kervens', name: 'Kervens LUMAT', share: '' }
]
export const partnersOf = (settings) => (Array.isArray(settings?.partners) ? settings.partners : DEFAULT_PARTNERS)

export const PARTNER_MOVES = { reimburse: 'Remboursement', distribute: 'Distribution de parts' }

// Apports d'un paiement/une dépense. Ancien réglage « source: perso » = apport d'un associé non nommé.
export function fundingOf(x) {
  if (Array.isArray(x?.funding)) return x.funding.filter((f) => Number(f.amount) > 0)
  if (x?.source === 'perso') return [{ partnerId: '', name: 'Associé', amount: Number(x.amount) || 0 }]
  return []
}

// Tous les apports (un par associé et par paiement/dépense), convertis en devise de référence.
export function contributions(D, ref) {
  const out = []
  const push = (x, base, label, to) => fundingOf(x).forEach((f) => out.push({
    date: x.date, partnerId: f.partnerId || '', name: f.name || 'Associé', amount: Number(f.amount), currency: x.currency, rate: base,
    amountRef: round2(convert(Number(f.amount), x.currency, ref, base)), label, to
  }))
  ;(D.expenses || []).filter((e) => e.status !== 'annule').forEach((e) => push(e, e.rate, `Dépense ${e.category || ''}`.trim(), '/depenses'))
  ;(D.projects || []).forEach((p) => (p.supplierPayments || []).filter((x) => x.status !== 'annule').forEach((x) => push(x, x.rate || p.rate, `Fournisseur ${p.number || ''} ${p.name || ''}`.trim(), `/projets/${p.id}`)))
  return out
}

const moveRef = (m, ref) => round2(convert(Number(m.amount) || 0, m.currency || ref, ref, m.rate))

// Situation de chaque associé (jusqu'à la date `until` incluse, si donnée).
export function partnerStatement(D, ref, partners, { until = '' } = {}) {
  const ok = (d) => !until || (d || '') <= until
  const map = {}
  const get = (id, name) => (map[id || '_'] ||= { id: id || '', name: name || 'Associé', contributed: 0, reimbursed: 0, distributed: 0, moves: [], contribs: [] })
  partners.forEach((p) => { get(p.id, p.name).share = p.share })
  contributions(D, ref).filter((c) => ok(c.date)).forEach((c) => { const g = get(c.partnerId, c.name); g.contributed += c.amountRef; g.contribs.push(c) })
  ;(D.partnerMoves || []).filter((m) => m.status !== 'annule' && ok(m.date)).forEach((m) => {
    const g = get(m.partnerId, m.partnerName)
    const v = moveRef(m, ref)
    if (m.type === 'reimburse') g.reimbursed += v; else g.distributed += v
    g.moves.push({ ...m, amountRef: v })
  })
  return Object.values(map).map((g) => ({
    ...g, contributed: round2(g.contributed), reimbursed: round2(g.reimbursed), distributed: round2(g.distributed),
    due: round2(g.contributed - g.reimbursed), moves: g.moves.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }))
}

// Mouvements de caisse liés aux associés (période) : pour la trésorerie
export function partnerCashMoves(D, ref) {
  return (D.partnerMoves || []).filter((m) => m.status !== 'annule').map((m) => ({
    date: m.date, kind: m.type === 'reimburse' ? 'remb_associe' : 'distribution', amount: Number(m.amount), currency: m.currency || ref, rate: m.rate,
    label: `${m.partnerName || 'Associé'}${m.note ? ' · ' + m.note : ''}`, to: '/associes'
  }))
}

// Apports + sorties associés d'une période (pour le tableau de bord)
export function partnerPeriodTotals(D, ref, range) {
  const apports = contributions(D, ref).filter((c) => inRange(c.date, range)).reduce((t, c) => t + c.amountRef, 0)
  const sorties = (D.partnerMoves || []).filter((m) => m.status !== 'annule' && inRange(m.date, range)).reduce((t, m) => t + moveRef(m, ref), 0)
  return { apports, sorties }
}
