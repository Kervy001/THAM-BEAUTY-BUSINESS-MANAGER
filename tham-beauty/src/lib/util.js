import { round2 } from './calc.js'

export const uid = () => (crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14))
export const today = () => new Date().toISOString().slice(0, 10)
export const nowIso = () => new Date().toISOString()

export function money(v, cur = 'USD') {
  const x = round2(v)
  const s = x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return cur === 'USD' ? `${s} $` : `${s} HTG`
}
export const num = (v) => (v === '' || v == null ? 0 : Number(v))
export const fdate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—')
export const fdt = (d) => (d ? new Date(d).toLocaleString('fr-FR') : '—')

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
    const s = v == null ? '' : String(v)
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
