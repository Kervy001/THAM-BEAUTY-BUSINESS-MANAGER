import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { itemStock, round2 } from '../lib/calc.js'
import { downloadCSV, money } from '../lib/util.js'
import { Badge, Empty, MoneyStat, PageHeader, Table } from '../components/ui.jsx'

export default function Stock() {
  const app = useApp()
  const [q, setQ] = useState('')
  const [only, setOnly] = useState('')
  const showMoney = app.can('finance.read')
  const low = app.settings.lowStock ?? 3

  const rows = useMemo(() => {
    const g = {}
    app.D.projects.forEach((p) => (p.items || []).forEach((it) => {
      const st = itemStock(it, app.D.sales)
      if (st.received <= 0 && st.sold <= 0) return
      const key = `${it.productId || ''}|${it.variantId || ''}|${it.productId ? '' : it.label}`
      const c = app.costing[p.id]?.perItem?.[it.id]?.unitCostRef || 0
      const r = (g[key] ||= { key, label: it.label, sku: it.sku, received: 0, sold: 0, returned: 0, lost: 0, remaining: 0, value: 0, parts: [] })
      r.received += st.received; r.sold += st.sold; r.returned += st.returned; r.lost += st.lost; r.remaining += st.remaining
      r.value += st.remaining * c
      if (st.remaining > 0) r.parts.push(`${p.number}: ${st.remaining}`)
    }))
    return Object.values(g).filter((r) => r.label.toLowerCase().includes(q.toLowerCase()) && (!only || (only === 'rupture' ? r.remaining <= 0 : only === 'faible' ? r.remaining > 0 && r.remaining <= low : r.remaining > 0)))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [app.D, app.costing, q, only, low])

  const totalValue = rows.reduce((s, r) => s + r.value, 0)
  const exportCsv = () => downloadCSV('stock.csv', [['Article', 'SKU', 'Reçu', 'Vendu', 'Retourné', 'Perdu', 'Restant', 'Coût moyen pondéré', 'Valeur'], ...rows.map((r) => [r.label, r.sku, r.received, r.sold, r.returned, r.lost, r.remaining, r.remaining ? round2(r.value / r.remaining) : 0, round2(r.value)])])

  return (
    <>
      <PageHeader title="Stock">{app.can('export') && <button className="btn-ghost" onClick={exportCsv}>Exporter CSV</button>}</PageHeader>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input !w-56" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input !w-auto" value={only} onChange={(e) => setOnly(e.target.value)}>
          <option value="">Tout</option><option value="dispo">Disponible</option><option value="faible">Stock faible (≤ {low})</option><option value="rupture">En rupture</option>
        </select>
        {showMoney && <div className="ml-auto self-center text-sm">Valeur du stock : <b>{money(totalValue, app.ref)}</b></div>}
      </div>
      {!rows.length ? <Empty>Aucun article en stock. Le stock se remplit à chaque réception d'un projet.</Empty> : (
        <div className="card !p-2">
          <Table head={['Article', 'Reçu', 'Vendu', 'Ret.', 'Perdu', 'Restant', ...(showMoney ? ['Coût moyen pond.', 'Valeur'] : [])]}>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="td font-medium">{r.label}<div className="text-xs font-normal text-neutral-500">{r.sku} {r.parts.length > 0 && `· ${r.parts.join(' · ')}`}</div></td>
                <td className="td">{r.received}</td><td className="td">{r.sold}</td><td className="td">{r.returned}</td><td className="td">{r.lost}</td>
                <td className="td">{r.remaining <= 0 ? <Badge tone="red">Rupture</Badge> : r.remaining <= low ? <Badge tone="amber">{r.remaining}</Badge> : <b>{r.remaining}</b>}</td>
                {showMoney && <td className="td">{r.remaining ? money(r.value / r.remaining, app.ref) : '—'}</td>}
                {showMoney && <td className="td">{money(r.value, app.ref)}</td>}
              </tr>
            ))}
          </Table>
        </div>
      )}
      <p className="mt-3 text-xs text-neutral-500">Coût moyen pondéré = valeur du stock restant ÷ quantité restante, toutes réceptions confondues. Chaque vente garde le coût du projet d'origine.</p>
    </>
  )
}
