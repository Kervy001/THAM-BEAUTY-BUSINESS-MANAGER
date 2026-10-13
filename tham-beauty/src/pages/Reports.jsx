import { useMemo } from 'react'
import { useApp } from '../lib/store.jsx'
import { convert, inRange, purchaseSummary, projectStats, round2, saleSummary, saleProfit } from '../lib/calc.js'
import { computeMetrics } from '../lib/metrics.js'
import { downloadCSV, fdate, money, STATUS_PROJECT } from '../lib/util.js'
import { FilterBar, useFilters } from './Dashboard.jsx'
import { MoneyStat, PageHeader, Stat } from '../components/ui.jsx'

export default function Reports() {
  const app = useApp()
  const F = useFilters()
  const canExport = app.can('export')
  const r = app.ref
  const m = useMemo(() => computeMetrics({ D: app.D, costing: app.costing, ref: r, rate: app.rate, settings: app.settings }, { range: F.range, ...F.flt }), [app.D, app.costing, r, app.rate, app.settings, F.range, F.flt])

  const exports = {
    ventes: () => downloadCSV('ventes.csv', [['N°', 'Date', 'Client', 'Devise', 'Taux', 'Brut', 'Réductions', 'Net', 'Payé', 'Solde', 'Statut paiement', 'Statut'],
      ...app.D.sales.filter((s) => inRange(s.date, F.range)).map((s) => { const x = saleSummary(s); return [s.number, s.date, s.customerName, s.currency, s.rate, round2(x.gross), round2(x.totalDiscount), round2(x.netKept), round2(x.paid), round2(x.balance), x.payStatus, s.status] })]),
    lignes: () => downloadCSV('lignes-de-vente.csv', [['Vente', 'Date', 'Article', 'Projet', 'Qté', 'Prix unit.', 'Net ligne', `Coût (${r})`, `Bénéfice (${r})`],
      ...app.D.sales.filter((s) => s.status !== 'annule' && inRange(s.date, F.range)).flatMap((s) => (s.lines || []).map((l) => {
        const p = saleProfit(s, {}, app.costing, r, (x) => x.id === l.id)
        const pr = app.D.projects.find((q) => q.id === l.projectId)
        return [s.number, s.date, l.label, pr?.number, l.qty, l.unitPrice, round2(convert(p.revenue, r, s.currency, s.rate)), round2(p.cogs), round2(p.profit)]
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
