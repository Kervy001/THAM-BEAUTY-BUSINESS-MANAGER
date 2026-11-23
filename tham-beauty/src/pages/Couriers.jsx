import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { fdate, money, today } from '../lib/util.js'
import CouriersManager from '../components/CouriersManager.jsx'
import { Badge, Empty, PageHeader, Table } from '../components/ui.jsx'

const iso = (d) => d.toISOString().slice(0, 10)
const shift = (n) => { const d = new Date(today() + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d) }
const addTo = (o, cur, v) => { o[cur] = (o[cur] || 0) + v }
const fmt = (o) => { const k = Object.keys(o).filter((c) => o[c]); return k.length ? k.map((c) => money(o[c], c)).join(' + ') : '—' }

// Rapport des livreurs : frais de livraison par livreur et par jour (hors chiffre d'affaires)
export default function Couriers() {
  const app = useApp()
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [open, setOpen] = useState('')
  const quick = (a, b) => { setFrom(a); setTo(b) }
  const mondayOff = (() => { const d = new Date(today() + 'T12:00:00').getDay(); return d === 0 ? 6 : d - 1 })()

  const { groups, total, all } = useMemo(() => {
    const g = new Map()
    const total = { fees: {}, due: {}, n: 0 }
    app.D.sales.forEach((s) => {
      const f = s.deliveryFee
      if (!f || !(f.amount > 0) || s.status === 'annule' || !s.date || s.date < from || s.date > to) return
      const key = f.courierId || 'none'
      const name = (app.settings.couriers || []).find((c) => c.id === f.courierId)?.name || f.courierName || 'Sans livreur'
      if (!g.has(key)) g.set(key, { key, name, rows: [], fees: {}, due: {} })
      const x = g.get(key)
      x.rows.push(s); addTo(x.fees, f.currency, Number(f.amount))
      if (!f.remittedAt) addTo(x.due, f.currency, Number(f.amount))
      addTo(total.fees, f.currency, Number(f.amount)); if (!f.remittedAt) addTo(total.due, f.currency, Number(f.amount)); total.n++
    })
    const groups = [...g.values()].sort((a, b) => a.name.localeCompare(b.name))
    groups.forEach((x) => x.rows.sort((a, b) => (b.date || '').localeCompare(a.date || '')))
    return { groups, total, all: g }
  }, [app.D.sales, app.settings.couriers, from, to])

  // Payer un livreur : marque comme « remis » toutes ses livraisons non remises de la période affichée, avec la date du paiement.
  const [paying, setPaying] = useState('')
  async function payAll(x) {
    const due = x.rows.filter((s) => !s.deliveryFee.remittedAt)
    if (!due.length || !app.can('sales.write')) return
    const date = window.prompt(`Payer ${x.name} : ${fmt(x.due)} pour ${due.length} livraison(s).\nDate du paiement (AAAA-MM-JJ) :`, today())
    if (!date) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { app.notify('Date invalide (format AAAA-MM-JJ).', 'error'); return }
    setPaying(x.key)
    try {
      for (const s of due) await app.save('sales', s.id, { deliveryFee: { ...s.deliveryFee, remittedAt: date } }, 'frais de livraison remis')
      app.notify(`Paiement de ${x.name} enregistré ✓`)
    } finally { setPaying('') }
  }
  async function toggle(s) {
    const f = s.deliveryFee
    const next = { ...f }
    if (f.remittedAt) delete next.remittedAt; else next.remittedAt = today()
    await app.save('sales', s.id, { deliveryFee: next }, 'frais de livraison')
  }

  return (
    <>
      <PageHeader title="Livreurs" subtitle="Frais de livraison par livreur (hors chiffre d’affaires)" />
      {app.isAdmin && <CouriersManager />}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">Du<input type="date" className="input !w-auto" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">Au<input type="date" className="input !w-auto" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="btn-ghost btn-sm" onClick={() => quick(today(), today())}>Aujourd’hui</button>
        <button className="btn-ghost btn-sm" onClick={() => quick(shift(-1), shift(-1))}>Hier</button>
        <button className="btn-ghost btn-sm" onClick={() => quick(shift(-mondayOff), today())}>Cette semaine</button>
        <button className="btn-ghost btn-sm" onClick={() => quick(today().slice(0, 8) + '01', today())}>Ce mois</button>
        <button className="btn-ghost btn-sm" onClick={() => quick('2000-01-01', '2999-12-31')}>Tout</button>
      </div>
      <div className="card mb-4 grid gap-2 text-sm sm:grid-cols-3">
        <div><div className="text-xs text-neutral-500">Total général (frais)</div><b>{fmt(total.fees)}</b></div>
        <div><div className="text-xs text-neutral-500">Livraisons</div><b>{total.n}</b></div>
        <div><div className="text-xs text-neutral-500">Reste à remettre aux livreurs</div><b>{fmt(total.due)}</b></div>
      </div>
      {groups.length === 0 ? <Empty>Aucune livraison avec frais sur cette période.</Empty> : groups.map((x) => (
        <div key={x.key} className="card mb-3">
          <button className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpen(open === x.key ? '' : x.key)}>
            <span className="font-display text-base font-semibold">{x.name} <span className="text-sm font-normal text-neutral-500">· {x.rows.length} livraison(s)</span></span>
            <span className="text-sm">Total : <b>{fmt(x.fees)}</b> · À remettre : <b>{fmt(x.due)}</b></span>
          </button>
          {open === x.key && (
            <div className="mt-2">
              {app.can('sales.write') && Object.keys(x.due).some((c) => x.due[c] > 0) && (
                <button className="btn-primary mb-3 w-full sm:w-auto" disabled={paying === x.key} onClick={() => payAll(x)}>{paying === x.key ? '…' : `Payer ${x.name} (${fmt(x.due)})`}</button>
              )}
              <Table head={['Date', 'Vente', 'Client', 'Frais', 'Statut']}>
                {x.rows.map((s) => (
                  <tr key={s.id}>
                    <td className="td">{fdate(s.date)}</td>
                    <td className="td"><Link className="underline" to={`/ventes/${s.id}`}>{s.number}</Link></td>
                    <td className="td">{s.customerName || '—'}</td>
                    <td className="td">{money(s.deliveryFee.amount, s.deliveryFee.currency)}</td>
                    <td className="td">{app.can('sales.write') ? <button className="btn-ghost btn-sm" onClick={() => toggle(s)}>{s.deliveryFee.remittedAt ? 'Remis ✓ (annuler)' : 'Marquer remis'}</button> : <Badge tone={s.deliveryFee.remittedAt ? 'green' : 'amber'}>{s.deliveryFee.remittedAt ? 'Remis' : 'À remettre'}</Badge>}</td>
                  </tr>
                ))}
              </Table>
              <History rows={x.rows} />
            </div>
          )}
        </div>
      ))}
    </>
  )
}

// Historique des paiements d'un livreur : une ligne par date de remise
function History({ rows }) {
  const byDate = {}
  rows.filter((s) => s.deliveryFee.remittedAt).forEach((s) => {
    const d = s.deliveryFee.remittedAt
    byDate[d] = byDate[d] || { n: 0, tot: {} }
    byDate[d].n++; addTo(byDate[d].tot, s.deliveryFee.currency, Number(s.deliveryFee.amount))
  })
  const list = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]))
  if (!list.length) return null
  return (
    <div className="mt-3 rounded-2xl bg-neutral-50 p-3 text-sm dark:bg-white/5">
      <div className="mb-1 font-medium">Paiements au livreur</div>
      {list.map(([d, v]) => <div key={d} className="flex justify-between border-b border-line/60 py-1 last:border-0"><span>{fdate(d)} · {v.n} livraison(s)</span><b>{fmt(v.tot)}</b></div>)}
    </div>
  )
}
