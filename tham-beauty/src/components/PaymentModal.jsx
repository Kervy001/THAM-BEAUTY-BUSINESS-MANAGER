import { useState } from 'react'
import { useApp } from '../lib/store.jsx'
import { paymentCredit } from '../lib/calc.js'
import { METHODS, money, today, uid, nowIso } from '../lib/util.js'
import { Input, Modal, NumberInput, Select, Notice } from './ui.jsx'

// Paiement avec son propre taux de change (conservé à vie).
export default function PaymentModal({ title, opCurrency, opRate, remaining, refund, onSave, onClose }) {
  const app = useApp()
  const [p, setP] = useState({
    date: today(), amount: remaining > 0 ? String(Math.round(remaining * 100) / 100) : '', currency: opCurrency,
    rate: String(app.rate), method: 'Espèces', reference: '', note: ''
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setP({ ...p, [k]: v })
  const credit = paymentCredit({ amount: p.amount, currency: p.currency, rate: p.rate }, opCurrency, opRate)

  async function submit(e) {
    e.preventDefault()
    if (!(Number(p.amount) > 0)) return
    if (!(Number(p.rate) > 0)) return alert('Le taux doit être supérieur à 0.')
    setBusy(true)
    try {
      await onSave({
        id: uid(), type: refund ? 'refund' : 'payment', date: p.date, amount: Number(p.amount), currency: p.currency,
        rate: Number(p.rate), method: p.method, reference: p.reference, note: p.note, status: 'valide',
        by: app.profile?.name || app.profile?.email || '', at: nowIso()
      })
      onClose()
    } finally { setBusy(false) }
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={p.date} onChange={(e) => set('date')(e.target.value)} required />
          <Select label="Moyen de paiement" value={p.method} onChange={set('method')} options={METHODS} />
          <NumberInput label="Montant" value={p.amount} onChange={set('amount')} required />
          <Select label="Devise" value={p.currency} onChange={set('currency')} options={['USD', 'HTG']} />
        </div>
        <NumberInput label="Taux de ce paiement (HTG pour 1 USD)" value={p.rate} onChange={set('rate')} hint={`Taux général actuel : ${app.rate}. Modifiable : ce paiement garde son propre taux.`} />
        <Input label="Référence de transaction" value={p.reference} onChange={(e) => set('reference')(e.target.value)} />
        <Input label="Note" value={p.note} onChange={(e) => set('note')(e.target.value)} />
        {p.currency !== opCurrency && Number(p.amount) > 0 && (
          <Notice tone="blue">Montant {refund ? 'remboursé' : 'crédité'} sur l'opération : <b>{money(credit, opCurrency)}</b> (taux {p.rate})</Notice>
        )}
        <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
      </form>
    </Modal>
  )
}
