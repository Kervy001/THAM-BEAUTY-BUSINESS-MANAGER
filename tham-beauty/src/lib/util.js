import { round2 } from './calc.js'

export const uid = () => (crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14))
// Date locale (et non UTC) : à Port-au-Prince, après 20 h, toISOString() donnerait déjà « demain ».
const p2 = (n) => String(n).padStart(2, '0')
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` }
// « 2026-10-18 » (sans heure) est lu comme date LOCALE, pas UTC (sinon affiché la veille)
export const parseDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00') : new Date(d))
export const nowIso = () => new Date().toISOString()

export function money(v, cur = 'USD') {
  const x = round2(v)
  const s = x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return cur === 'USD' ? `${s} $` : `${s} HTG`
}
export const num = (v) => (v === '' || v == null ? 0 : Number(v))
export const fdate = (d) => (d ? parseDate(d).toLocaleDateString('fr-FR') : '—')
export const fdt = (d) => (d ? parseDate(d).toLocaleString('fr-FR') : '—')

export const STATUS_PROJECT = {
  brouillon: 'Brouillon',
  confirme: 'Commande confirmée',
  paye: 'Paiement fournisseur effectué',
  expedition: "En cours d'expédition",
  partiel: 'Partiellement reçu',
  recu: 'Reçu intégralement',
  vente: 'En cours de vente',
  termine: 'Terminé',
  archive: 'Archivé'
}
export const PAY_STATUS = { impaye: 'Impayé', partiel: 'Partiel', paye: 'Payé', trop_percu: 'Trop perçu', trop_paye: 'Trop payé' }
export const DELIVERY = { a_livrer: 'À livrer', livre: 'Livré', retire: 'Retiré en boutique' }
export const METHODS = ['Espèces', 'MonCash', 'NatCash', 'Virement', 'Chèque', 'Carte', 'Autre']
export const DEFAULT_EXPENSE_CATEGORIES = [
  'Transport international', 'Transport aérien', 'Transport maritime', 'Douane', 'Dédouanement',
  'Frais de transitaire', 'Transport local', 'Livraison', 'Manutention', 'Emballage', 'Frais bancaires',
  'Frais MonCash', 'Frais NatCash', 'Frais de conversion', 'Stockage', 'Publicité', 'Commission', 'Autres dépenses'
]
export const GENERAL_CATEGORIES = ['Loyer', 'Internet', 'Électricité', 'Frais administratifs', 'Salaires', 'Autres frais généraux']

export function downloadCSV(filename, rows) {
  const esc = (v) => {
    let s = v == null ? '' : String(v)
    // Anti-injection de formules (Excel/Sheets) : un texte commençant par = + - @ est neutralisé (les nombres restent intacts)
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+([.,]\d+)?$/.test(s)) s = "'" + s
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// Vendeur d'une vente (les anciennes ventes n'ont que « createdBy »)
export const sellerOf = (s) => s?.sellerName || s?.createdBy || '—'
