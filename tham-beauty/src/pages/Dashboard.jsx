import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { periodRange, convert, commissionOf, sellerStats, markupPct, pctSub, round2 } from '../lib/calc.js'
import { computeMetrics } from '../lib/metrics.js'
import { fundConfig, fundSummary } from '../lib/fund.js'
import { fdate, sellerOf, today } from '../lib/util.js'
import Icon from '../components/Icon.jsx'
import { Dropdown, Empty, Ledger, MoneyRow, PageHeader, Popover, PrivacyCtx, Row, useMoney, usePrivacy } from '../components/ui.jsx'

export const PERIODS = [
  { value: 'jour', label: "Aujourd'hui" }, { value: 'semaine', label: 'Cette semaine' }, { value: 'mois', label: 'Ce mois' },
  { value: 'trimestre', label: 'Ce trimestre' }, { value: 'annee', label: 'Cette année' }, { value: 'tout', label: 'Toute la période' },
  { value: 'perso', label: 'Période personnalisée' }
]
const EMPTY_FLT = { projectId: '', customerId: '', supplierId: '', productId: '', currency: '' }

export function useFilters() {
  const [period, setPeriod] = useState('mois')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [flt, setFlt] = useState(EMPTY_FLT)
  const range = useMemo(() => periodRange(period, custom), [period, custom])
  return { period, setPeriod, custom, setCustom, flt, setFlt, range }
}

export function FilterBar({ F }) {
  const app = useApp()
  const count = Object.values(F.flt).filter(Boolean).length
  const sel = (k, label, opts) => (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input !py-2" value={F.flt[k]} onChange={(e) => F.setFlt({ ...F.flt, [k]: e.target.value })}>
        <option value="">Tous</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  )
  const [a, b] = F.range
  const rangeLabel = F.period === 'tout' ? 'Depuis le début' : `${fdate(a)} → ${fdate(b)}`
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <Dropdown icon="calendar" value={F.period} options={PERIODS} onChange={F.setPeriod} />
      {F.period === 'perso' && (
        <div className="flex items-center gap-1.5">
          <input type="date" className="input !w-auto !py-2" value={F.custom.from} onChange={(e) => F.setCustom({ ...F.custom, from: e.target.value })} />
          <span className="text-neutral-400">→</span>
          <input type="date" className="input !w-auto !py-2" value={F.custom.to} onChange={(e) => F.setCustom({ ...F.custom, to: e.target.value })} />
        </div>
      )}
      <Popover trigger={
        <button type="button" className="btn-ghost">
          <Icon name="filter" size={15} className="text-gold-600" />Filtres
          {count > 0 && <span className="grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-ink px-1 text-[10px] text-gold-300">{count}</span>}
        </button>}>
        <div className="space-y-3">
          {sel('projectId', 'Projet', app.D.projects.map((p) => ({ id: p.id, name: `${p.number} ${p.name}` })))}
          {sel('customerId', 'Client', app.D.customers)}
          {sel('supplierId', 'Fournisseur', app.D.suppliers)}
          {sel('productId', 'Produit', app.D.products)}
          {sel('currency', 'Devise', [{ id: 'USD', name: 'USD' }, { id: 'HTG', name: 'HTG' }])}
          {count > 0 && <button type="button" className="btn-ghost btn-sm w-full" onClick={() => F.setFlt(EMPTY_FLT)}>Réinitialiser les filtres</button>}
        </div>
      </Popover>
      <span className="ml-auto hidden text-xs text-neutral-500 sm:block">{rangeLabel}</span>
    </div>
  )
}

function Bars({ data, cur }) {
  const fm = useMoney()
  const entries = Object.entries(data).sort((a, b) => a[0].localeCompare(b[0])).slice(-14)
  if (!entries.length) return <Empty icon="chart">Aucune vente sur la période.</Empty>
  const max = Math.max(...entries.map((e) => e[1]), 1)
  return (
    <div className="flex h-40 items-end gap-2">
      {entries.map(([d, v]) => (
        <div key={d} className="group flex h-full min-w-0 max-w-[64px] flex-1 flex-col items-center justify-end" title={`${fdate(d)} : ${fm(v, cur)}`}>
          <div className="w-full rounded-t-lg bg-gradient-to-t from-gold-600 via-gold-400 to-gold-200 transition group-hover:from-blush-500 group-hover:to-blush-400" style={{ height: `${Math.max(5, (v / max) * 100)}%` }} />
          <div className="mt-1.5 text-[10px] text-neutral-400">{new Date(d).getDate()}/{new Date(d).getMonth() + 1}</div>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [hidden, toggle] = usePrivacy()
  return <PrivacyCtx.Provider value={hidden}><DashboardInner hidden={hidden} toggle={toggle} /></PrivacyCtx.Provider>
}

function DashboardInner({ hidden, toggle }) {
  const fm = useMoney()
  const app = useApp()
  const F = useFilters()
  const fin = app.can('finance.read')
  const m = useMemo(() => computeMetrics({ D: app.D, costing: app.costing, ref: app.ref, rate: app.rate, settings: app.settings }, { range: F.range, ...F.flt }), [app.D, app.costing, app.ref, app.rate, app.settings, F.range, F.flt])
  const r = app.ref
  const fund = useMemo(() => (app.isAdmin ? fundSummary(app.D, app.costing, app.ref, fundConfig(app.settings)) : null), [app.isAdmin, app.D, app.costing, app.ref, app.settings])
  const recentSales = [...app.D.sales].sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || '')).slice(0, 5)
  const recentExp = [...app.D.expenses].filter((e) => e.status !== 'annule').sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5)
  const hello = (app.profile?.name || '').split(' ')[0]

  return (
    <>
      <PageHeader title={hello ? `Bonjour, ${hello}` : 'Tableau de bord'} subtitle={`Devise de référence : ${r} · 1 USD = ${app.rate} HTG`}>
        {app.can('sales.write') && <Link to="/ventes/nouvelle" className="btn-gold"><Icon name="plus" size={16} />Nouvelle vente</Link>}
      </PageHeader>
      <MyPerformance />
      <FilterBar F={F} />

      {/* Bandeau principal */}
      <div className="relative mb-5 overflow-hidden rounded-3xl bg-ink p-5 text-white shadow-pop sm:p-7"
        style={{ backgroundImage: 'radial-gradient(80% 120% at 100% 0%, rgba(201,154,62,.32), transparent 55%), radial-gradient(60% 100% at 0% 100%, rgba(240,86,143,.16), transparent 60%)' }}>
        <button type="button" onClick={toggle} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full text-gold-300 hover:bg-white/10 active:bg-white/15" aria-label={hidden ? 'Afficher les montants' : 'Masquer les montants'} title={hidden ? 'Afficher les montants' : 'Masquer les montants'}><Icon name={hidden ? 'eyeoff' : 'eye'} size={21} /></button>
        <div className="text-sm font-medium text-gold-300">Chiffre d'affaires net</div>
        <div className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl"><span className="gold-text">{fm(m.net, r)}</span></div>
        <div className="mt-1 text-sm text-neutral-400">{m.nbSales} vente{m.nbSales > 1 ? 's' : ''} · panier moyen {fm(m.avgBasket, r)} · réductions {fm(m.discount, r)}</div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {fin && <div className="rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10"><div className="text-xs text-neutral-400">Bénéfice réalisé</div><div className={'mt-1 text-lg font-semibold ' + (m.grossProfit >= 0 ? 'text-emerald-300' : 'text-blush-400')}>{fm(m.grossProfit, r)}</div>{markupPct(m.net, m.cogs) != null && <div className="text-[11px] text-neutral-400">{markupPct(m.net, m.cogs) > 0 ? '+' : ''}{round2(markupPct(m.net, m.cogs))} % sur coût</div>}</div>}
          {fin && <div className="rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10"><div className="text-xs text-neutral-400">Encaissements</div><div className="mt-1 text-lg font-semibold">{fm(m.cashIn, r)}</div></div>}
          {fin && <div className="rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10"><div className="text-xs text-neutral-400">Créances clients</div><div className="mt-1 text-lg font-semibold">{fm(m.receivables, r)}</div></div>}
          <div className="rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10"><div className="text-xs text-neutral-400">Articles en stock</div><div className="mt-1 text-lg font-semibold">{m.available}</div></div>
        </div>
      </div>

      {fund && (
        <Link to="/fonds" className="card mb-5 flex items-center justify-between gap-3 transition hover:ring-1 hover:ring-gold-400/60">
          <div><div className="text-xs text-neutral-500">Fonds de réinvestissement disponible</div><div className="mt-1 text-xl font-semibold text-gold-700">{fm(fund.available, r)}</div></div>
          <span className="shrink-0 text-sm font-medium underline">Voir / réinvestir →</span>
        </Link>
      )}

      <div className="card mb-5"><div className="mb-3 font-display text-base font-semibold">Ventes nettes par jour</div><div className={hidden ? 'pointer-events-none select-none opacity-60 blur-[5px]' : ''}><Bars data={m.byDay} cur={r} /></div></div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Ledger title="Ventes">
          <MoneyRow label="Chiffre d'affaires brut" v={m.gross} cur={r} />
          <MoneyRow label="Réductions accordées" sub={`${Math.round(m.discountPct * 10) / 10} % du brut`} v={m.discount} cur={r} />
          <MoneyRow strong label="Chiffre d'affaires net" v={m.net} cur={r} />
          <Row label="Nombre de ventes" value={m.nbSales} />
          <MoneyRow label="Panier moyen" v={m.avgBasket} cur={r} />
        </Ledger>

        {fin && (
          <Ledger title="Résultat" note="Le bénéfice prévisionnel est séparé du bénéfice réalisé : il concerne tout le lot commandé, pas seulement ce qui est vendu.">
            <MoneyRow label="Coût des marchandises vendues" v={m.cogs} cur={r} />
            <MoneyRow strong signed label="Bénéfice réalisé (marge brute)" sub={pctSub(m.net, m.cogs)} v={m.grossProfit} cur={r} />
            <MoneyRow label="Dépenses générales" v={m.expGeneral} cur={r} />
            {m.expGlobalProject > 0.004 && <MoneyRow label="Frais globaux de projets" sub="banque, douane, transport…" v={m.expGlobalProject} cur={r} />}
            <MoneyRow strong signed label="Résultat après frais généraux" v={m.netResult} cur={r} />
            <MoneyRow signed label="Bénéfice prévisionnel (projets en cours)" v={m.forecast} cur={r} />
            <MoneyRow signed label="Gains / pertes de change" v={m.fx} cur={r} />
          </Ledger>
        )}

        {fin && (
          <Ledger title="Trésorerie" note="Encaissements et décaissements enregistrés sur la période. Les créances et dettes sont les soldes à ce jour.">
            <MoneyRow label="Encaissements" v={m.cashIn} cur={r} />
            <MoneyRow label="Décaissements" sub="Dépenses, fournisseurs, remboursements" v={m.cashOut} cur={r} />
            <MoneyRow strong signed label="Trésorerie de la période" v={m.treasury} cur={r} />
            <MoneyRow label="Créances clients" v={m.receivables} cur={r} />
            <MoneyRow label="Dettes fournisseurs" v={m.payables} cur={r} />
          </Ledger>
        )}

        <Ledger title="Stock">
          <Row label="Références en stock" value={m.refs} />
          <Row label="Articles disponibles" value={m.available} />
          <Row label="En rupture" value={m.outOfStock} tone={m.outOfStock ? 'bad' : undefined} />
          <Row label="Stock faible" value={m.lowStock} />
          {fin && <MoneyRow strong label="Valeur du stock" v={m.stockValue} cur={r} />}
        </Ledger>

        <Ledger title="Activité">
          <Row label="Projets actifs" value={m.activeProjects} />
          <Row label="Fournisseurs" value={app.D.suppliers.length} />
          <Row label="Clients" value={app.D.customers.length} />
          <Row label="Factures impayées" value={m.unpaidInvoices} tone={m.unpaidInvoices ? 'bad' : undefined} />
          <Row label="Commandes à livrer" value={app.D.sales.filter((s) => s.status !== 'annule' && s.delivery === 'a_livrer').length} />
        </Ledger>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card"><div className="mb-2 font-display text-base font-semibold">Articles les plus vendus</div>
          {!m.topItems.length ? <div className="text-sm text-neutral-500">—</div> : m.topItems.map((x) => <div key={x.label} className="flex justify-between border-b border-line/70 py-2 text-sm last:border-0"><span>{x.label}</span><b>{x.qty}</b></div>)}</div>
        {fin && <div className="card"><div className="mb-2 font-display text-base font-semibold">Projets les plus rentables</div>
          {!m.topProjects.length ? <div className="text-sm text-neutral-500">—</div> : m.topProjects.map((x) => <Link key={x.id} to={`/projets/${x.id}`} className="flex justify-between border-b border-line/70 py-2 text-sm last:border-0"><span>{x.p?.number} {x.p?.name}</span><b className={x.profit >= 0 ? 'text-emerald-700' : 'text-blush-600'}>{fm(x.profit, r)}</b></Link>)}</div>}
        <div className="card"><div className="mb-2 font-display text-base font-semibold">Transactions récentes</div>
          {!recentSales.length ? <div className="text-sm text-neutral-500">—</div> : recentSales.map((s) => <Link key={s.id} to={`/ventes/${s.id}`} className="flex justify-between border-b border-line/70 py-2 text-sm last:border-0"><span>{s.number} · {s.customerName}<span className="block text-xs text-neutral-500">par {sellerOf(s)}</span></span><span className="text-neutral-500">{fdate(s.date)}</span></Link>)}</div>
        {fin && <div className="card"><div className="mb-2 font-display text-base font-semibold">Dépenses récentes</div>
          {!recentExp.length ? <div className="text-sm text-neutral-500">—</div> : recentExp.map((e) => <div key={e.id} className="flex justify-between border-b border-line/70 py-2 text-sm last:border-0"><span>{e.category}</span><b>{fm(convert(e.amount, e.currency, r, e.rate), r)}</b></div>)}</div>}
        {fin && m.slow.length > 0 && <div className="card lg:col-span-2"><div className="mb-2 font-display text-base font-semibold">Articles à faible rotation</div>{m.slow.map((x, i) => <div key={i} className="flex justify-between border-b border-line/70 py-2 text-sm last:border-0"><span>{x.label} ({x.project})</span><span>reste {x.remaining}</span></div>)}</div>}
      </div>
    </>
  )
}

// « Mes ventes du mois » : visible par un vendeur seulement si l'administrateur l'a autorisé (Réglages → Commissions & objectifs)
function MyPerformance() {
  const fm = useMoney()
  const app = useApp()
  const cfg = app.settings.commission
  const month = today().slice(0, 7)
  const uid = app.authUser?.uid
  const mine = useMemo(() => sellerStats(app.D.sales, app.costing, app.ref, () => 'me',
    (s) => (s.date || '').startsWith(month) && (s.sellerId ? s.sellerId === uid : sellerOf(s) === app.profile?.name)).me || { count: 0, ca: 0, profit: 0 }, [app.D.sales, app.costing, app.ref, month, uid])
  if (app.isAdmin || !cfg?.enabled || !cfg.visibleToSellers) return null
  const pct = cfg.target > 0 ? Math.round((mine.ca / cfg.target) * 100) : 0
  return (
    <div className="card mb-4">
      <div className="mb-2 flex items-center justify-between"><div className="font-medium">Mes ventes du mois</div><span className="text-xs text-neutral-500">{month}</span></div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div><div className="text-xs text-neutral-500">Ventes</div><div className="text-lg font-semibold">{mine.count}</div></div>
        <div><div className="text-xs text-neutral-500">Chiffre d'affaires</div><div className="text-lg font-semibold">{fm(mine.ca, app.ref)}</div></div>
        <div><div className="text-xs text-neutral-500">Ma commission</div><div className="text-lg font-semibold text-gold-700">{fm(commissionOf(cfg, mine.ca, mine.profit), app.ref)}</div></div>
      </div>
      {cfg.target > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-neutral-500"><span>Objectif {fm(cfg.target, app.ref)}</span><span>{pct} %</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100"><div className={'h-full rounded-full ' + (pct >= 100 ? 'bg-emerald-500' : 'bg-gold-500')} style={{ width: Math.min(100, pct) + '%' }} /></div>
        </div>
      )}
    </div>
  )
}
