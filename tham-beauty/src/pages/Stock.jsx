import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { arrayUnion } from 'firebase/firestore'
import { useApp } from '../lib/store.jsx'
import { convert, itemStock, round2 } from '../lib/calc.js'
import { downloadCSV, money, nowIso, today, uid } from '../lib/util.js'
import Icon from '../components/Icon.jsx'
import { Badge, Empty, Input, Modal, Notice, NumberInput, PageHeader, Select, Table } from '../components/ui.jsx'

export const STOCK_PROJECT_ID = 'stock-direct'

export default function Stock() {
  const app = useApp()
  const [q, setQ] = useState('')
  const [only, setOnly] = useState('')
  const [params, setParams] = useSearchParams()
  const addId = params.get('add')
  const [entry, setEntry] = useState(!!addId)
  const closeEntry = () => { setEntry(false); if (addId) setParams({}, { replace: true }) }
  const showMoney = app.can('finance.read')
  const canAdd = app.can('stock.write') || app.can('projects.write')
  const canSell = app.can('sales.write')
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
      if (st.remaining > 0) r.parts.push({ number: p.number, remaining: st.remaining, link: `${p.id}|${it.id}` })
    }))
    return Object.values(g).filter((r) => (r.label + (r.sku || '')).toLowerCase().includes(q.toLowerCase()) && (!only || (only === 'rupture' ? r.remaining <= 0 : only === 'faible' ? r.remaining > 0 && r.remaining <= low : r.remaining > 0)))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [app.D, app.costing, q, only, low])

  const totalValue = rows.reduce((s, r) => s + r.value, 0)
  const exportCsv = () => downloadCSV('stock.csv', [['Article', 'SKU', 'Reçu', 'Vendu', 'Retourné', 'Perdu', 'Restant', 'Coût moyen pondéré', 'Valeur'], ...rows.map((r) => [r.label, r.sku, r.received, r.sold, r.returned, r.lost, r.remaining, r.remaining ? round2(r.value / r.remaining) : 0, round2(r.value)])])

  return (
    <>
      <PageHeader title="Stock" subtitle={showMoney ? `Valeur du stock affiché : ${money(totalValue, app.ref)}` : undefined}>
        {app.can('export') && <button className="btn-ghost" onClick={exportCsv}><Icon name="download" size={16} />CSV</button>}
        {canAdd && <button className="btn-gold" onClick={() => setEntry(true)}><Icon name="plus" size={16} />Entrée de stock</button>}
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-xs"><Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" /><input className="input !pl-10" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input !w-auto" value={only} onChange={(e) => setOnly(e.target.value)}>
          <option value="">Tout le stock</option><option value="dispo">Disponible</option><option value="faible">Stock faible (≤ {low})</option><option value="rupture">En rupture</option>
        </select>
      </div>
      {!rows.length ? (
        <Empty icon="layers">Aucun article en stock. Le stock se remplit à chaque <b>réception</b> d'un projet, ou avec une <b>Entrée de stock</b> directe.</Empty>
      ) : (
        <>
        <div className="space-y-2 sm:hidden">
          {rows.map((r) => (
            <div key={r.key} className="card !p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium leading-snug">{r.label}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">{[r.sku, ...r.parts.map((x) => `${x.number} : ${x.remaining}`)].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={'text-2xl font-semibold leading-none ' + (r.remaining <= 0 ? 'text-blush-600' : '')}>{r.remaining}</div>
                  <div className="mt-1 text-[11px] text-neutral-500">en stock</div>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-neutral-500">Reçu {r.received} · Vendu {r.sold}{r.returned > 0 ? ` · Retourné ${r.returned}` : ''}{r.lost > 0 ? ` · Perdu ${r.lost}` : ''}{showMoney && r.remaining > 0 ? ` · ${money(r.value, app.ref)}` : ''}</div>
                <div className="flex items-center gap-2">
                  {r.remaining <= 0 ? <Badge tone="red">Rupture</Badge> : r.remaining <= low ? <Badge tone="amber">Stock faible</Badge> : null}
                  {canSell && r.parts.length > 0 && <Link to={`/ventes/nouvelle?item=${encodeURIComponent(r.parts[0].link)}`} className="btn-primary btn-sm"><Icon name="cart" size={14} />Vendre</Link>}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="card hidden !p-2 sm:block">
          <Table head={['Article', 'Reçu', 'Vendu', 'Ret.', 'Perdu', 'Restant', ...(showMoney ? ['Coût moyen', 'Valeur'] : []), '']}>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="td font-medium">{r.label}<div className="text-xs font-normal text-neutral-500">{r.sku} {r.parts.length > 0 && `· ${r.parts.map((x) => `${x.number}: ${x.remaining}`).join(' · ')}`}</div></td>
                <td className="td">{r.received}</td><td className="td">{r.sold}</td><td className="td">{r.returned}</td><td className="td">{r.lost}</td>
                <td className="td">{r.remaining <= 0 ? <Badge tone="red">Rupture</Badge> : r.remaining <= low ? <Badge tone="amber">{r.remaining}</Badge> : <b>{r.remaining}</b>}</td>
                {showMoney && <td className="td">{r.remaining ? money(r.value / r.remaining, app.ref) : '—'}</td>}
                {showMoney && <td className="td">{money(r.value, app.ref)}</td>}
                <td className="td text-right">{canSell && r.parts.length > 0 && <Link to={`/ventes/nouvelle?item=${encodeURIComponent(r.parts[0].link)}`} className="btn-primary btn-sm"><Icon name="cart" size={14} />Vendre</Link>}</td>
              </tr>
            ))}
          </Table>
        </div>
        </>
      )}
      <p className="mt-3 text-xs text-neutral-500">Coût moyen pondéré = valeur du stock restant ÷ quantité restante, toutes réceptions confondues. Chaque vente garde le coût du projet d'origine.</p>
      {entry && <StockEntry onlyProduct={addId} onClose={closeEntry} />}
    </>
  )
}

// Entrée de stock directe : ajoute des articles dans le projet « Stock direct » (sans commande fournisseur)
function StockEntry({ onClose, onlyProduct }) {
  const app = useApp()
  const startOpts = []
  app.D.products.filter((x) => x.active !== false && (!onlyProduct || x.id === onlyProduct)).forEach((pr) => {
    if (pr.variants?.length) pr.variants.forEach((v) => startOpts.push({ pr, v }))
    else startOpts.push({ pr, v: null })
  })
  const first = onlyProduct && startOpts.length ? startOpts[0] : null
  const [f, setF] = useState({
    pick: first ? `${first.pr.id}|${first.v?.id || ''}` : '', label: first ? (first.v ? `${first.pr.name} — ${first.v.label}` : first.pr.name) : '',
    qty: '', cost: '', costCur: 'USD', price: first?.v?.price ? String(first.v.price) : '', priceCur: first?.v?.priceCurrency || 'USD'
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (v) => setF({ ...f, [k]: v })
  const opts = []
  app.D.products.filter((x) => x.active !== false && (!onlyProduct || x.id === onlyProduct)).forEach((pr) => {
    if (pr.variants?.length) pr.variants.forEach((v) => opts.push({ value: `${pr.id}|${v.id}`, label: `${pr.name} — ${v.label}` }))
    else opts.push({ value: `${pr.id}|`, label: pr.name })
  })
  function pick(val) {
    const [pid, vid] = val.split('|')
    const pr = app.D.products.find((x) => x.id === pid)
    const v = pr?.variants?.find((x) => x.id === vid)
    setF({ ...f, pick: val, label: pr ? (v ? `${pr.name} — ${v.label}` : pr.name) : f.label, price: v?.price ? String(v.price) : f.price, priceCur: v?.priceCurrency || f.priceCur })
  }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    const q = Number(f.qty); const cost = Number(f.cost)
    if (!f.label.trim()) return setErr('Choisissez un produit ou saisissez un libellé.')
    if (!(q > 0)) return setErr('Quantité invalide.')
    if (!(cost >= 0) || f.cost === '') return setErr('Indiquez le coût unitaire (0 si offert).')
    setBusy(true)
    try {
      const [pid, vid] = f.pick ? f.pick.split('|') : ['', '']
      const pr = app.D.products.find((x) => x.id === pid)
      const v = pr?.variants?.find((x) => x.id === vid)
      const existing = app.D.projects.find((p) => p.id === STOCK_PROJECT_ID)
      const cur = existing?.currency || 'USD'
      const unitCost = round2(convert(cost, f.costCur, cur, existing?.rate || app.rate))
      const item = { id: uid(), productId: pid || '', variantId: vid || '', label: f.label.trim(), sku: v?.sku || pr?.sku || '', qtyOrdered: q, qtyReceived: q, qtyLost: 0, unitCost, plannedPrice: Number(f.price) || 0, plannedCurrency: f.priceCur, manualShare: 0 }
      const by = app.profile?.name || ''
      const receipt = { id: uid(), date: today(), lines: [{ itemId: item.id, label: item.label, qty: q, lost: 0 }], note: 'Entrée de stock directe', by }
      const hist = { at: nowIso(), by, text: `Entrée de stock : ${item.label} × ${q} (coût ${cost} ${f.costCur})` }
      if (existing) {
        await app.save('projects', STOCK_PROJECT_ID, { items: [...(existing.items || []), item], receipts: arrayUnion(receipt), history: arrayUnion(hist) }, 'entrée de stock')
      } else {
        await app.save('projects', STOCK_PROJECT_ID, {
          number: 'STOCK-DIRECT', name: 'Stock direct (hors commande fournisseur)', status: 'vente', noSupplier: true, supplierId: '', supplierName: '',
          currency: 'USD', rate: app.rate, allocMethod: 'value', orderDate: today(), supplierDiscount: 0, notes: 'Articles ajoutés directement au stock (stock de départ, achat sur place…).',
          items: [item], receipts: [receipt], supplierPayments: [], history: [hist]
        }, 'entrée de stock')
      }
      if (!app.online) app.notify('Entrée enregistrée sur l’appareil — synchronisation au retour d’Internet.', 'warn')
      onClose()
    } catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="Entrée de stock" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Notice tone="blue">Pour du stock sans commande fournisseur (stock de départ, achat sur place). Pour une commande à un fournisseur, utilisez plutôt un <b>Projet</b> puis une réception.</Notice>
        <Select label="Produit / variante" value={f.pick} onChange={pick} placeholder="— choisir (ou saisir un libellé libre) —" options={opts} />
        <Input label="Libellé" value={f.label} onChange={(e) => set('label')(e.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Quantité" value={f.qty} onChange={set('qty')} required />
          <span />
          <NumberInput label="Coût unitaire" value={f.cost} onChange={set('cost')} required />
          <Select label="Devise du coût" value={f.costCur} onChange={set('costCur')} options={['USD', 'HTG']} />
          <NumberInput label="Prix de vente prévu" value={f.price} onChange={set('price')} />
          <Select label="Devise du prix" value={f.priceCur} onChange={set('priceCur')} options={['USD', 'HTG']} />
        </div>
        {f.costCur === 'HTG' && <p className="text-xs text-neutral-500">Le coût en HTG est converti en USD au taux actuel ({app.rate}) et gardé tel quel ensuite.</p>}
        {err && <Notice tone="red">{err}</Notice>}
        <button className="btn-gold w-full" disabled={busy}>{busy ? '…' : 'Ajouter au stock'}</button>
      </form>
    </Modal>
  )
}
