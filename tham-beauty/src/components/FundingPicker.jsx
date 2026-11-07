import { useApp } from '../lib/store.jsx'
import { partnersOf } from '../lib/partners.js'
import { money } from '../lib/util.js'
import { NumberInput, Select } from './ui.jsx'

// « Payé avec quel argent ? » : la caisse (par défaut) et/ou un ou plusieurs associés, avec le montant avancé par chacun.
// value : [{ partnerId, name, amount }] (montants dans la devise du paiement) — le reste est payé par la caisse.
export default function FundingPicker({ value, onChange, total, currency }) {
  const app = useApp()
  const partners = partnersOf(app.settings)
  const rows = value || []
  const sum = rows.reduce((t, r) => t + (Number(r.amount) || 0), 0)
  const cash = Math.round((Number(total || 0) - sum) * 100) / 100
  const upd = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const pick = (i, id) => upd(i, { partnerId: id, name: partners.find((p) => p.id === id)?.name || '' })
  const free = partners.filter((p) => !rows.some((r) => r.partnerId === p.id))
  return (
    <div className="rounded-2xl border border-line p-3">
      <div className="mb-2 text-sm font-medium">Payé avec quel argent ?</div>
      <div className="flex items-center justify-between rounded-xl bg-paper px-3 py-2 text-sm">
        <span>Argent de la caisse</span>
        <b className={cash < -0.005 ? 'text-blush-600' : ''}>{money(Math.max(0, cash), currency)}</b>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <Select label={i === 0 ? 'Associé' : ''} value={r.partnerId} onChange={(v) => pick(i, v)}
            options={[{ value: '', label: 'Choisir…' }, ...partners.filter((p) => p.id === r.partnerId || free.includes(p)).map((p) => ({ value: p.id, label: p.name }))]} />
          <NumberInput label={i === 0 ? `Montant (${currency})` : ''} value={String(r.amount ?? '')} onChange={(v) => upd(i, { amount: v })} />
          <button type="button" className="btn-ghost btn-sm !text-blush-600" onClick={() => onChange(rows.filter((_, k) => k !== i))} aria-label="Retirer">✕</button>
        </div>
      ))}
      {free.length > 0 && <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => onChange([...rows, { partnerId: '', name: '', amount: '' }])}>＋ Argent d’un associé</button>}
      {cash < -0.005 && <div className="mt-2 text-xs text-blush-600">Les montants des associés dépassent le total ({money(total, currency)}).</div>}
      {rows.length > 0 && cash >= -0.005 && <div className="mt-2 text-xs text-neutral-500">Les apports des associés comptent comme entrées dans la trésorerie ; ils seront à leur rembourser.</div>}
    </div>
  )
}
