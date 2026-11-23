import { changeFor } from '../lib/cashflow.js'
import { money } from '../lib/util.js'
import { NumberInput, Select } from './ui.jsx'

// Espèces : montant remis par le client → monnaie à rendre. La devise de la monnaie suit celle du paiement (modifiable par le vendeur) ;
// le montant calculé se met à jour tout seul, mais chaque vendeur peut le corriger (la correction est notée sur le paiement).
export default function CashChange({ value, onChange, amount, currency, rate }) {
  const cc = value.changeCur || currency
  const auto = changeFor(value.tendered, amount, currency, rate, cc)
  const shown = value.changeAmt != null && value.changeAmt !== '' ? { amount: Number(value.changeAmt) || 0, currency: cc } : auto
  const short = Number(value.tendered) > 0 && Number(value.tendered) + 0.004 < Number(amount)
  return (
    <div className="space-y-2 rounded-xl bg-paper p-3 ring-1 ring-line">
      <div className="grid grid-cols-2 gap-3">
        <NumberInput label={`Montant remis par le client (${currency})`} value={value.tendered} onChange={(v) => onChange({ ...value, tendered: v, changeAmt: null })} />
        <Select label="Monnaie rendue en" value={cc} onChange={(v) => onChange({ ...value, changeCur: v, changeAmt: null })} options={['USD', 'HTG']} />
      </div>
      {short && <div className="text-xs text-red-700">Le client remet moins que le montant du paiement.</div>}
      {shown && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>Monnaie à rendre :</span>
          <span className="flex items-center gap-1"><span className="w-32"><NumberInput value={value.changeAmt != null && value.changeAmt !== '' ? value.changeAmt : String(auto?.amount ?? '')} onChange={(v) => onChange({ ...value, changeAmt: v })} /></span><b>{cc}</b></span>
        </div>
      )}
      {shown && <div className="text-xs text-neutral-500">Calcul automatique : {money(auto?.amount || 0, cc)} (vous pouvez corriger le montant). Si le client remet le montant exact, il n’y a pas de monnaie.</div>}
    </div>
  )
}

export const emptyChange = () => ({ tendered: '', changeCur: '', changeAmt: null })
// Champs à ajouter au paiement (ou {} s'il n'y a pas de monnaie)
export function changeFields(value, amount, currency, rate, method) {
  if (method !== 'Espèces' || !(Number(value.tendered) > 0)) return {}
  const cc = value.changeCur || currency
  const auto = changeFor(value.tendered, amount, currency, rate, cc)
  const ch = value.changeAmt != null && value.changeAmt !== '' ? { amount: Number(value.changeAmt) || 0, currency: cc } : auto
  return ch && ch.amount > 0 ? { tendered: Number(value.tendered), change: ch, ...(auto && Math.abs(auto.amount - ch.amount) > 0.004 ? { changeAuto: auto.amount, changeEdited: true } : {}) } : {}
}
