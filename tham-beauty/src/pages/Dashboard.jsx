import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { periodRange, convert } from '../lib/calc.js'
import { computeMetrics } from '../lib/metrics.js'
import { fdate, money } from '../lib/util.js'
import { Empty, Input, MoneyStat, PageHeader, Stat } from '../components/ui.jsx'

export const PERIODS = [['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois'], ['trimestre', 'Trimestre'], ['annee', 'Année'], ['tout', 'Tout'], ['perso', 'Personnalisée']]

export function useFilters() {
  const [period, setPeriod] = useState('mois')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [flt, setFlt] = useState({ projectId: '', customerId: '', supplierId: '', productId: '', currency: '' })
  const range = useMemo(() => periodRange(period, custom), [period, custom])
  return { period, setPeriod, custom, setCustom, flt, setFlt, range }
}

export function FilterBar({ F }) {
  const app = useApp()
  const sel = (k, label, opts) => (
    <select className="input !w-auto !py-1.5 text-xs" value={F.flt[k]} onChange={(e) => F.setFlt({ ...F.flt, [k]: e.target.value })}>
      <option value="">{label}</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  )
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map(([k, l]) => <button key={k} onClick={() => F.setPeriod(k)} className={'rounded-full border px-3 py-1 text-xs ' + (F.period === k ? 'border-neutral-900 bg-neutral-900 text-gold-400' : 'border-neutral-300 bg-white')}>{l}</button>)}
      </div>
      {F.period === 'perso' && <div className="flex gap-2"><Input type="date" value={F.custom.from} onChange={(e) => F.setCustom({ ...F.custom, from: e.target.value })} /><Input type="date" value={F.custom.to} onChange={(e) => F.setCustom({ ...F.custom, to: e.target.value })} /></div>}
      <div className="flex flex-wrap gap-1.5">
        {sel('projectId', 'Projet', app.D.projects.map((p) => ({ id: p.id, name: `${p.number} ${p.name}` })))}
        {sel('customerId', 'Client', app.D.customers)}
        {sel('supplierId', 'Fournisseur', app.D.suppliers)}
        {sel('productId', 'Produit', app.D.products)}
        {sel('currency', 'Devise', [{ id: 'USD', name: 'USD' }, { id: 'HTG', name: 'HTG' }])}
      </div>
    </div>
  )
}

function Bars({ data, cur }) {
  const entries = Object.entries(data).sort((a, b) => a[0].localeCompare(b[0])).slice(-14)
  if (!entries.length) return <Empty>Aucune vente sur la période.</Empty>
  const max = Math.max(...entries.map((e) => e[1]), 1)
  return (
    <div className="flex h-36 items-end gap-1.5">
      {entries.map(([d, v]) => (
        <div key={d} className="flex min-w-0 flex-1 flex-col items-center justify-end" title={`${fdate(d)} : ${money(v, cur)}`}>
          <div className="w-full rounded-t bg-gold-500" style={{ height: `${Math.max(4, (v / max) * 100)}%` }} />
          <div className="mt-1 text-[9px] text-neutral-500">{new Date(d).getDate()}/{new Date(d).getMonth() + 1}</div>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const app = useApp()
  const F = useFilters()
  const fin = app.can('finance.read')
  const m = useMemo(() => computeMetrics({ D: app.D, costing: app.costing, ref: app.ref, rate: app.rate, settings: app.settings }, { range: F.range, ...F.flt }), [app.D, app.costing, app.ref, app.rate, app.settings, F.range, F.flt])
  const r = app.ref
  const recentSales = [...app.D.sales].sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || '')).slice(0, 5)
  const recentExp = [...app.D.expenses].filter((e) => e.status !== 'annule').sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5)

  return (
    <>
      <PageHeader title="Tableau de bord"><span className="self-center text-xs text-neutral-500">Devise de référence : {r} · 1 USD = {app.rate} HTG</span></PageHeader>
      <FilterBar F={F} />

      <h2 className="mb-2 text-sm font-semibold text-neutral-600">Commercial</h2>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MoneyStat label="Chiffre d'affaires brut" v={m.gross} cur={r} />
        <MoneyStat label="Réductions accordées" v={m.discount} cur={r} sub={`${Math.round(m.discountPct * 10) / 10} % du brut`} />
        <MoneyStat label="Chiffre d'affaires net" v={m.net} cur={r} />
        <Stat label="Nombre de ventes" value={m.nbSales} sub={`Panier moyen : ${money(m.avgBasket, r)}`} />
      </div>
      <div className="card mb-4"><div className="mb-2 text-sm font-medium">Ventes nettes par jour</div><Bars data={m.byDay} cur={r} /></div>

      {fin && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-neutral-600">Financier</h2>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MoneyStat label="Coût des marchandises vendues" v={m.cogs} cur={r} />
            <MoneyStat label="Marge brute / bénéfice commercial réalisé" v={m.grossProfit} cur={r} signed />
            <MoneyStat label="Dépenses opérationnelles (générales)" v={m.expGeneral} cur={r} />
            <MoneyStat label="Résultat après frais généraux" v={m.netResult} cur={r} signed />
            <MoneyStat label="Bénéfice prévisionnel (projets en cours)" v={m.forecast} cur={r} signed sub="Séparé du bénéfice réalisé" />
            <MoneyStat label="Créances clients" v={m.receivables} cur={r} />
            <MoneyStat label="Dettes fournisseurs" v={m.payables} cur={r} />
            <MoneyStat label="Gains / pertes de change" v={m.fx} cur={r} signed />
            <MoneyStat label="Encaissements" v={m.cashIn} cur={r} />
            <MoneyStat label="Décaissements" v={m.cashOut} cur={r} sub="Dépenses + paiements fournisseurs + remboursements" />
            <MoneyStat label="Trésorerie enregistrée (période)" v={m.treasury} cur={r} signed />
          </div>
        </>
      )}

      <h2 className="mb-2 text-sm font-semibold text-neutral-600">Stock</h2>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Références en stock" value={m.refs} />
        <Stat label="Articles disponibles" value={m.available} />
        <Stat label="En rupture" value={m.outOfStock} />
        <Stat label="Stock faible" value={m.lowStock} />
        {fin && <MoneyStat label="Valeur du stock" v={m.stockValue} cur={r} />}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-neutral-600">Gestion</h2>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Projets actifs" value={m.activeProjects} />
        <Stat label="Fournisseurs" value={app.D.suppliers.length} />
        <Stat label="Clients" value={app.D.customers.length} />
        <Stat label="Factures impayées" value={m.unpaidInvoices} />
        <Stat label="Commandes à livrer" value={app.D.sales.filter((s) => s.status !== 'annule' && s.delivery === 'a_livrer').length} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="card"><div className="mb-2 text-sm font-medium">Articles les plus vendus</div>
          {!m.topItems.length ? <div className="text-sm text-neutral-500">—</div> : m.topItems.map((x) => <div key={x.label} className="flex justify-between border-b border-neutral-100 py-1 text-sm"><span>{x.label}</span><b>{x.qty}</b></div>)}</div>
        {fin && <div className="card"><div className="mb-2 text-sm font-medium">Projets les plus rentables</div>
          {!m.topProjects.length ? <div className="text-sm text-neutral-500">—</div> : m.topProjects.map((x) => <Link key={x.id} to={`/projets/${x.id}`} className="flex justify-between border-b border-neutral-100 py-1 text-sm"><span>{x.p?.number} {x.p?.name}</span><b className={x.profit >= 0 ? 'text-emerald-700' : 'text-red-700'}>{money(x.profit, r)}</b></Link>)}</div>}
        <div className="card"><div className="mb-2 text-sm font-medium">Transactions récentes</div>
          {!recentSales.length ? <div className="text-sm text-neutral-500">—</div> : recentSales.map((s) => <Link key={s.id} to={`/ventes/${s.id}`} className="flex justify-between border-b border-neutral-100 py-1 text-sm"><span>{s.number} · {s.customerName}</span><span>{fdate(s.date)}</span></Link>)}</div>
        {fin && <div className="card"><div className="mb-2 text-sm font-medium">Dépenses récentes</div>
          {!recentExp.length ? <div className="text-sm text-neutral-500">—</div> : recentExp.map((e) => <div key={e.id} className="flex justify-between border-b border-neutral-100 py-1 text-sm"><span>{e.category}</span><b>{money(convert(e.amount, e.currency, r, e.rate), r)}</b></div>)}</div>}
        {fin && m.slow.length > 0 && <div className="card lg:col-span-2"><div className="mb-2 text-sm font-medium">Articles à faible rotation</div>{m.slow.map((x, i) => <div key={i} className="flex justify-between border-b border-neutral-100 py-1 text-sm"><span>{x.label} ({x.project})</span><span>reste {x.remaining}</span></div>)}</div>}
      </div>
    </>
  )
}
