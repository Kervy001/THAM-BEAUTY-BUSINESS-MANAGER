import { useMemo } from 'react'
import { useApp } from '../lib/store.jsx'
import { commissionOf, convert, inRange, purchaseSummary, projectStats, round2, sellerStats, saleSummary, saleProfit } from '../lib/calc.js'
import { computeMetrics } from '../lib/metrics.js'
import { downloadCSV, fdate, money, sellerOf, today, STATUS_PROJECT } from '../lib/util.js'
import { FilterBar, useFilters } from './Dashboard.jsx'
import { MoneyStat, PageHeader, Stat } from '../components/ui.jsx'

export default function Reports() {
  const app = useApp()
  const F = useFilters()
  const canExport = app.can('export')
  const r = app.ref
  const m = useMemo(() => computeMetrics({ D: app.D, costing: app.costing, ref: r, rate: app.rate, settings: app.settings }, { range: F.range, ...F.flt }), [app.D, app.costing, r, app.rate, app.settings, F.range, F.flt])

  // Ventes par vendeur sur la période choisie (hors ventes annulées)
  const bySeller = useMemo(() => {
    const g = {}
    app.D.sales.filter((s) => s.status !== 'annule' && inRange(s.date, F.range)).forEach((s) => {
      const k = sellerOf(s)
      const x = saleSummary(s)
      const a = (g[k] ||= { name: k, count: 0, ca: 0, profit: 0 })
      a.count++
      a.ca += convert(x.netKept, s.currency, r, s.rate)
      a.profit += saleProfit(s, {}, app.costing, r).profit
    })
    return Object.values(g).sort((a, b) => b.ca - a.ca)
  }, [app.D.sales, app.costing, r, F.range])
  const showProfit = app.isAdmin || app.can('finance.read')
  // Commissions et objectifs : visibles uniquement par l'administrateur (réglage dans Utilisateurs & réglages)
  const com = app.settings.commission
  const showCom = app.isAdmin && com?.enabled
  const month = today().slice(0, 7)
  const monthStats = useMemo(() => Object.values(sellerStats(app.D.sales, app.costing, r, sellerOf, (s) => (s.date || '').startsWith(month))).sort((a, b) => b.ca - a.ca), [app.D.sales, app.costing, r, month])
  // Bénéfice par produit et par catégorie (période choisie)
  const byProduct = useMemo(() => {
    const itemProd = {}
    app.D.projects.forEach((p) => (p.items || []).forEach((it) => { itemProd[it.id] = it.productId }))
    const catOf = Object.fromEntries(app.D.products.map((p) => [p.id, p.category || 'Sans catégorie']))
    const prod = {}
    const cat = {}
    app.D.sales.filter((s) => s.status !== 'annule' && inRange(s.date, F.range)).forEach((s) => (s.lines || []).forEach((l) => {
      const x = saleProfit(s, {}, app.costing, r, (y) => y.id === l.id)
      if (!x.qty) return
      const c = catOf[itemProd[l.itemId]] || 'Sans catégorie'
      const a = (prod[l.label] ||= { name: l.label, qty: 0, revenue: 0, profit: 0 })
      a.qty += x.qty; a.revenue += x.revenue; a.profit += x.profit
      const b = (cat[c] ||= { name: c, qty: 0, revenue: 0, profit: 0 })
      b.qty += x.qty; b.revenue += x.revenue; b.profit += x.profit
    }))
    const top = (o) => Object.values(o).sort((a, b) => b.profit - a.profit)
    return { products: top(prod).slice(0, 10), categories: top(cat) }
  }, [app.D.sales, app.D.projects, app.D.products, app.costing, r, F.range])

  const exports = {
    ventes: () => downloadCSV('ventes.csv', [['N°', 'Date', 'Client', 'Vendeur', 'Devise', 'Taux', 'Brut', 'Réductions', 'Net', 'Payé', 'Solde', 'Statut paiement', 'Statut'],
      ...app.D.sales.filter((s) => inRange(s.date, F.range)).map((s) => { const x = saleSummary(s); return [s.number, s.date, s.customerName, sellerOf(s), s.currency, s.rate, round2(x.gross), round2(x.totalDiscount), round2(x.netKept), round2(x.paid), round2(x.balance), x.payStatus, s.status] })]),
    lignes: () => downloadCSV('lignes-de-vente.csv', [['Vente', 'Date', 'Vendeur', 'Article', 'Projet', 'Qté', 'Prix unit.', 'Net ligne', `Coût (${r})`, `Bénéfice (${r})`],
      ...app.D.sales.filter((s) => s.status !== 'annule' && inRange(s.date, F.range)).flatMap((s) => (s.lines || []).map((l) => {
        const p = saleProfit(s, {}, app.costing, r, (x) => x.id === l.id)
        const pr = app.D.projects.find((q) => q.id === l.projectId)
        return [s.number, s.date, sellerOf(s), l.label, pr?.number, l.qty, l.unitPrice, round2(convert(p.revenue, r, s.currency, s.rate)), round2(p.cogs), round2(p.profit)]
      }))]),
    projets: () => downloadCSV('projets.csv', [['N°', 'Projet', 'Fournisseur', 'Statut', 'Commandé', 'Reçu', 'Vendu', 'Reste', `Coût total (${r})`, `CA réalisé (${r})`, `Bénéfice réalisé (${r})`, `Bénéfice prévisionnel (${r})`, `Valeur stock (${r})`],
      ...app.D.projects.map((p) => { const s = projectStats(p, app.D.sales, app.costing[p.id], r, app.rate); return [p.number, p.name, p.supplierName, STATUS_PROJECT[p.status], s.qtyOrdered, s.qtyReceived, s.sold, s.remaining, round2(s.totalCostRef), round2(s.revenueRef), round2(s.profitRef), round2(s.forecastProfitRef), round2(s.stockValueRef)] })]),
    depenses: () => downloadCSV('depenses.csv', [['N°', 'Date', 'Projet', 'Catégorie', 'Description', 'Montant', 'Devise', 'Taux', `Converti (${r})`, 'Statut'],
      ...app.D.expenses.filter((e) => inRange(e.date, F.range)).map((e) => [e.number, e.date, app.D.projects.find((p) => p.id === e.projectId)?.number || 'Général', e.category, e.description, e.amount, e.currency, e.rate, round2(convert(e.amount, e.currency, r, e.rate)), e.status])]),
    creances: () => downloadCSV('creances-clients.csv', [['Vente', 'Date', 'Client', 'Devise', 'Net', 'Payé', 'Solde'],
      ...app.D.sales.filter((s) => s.status !== 'annule').map((s) => ({ s, x: saleSummary(s) })).filter(({ x }) => x.balance > 0.005).map(({ s, x }) => [s.number, s.date, s.customerName, s.currency, round2(x.netKept), round2(x.paid), round2(x.balance)])]),
    dettes: () => downloadCSV('dettes-fournisseurs.csv', [['Projet', 'Fournisseur', 'Devise', 'Dû', 'Payé', 'Solde'],
      ...app.D.projects.map((p) => ({ p, x: purchaseSummary(p) })).filter(({ x }) => x.balance > 0.005).map(({ p, x }) => [p.number, p.supplierName, p.currency, round2(x.owed), round2(x.paid), round2(x.balance)])])
  }

  return (
    <>
      <PageHeader title="Rapports" />
      <FilterBar F={F} />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MoneyStat label="CA net" v={m.net} cur={r} />
        <MoneyStat label="Coût des marchandises vendues" v={m.cogs} cur={r} />
        <MoneyStat label="Bénéfice commercial réalisé" v={m.grossProfit} cur={r} signed />
        <MoneyStat label="Résultat après frais généraux" v={m.netResult} cur={r} signed />
        <MoneyStat label="Encaissements" v={m.cashIn} cur={r} />
        <MoneyStat label="Décaissements" v={m.cashOut} cur={r} />
        <MoneyStat label="Créances clients" v={m.receivables} cur={r} />
        <MoneyStat label="Dettes fournisseurs" v={m.payables} cur={r} />
      </div>
      <div className="card mb-4">
        <div className="mb-2 font-medium">Ventes par vendeur</div>
        {!bySeller.length ? <div className="text-sm text-neutral-500">Aucune vente sur cette période.</div> : (
          <div className="divide-y divide-line/70 text-sm">
            {bySeller.map((v) => (
              <div key={v.name} className="flex items-center justify-between gap-3 py-2">
                <div><div className="font-medium">{v.name}</div><div className="text-xs text-neutral-500">{v.count} vente(s) · panier moyen {money(v.ca / v.count, r)}</div></div>
                <div className="text-right"><div className="font-semibold">{money(v.ca, r)}</div>{showProfit && <div className="text-xs text-neutral-500">bénéfice {money(v.profit, r)}</div>}{showCom && <div className="text-xs font-medium text-gold-700">commission {money(commissionOf(com, v.ca, v.profit), r)}</div>}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showCom && com.target > 0 && (
        <div className="card mb-4">
          <div className="mb-2 font-medium">Objectif du mois ({month}) — {money(com.target, r)} par vendeur</div>
          {!monthStats.length ? <div className="text-sm text-neutral-500">Aucune vente ce mois-ci.</div> : monthStats.map((v) => {
            const pct = Math.min(100, Math.round((v.ca / com.target) * 100))
            return (
              <div key={v.name} className="mb-2 text-sm">
                <div className="flex justify-between"><span>{v.name}</span><span className="text-neutral-500">{money(v.ca, r)} · {Math.round((v.ca / com.target) * 100)} %</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100"><div className={'h-full rounded-full ' + (pct >= 100 ? 'bg-emerald-500' : 'bg-gold-500')} style={{ width: pct + '%' }} /></div>
              </div>
            )
          })}
        </div>
      )}
      {showProfit && (byProduct.products.length > 0) && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <div className="card"><div className="mb-2 font-medium">Bénéfice par produit (top 10)</div>
            <div className="divide-y divide-line/70 text-sm">{byProduct.products.map((x) => <div key={x.name} className="flex justify-between gap-3 py-1.5"><span className="min-w-0 truncate">{x.name}<span className="text-xs text-neutral-500"> × {x.qty}</span></span><span className={'shrink-0 font-medium ' + (x.profit < 0 ? 'text-blush-600' : '')}>{money(x.profit, r)}</span></div>)}</div></div>
          <div className="card"><div className="mb-2 font-medium">Bénéfice par catégorie</div>
            <div className="divide-y divide-line/70 text-sm">{byProduct.categories.map((x) => <div key={x.name} className="flex justify-between gap-3 py-1.5"><span className="min-w-0 truncate">{x.name}<span className="text-xs text-neutral-500"> × {x.qty}</span></span><span className={'shrink-0 font-medium ' + (x.profit < 0 ? 'text-blush-600' : '')}>{money(x.profit, r)}</span></div>)}</div></div>
        </div>
      )}
      {canExport ? (
        <div className="card space-y-2">
          <div className="font-medium">Exportations (CSV — s'ouvre directement dans Excel)</div>
          <div className="flex flex-wrap gap-2">
            {[['ventes', 'Ventes'], ['lignes', 'Lignes de vente & bénéfices'], ['projets', 'Projets'], ['depenses', 'Dépenses'], ['creances', 'Créances clients'], ['dettes', 'Dettes fournisseurs']].map(([k, l]) => <button key={k} className="btn-ghost" onClick={exports[k]}>⬇ {l}</button>)}
          </div>
          <p className="text-xs text-neutral-500">Pour un PDF : ouvrez une vente puis « Facture » ou « Reçu » et choisissez « Enregistrer au format PDF » dans la fenêtre d'impression.</p>
        </div>
      ) : <div className="text-sm text-neutral-500">Vous n'avez pas l'autorisation d'exporter.</div>}
      <p className="mt-3 text-xs text-neutral-500">Principes : le chiffre d'affaires n'est pas confondu avec les encaissements ; le bénéfice prévisionnel est séparé du bénéfice réalisé ; les frais de projet passent par le coût de revient (jamais comptés deux fois).</p>
    </>
  )
}
