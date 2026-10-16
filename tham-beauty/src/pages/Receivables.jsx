import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { saleSummary } from '../lib/calc.js'
import { fdate, money, sellerOf } from '../lib/util.js'
import { reminderMessage, telLink, waLink } from '../lib/whatsapp.js'
import { Badge, Empty, PageHeader } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

const days = (d) => Math.max(0, Math.floor((Date.now() - new Date(d || Date.now()).getTime()) / 86400000))

// Créances : ventes non soldées, les plus anciennes d'abord, avec rappel WhatsApp en un clic
export default function Receivables() {
  const app = useApp()
  const [q, setQ] = useState('')
  const [min, setMin] = useState(0)
  const rows = useMemo(() => app.D.sales
    .filter((s) => s.status !== 'annule')
    .map((s) => ({ s, r: saleSummary(s), age: days(s.date) }))
    .filter(({ r, age, s }) => r.balance > 0.005 && age >= min && ((s.customerName || '') + s.number + sellerOf(s)).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.age - a.age), [app.D.sales, q, min])
  const totals = rows.reduce((t, { s, r }) => ({ ...t, [s.currency]: (t[s.currency] || 0) + r.balance }), {})
  const phoneOf = (s) => app.D.customers.find((c) => c.id === s.customerId)?.phone || ''

  return (
    <>
      <PageHeader title="Créances clients" subtitle="Ventes non soldées : rappelez vos clients par WhatsApp ou par téléphone." />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input min-w-[12rem] flex-1 sm:max-w-xs" placeholder="Client, N° ou vendeur…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input !w-auto" value={min} onChange={(e) => setMin(Number(e.target.value))}>
          <option value={0}>Toutes</option><option value={7}>Plus de 7 jours</option><option value={30}>Plus de 30 jours</option><option value={60}>Plus de 60 jours</option>
        </select>
      </div>
      {rows.length > 0 && (
        <div className="card mb-4 flex flex-wrap items-center gap-x-6 gap-y-1">
          <div className="text-sm text-neutral-500">{rows.length} vente(s) à encaisser</div>
          {Object.entries(totals).map(([cur, v]) => <div key={cur} className="text-lg font-semibold">{money(v, cur)}</div>)}
        </div>
      )}
      {!rows.length ? <Empty icon="wallet">Aucune créance{q || min ? ' pour ce filtre' : ''} 🎉</Empty> : (
        <div className="space-y-2">
          {rows.map(({ s, r, age }) => {
            const ph = phoneOf(s)
            return (
              <div key={s.id} className="card !p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{s.customerName || 'Client de passage'}</div>
                    <Link to={`/ventes/${s.id}`} className="text-xs text-neutral-500 underline">{s.number}</Link>
                    <span className="text-xs text-neutral-500"> · {fdate(s.date)} · {sellerOf(s)}</span>
                  </div>
                  <div className="text-right"><div className="font-semibold text-blush-600">{money(r.balance, s.currency)}</div><Badge tone={age > 30 ? 'red' : age > 7 ? 'amber' : 'blue'}>{age} j</Badge></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a className="btn-gold btn-sm" target="_blank" rel="noopener noreferrer" href={waLink(ph, reminderMessage(s, r, app.settings.company), app.settings.whatsappCC)}>WhatsApp</a>
                  {ph && <a className="btn-ghost btn-sm" href={telLink(ph)}><Icon name="phone" size={14} />Appeler</a>}
                  <Link className="btn-ghost btn-sm" to={`/ventes/${s.id}`}>Encaisser</Link>
                </div>
                {!ph && <div className="mt-1 text-[11px] text-neutral-500">Pas de numéro enregistré : WhatsApp vous laissera choisir le contact.</div>}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
