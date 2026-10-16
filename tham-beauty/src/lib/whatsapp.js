// Messages WhatsApp (lien wa.me : s'ouvre dans WhatsApp, l'utilisateur appuie sur « envoyer »)
import { fdate, money } from './util.js'

// Numéro → format international sans « + » (ex. 37012345 → 50937012345). Les numéros de 8 chiffres reçoivent l'indicatif du pays.
export function waPhone(raw, cc = '509') {
  let d = String(raw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('00')) d = d.slice(2)
  else if (d.length <= 8) d = String(cc || '509') + d
  return d
}
export const waLink = (phone, text, cc) => `https://wa.me/${waPhone(phone, cc)}?text=${encodeURIComponent(text)}`
export const telLink = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`

// Résumé d'une vente (facture / reçu) : r = saleSummary(s)
export function saleMessage(s, r, company, doc = 'facture') {
  const lines = r.lines.filter((p) => p.qtyKept > 0).map((p) => `• ${p.l.label} × ${p.qtyKept} — ${money(p.netKept, s.currency)}`)
  return [
    `Bonjour ${s.customerName && s.customerName !== 'Client de passage' ? s.customerName : ''},`.replace(' ,', ','),
    `${doc === 'recu' ? 'Reçu' : 'Facture'} ${s.number} du ${fdate(s.date)} — ${company?.name || 'THAM BEAUTY'}`,
    ...lines,
    `Total : ${money(r.netKept, s.currency)}`,
    `Payé : ${money(r.paid, s.currency)}`,
    r.balance > 0.005 ? `Reste à payer : ${money(r.balance, s.currency)}` : 'Merci, votre commande est entièrement payée ✅',
    company?.footer || 'Merci pour votre confiance !'
  ].join('\n')
}

// Rappel de paiement
export function reminderMessage(s, r, company) {
  return [
    `Bonjour ${s.customerName || ''},`.replace(' ,', ','),
    `Petit rappel concernant la facture ${s.number} du ${fdate(s.date)} (${company?.name || 'THAM BEAUTY'}) :`,
    `Total ${money(r.netKept, s.currency)} · payé ${money(r.paid, s.currency)} · reste à payer ${money(r.balance, s.currency)}.`,
    'Merci de nous indiquer quand vous pourrez régler. 🙏'
  ].join('\n')
}
