import { convert, round2 } from './calc.js'

// Monnaie à rendre : le client remet `tendered` (dans la devise `cur`), la vente en garde `amount` (même devise).
// La monnaie peut être rendue dans l'autre devise (conversion au taux du paiement).
export function changeFor(tendered, amount, cur, rate, changeCur) {
  const t = Number(tendered) || 0, a = Number(amount) || 0
  const diff = round2(t - a)
  if (!(t > 0) || diff <= 0.004) return null
  const to = changeCur || cur
  const raw = to === cur ? diff : convert(diff, cur, to, rate)
  return { amount: to === 'HTG' ? Math.round(raw) : round2(raw), currency: to }
}

// Effet réel d'un paiement sur l'argent liquide en caisse : { USD: +x, HTG: +y }
export function cashEffect(p) {
  const sign = p.type === 'refund' ? -1 : 1
  const out = {}
  const add = (c, v) => { out[c] = (out[c] || 0) + v }
  if (p.tendered > 0 && p.change?.amount > 0) {
    add(p.currency, sign * Number(p.tendered))
    add(p.change.currency, -sign * Number(p.change.amount))
  } else add(p.currency, sign * (Number(p.amount) || 0))
  return out
}

// Heure d'une vente (HH:MM) depuis son horodatage
export function saleTime(s) {
  const iso = s?.createdAtIso || s?.createdAt
  if (!iso) return ''
  const d = typeof iso === 'object' && iso.toDate ? iso.toDate() : new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}
