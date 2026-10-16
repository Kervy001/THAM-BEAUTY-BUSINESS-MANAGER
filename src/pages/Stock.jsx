import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { arrayUnion } from 'firebase/firestore'
import { useApp } from '../lib/store.jsx'
import { convert, itemStock, itemStockAt, round2 } from '../lib/calc.js'
import { downloadCSV, money, nowIso, today, uid } from '../lib/util.js'
import Icon from '../components/Icon.jsx'
import { Badge, Empty, Input, Modal, Notice, NumberInput, PageHeader, PasswordConfirm, Select, Table } from '../components/ui.jsx'
import Scanner from '../components/Scanner.jsx'
import { lookupCode, normCode, codeOf } from '../lib/codes.js'

export const STOCK_PROJECT_ID = 'stock-direct'

export default function Stock() {
  const app = useApp()
  const [q, setQ] = useState('')
  const [only, setOnly] = useState('')
  const [params, setParams] = useSearchParams()
  const addId = params.get('add')
  const addVar = params.get('v')
  const [entry, setEntry] = useState(!!addId)
  const [scan, setScan] = useState(false)
  const [found, setFound] = useState(null)
  const [del, setDel] = useState(null)
  const [locFilter, setLocFilter] = useState('')
  const [transfer, setTransfer] = useState(false)
  const firstLoc = app.locations[0].id
  useEffect(() => { if (addId) setEntry(true) }, [addId])
  const closeEntry = () => { setEntry(false); if (addId) setParams({}, { replace: true }) }
  const isAdmin = app.isAdmin
  const showMoney = app.can('finance.read')
  const canAdd = app.can('stock.write') || app.can('projects.write')
  const canSell = app.can('sales.write')
  const low = app.settings.lowStock ?? 3

  const allRows = useMemo(() => {
    const g = {}
    app.D.projects.forEach((p) => (p.items || []).forEach((it) => {
      const st = itemStock(it, app.D.sales)
      if (st.received <= 0 && st.sold <= 0) return
      const key = `${it.productId || ''}|${it.variantId || ''}|${it.productId ? '' : it.label}`
      const c = app.costing[p.id]?.perItem?.[it.id]?.unitCostRef || 0
      const r = (g[key] ||= { byLoc: {}, key, label: it.label, sku: it.sku, productId: it.productId || '', variantId: it.variantId || '', received: 0, sold: 0, returned: 0, lost: 0, remaining: 0, value: 0, parts: [], lots: [] })
      app.locations.forEach((l) => { r.byLoc[l.id] = (r.byLoc[l.id] || 0) + itemStockAt(it, app.D.sales, l.id, firstLoc) })
      r.lots.push({ pid: p.id, itemId: it.id, number: p.number, received: st.received, sold: st.sold, remaining: st.remaining })
      r.received += st.received; r.sold += st.sold; r.returned += st.returned; r.lost += st.lost; r.remaining += st.remaining
      r.value += st.remaining * c
      if (st.remaining > 0) r.parts.push({ number: p.number, remaining: st.remaining, link: `${p.id}|${it.id}` })
    }))
    return Object.values(g)
  }, [app.D, app.costing, app.locations])
  // Vue par lieu : le « restant » devient le stock du lieu choisi
  const viewRows = useMemo(() => (locFilter ? allRows.map((r) => { const q = r.byLoc[locFilter] || 0; return { ...r, remaining: q, value: r.remaining ? (r.value * q) / r.remaining : 0 } }) : allRows), [allRows, locFilter])
  const rows = useMemo(() => viewRows.filter((r) => (r.label + (r.sku || '')).toLowerCase().includes(q.toLowerCase()) && (!only || (only === 'rupture' ? r.remaining <= 0 : only === 'faible' ? r.remaining > 0 && r.remaining <= low : r.remaining > 0)))
    .sort((a, b) => a.label.localeCompare(b.label)), [viewRows, q, only, low])

  // Résultat d'un scan : produit trouvé dans le catalogue et/ou lignes de stock correspondantes
  function onScan(code) {
    const f = lookupCode(code, app.D.products)
    const c = normCode(code)
    const matched = allRows.filter((r) => (f && r.productId === f.product.id && (f.variant ? r.variantId === f.variant.id : true)) || normCode(r.sku) === c)
    setFound({ code, f, matched })
    return { ok: true, text: 'Code lu' }
  }

  const totalValue = rows.reduce((s, r) => s + r.value, 0)
  const exportCsv = () => downloadCSV('stock.csv', [['Article', 'SKU', 'Reçu', 'Vendu', 'Retourné', 'Perdu', 'Restant', 'Coût moyen pondéré', 'Valeur'], ...rows.map((r) => [r.label, r.sku, r.received, r.sold, r.returned, r.lost, r.remaining, r.remaining ? round2(r.value / r.remaining) : 0, round2(r.value)])])

  return (
    <>
      <PageHeader title="Stock" subtitle={showMoney ? `Valeur du stock affiché : ${money(totalValue, app.ref)}` : undefined}>
        {app.can('export') && <button className="btn-ghost" onClick={exportCsv}><Icon name="download" size={16} />CSV</button>}
        {app.multiLoc && canAdd && <button className="btn-ghost" onClick={() => setTransfer(true)}><Icon name="swap" size={16} />Transférer</button>}
        <button className="btn-ghost" onClick={() => setScan(true)}><Icon name="scan" size={16} />Scanner</button>
        {canAdd && <button className="btn-gold" onClick={() => setEntry(true)}><Icon name="plus" size={16} />Entrée de stock</button>}
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-xs"><Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" /><input className="input !pl-10" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {app.multiLoc && <select className="input !w-auto" value={locFilter} onChange={(e) => setLocFilter(e.target.value)}><option value="">Tous les lieux</option>{app.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
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
                  {app.multiLoc && !locFilter && <div className="text-xs text-neutral-500">{app.locations.map((l) => `${l.name} : ${r.byLoc[l.id] || 0}`).join(' · ')}</div>}
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
                  {isAdmin && <button className="btn-ghost btn-sm !text-blush-600" onClick={() => setDel(r)} aria-label="Supprimer du stock"><Icon name="trash" size={14} /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="card hidden !p-2 sm:block">
          <Table head={['Article', 'Reçu', 'Vendu', 'Ret.', 'Perdu', 'Restant', ...(showMoney ? ['Coût moyen', 'Valeur'] : []), '']}>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="td font-medium">{r.label}{app.multiLoc && !locFilter && <div className="text-xs font-normal text-neutral-500">{app.locations.map((l) => `${l.name} : ${r.byLoc[l.id] || 0}`).join(' · ')}</div>}<div className="text-xs font-normal text-neutral-500">{r.sku} {r.parts.length > 0 && `· ${r.parts.map((x) => `${x.number}: ${x.remaining}`).join(' · ')}`}</div></td>
                <td className="td">{r.received}</td><td className="td">{r.sold}</td><td className="td">{r.returned}</td><td className="td">{r.lost}</td>
                <td className="td">{r.remaining <= 0 ? <Badge tone="red">Rupture</Badge> : r.remaining <= low ? <Badge tone="amber">{r.remaining}</Badge> : <b>{r.remaining}</b>}</td>
                {showMoney && <td className="td">{r.remaining ? money(r.value / r.remaining, app.ref) : '—'}</td>}
                {showMoney && <td className="td">{money(r.value, app.ref)}</td>}
                <td className="td whitespace-nowrap text-right">{canSell && r.parts.length > 0 && <Link to={`/ventes/nouvelle?item=${encodeURIComponent(r.parts[0].link)}`} className="btn-primary btn-sm"><Icon name="cart" size={14} />Vendre</Link>} {isAdmin && <button className="btn-ghost btn-sm !text-blush-600" onClick={() => setDel(r)} aria-label="Supprimer du stock"><Icon name="trash" size={14} /></button>}</td>
              </tr>
            ))}
          </Table>
        </div>
        </>
      )}
      <p className="mt-3 text-xs text-neutral-500">Coût moyen pondéré = valeur du stock restant ÷ quantité restante, toutes réceptions confondues. Chaque vente garde le coût du projet d'origine.</p>
      {entry && <StockEntry onlyProduct={addId} onlyVariant={addVar} onClose={closeEntry} />}
      {del && <DeleteStock row={del} onClose={() => setDel(null)} />}
      {transfer && <TransferModal rows={allRows} onClose={() => setTransfer(false)} />}
      {found && <ScanResult found={found} showMoney={showMoney} canSell={canSell} canAdd={canAdd} low={low} onScanAgain={() => { setFound(null); setScan(true) }} onClose={() => setFound(null)} />}
      {scan && <Scanner title="Scanner un produit" onDetect={onScan} onClose={() => setScan(false)} />}
    </>
  )
}

// Entrée de stock directe : ajoute des articles dans le projet « Stock direct » (sans commande fournisseur)
function StockEntry({ onClose, onlyProduct, onlyVariant }) {
  const app = useApp()
  const startOpts = []
  app.D.products.filter((x) => x.active !== false && (!onlyProduct || x.id === onlyProduct)).forEach((pr) => {
    if (pr.variants?.length) pr.variants.filter((v) => !onlyVariant || v.id === onlyVariant).forEach((v) => startOpts.push({ pr, v }))
    else startOpts.push({ pr, v: null })
  })
  const first = onlyProduct && startOpts.length ? startOpts[0] : null
  const [f, setF] = useState({
    locationId: (!app.isAdmin && app.profile?.locationId) || app.locations[0].id,
    pick: first ? `${first.pr.id}|${first.v?.id || ''}` : '', label: first ? (first.v ? `${first.pr.name} — ${first.v.label}` : first.pr.name) : '',
    qty: '', cost: '', costCur: 'USD', price: first?.v?.price ? String(first.v.price) : '', priceCur: first?.v?.priceCurrency || 'USD'
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [scanning, setScanning] = useState(false)
  const justScanned = useRef(false)
  const qtyRef = useRef(null)
  // Après un scan : on descend jusqu'à « Quantité » et on y place le curseur (le formulaire défile tout seul)
  useEffect(() => {
    if (scanning || !justScanned.current) return
    justScanned.current = false
    setTimeout(() => { qtyRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); qtyRef.current?.querySelector('input')?.focus({ preventScroll: true }) }, 150)
  }, [scanning])
  const set = (k) => (v) => setF({ ...f, [k]: v })
  const opts = []
  app.D.products.filter((x) => x.active !== false && (!onlyProduct || x.id === onlyProduct)).forEach((pr) => {
    if (pr.variants?.length) pr.variants.filter((v) => !onlyVariant || v.id === onlyVariant).forEach((v) => opts.push({ value: `${pr.id}|${v.id}`, label: `${pr.name} — ${v.label}` }))
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
      const item = { ...(app.multiLoc ? { locationId: f.locationId || app.locations[0].id } : {}), id: uid(), productId: pid || '', variantId: vid || '', label: f.label.trim(), sku: v?.sku || pr?.sku || '', qtyOrdered: q, qtyReceived: q, qtyLost: 0, unitCost, plannedPrice: Number(f.price) || 0, plannedCurrency: f.priceCur, manualShare: 0 }
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

  function onScanEntry(code) {
    const found = lookupCode(code, app.D.products)
    if (!found) return { ok: false, text: `Code inconnu : ${code}. Choisissez le produit dans la liste ou saisissez un libellé.` }
    if (found.product.variants?.length && !found.variant) return { ok: false, text: 'Ce code est celui du produit : scannez le code d’une variante.' }
    const val = `${found.product.id}|${found.variant?.id || ''}`
    if (!opts.some((o) => o.value === val)) return { ok: false, text: 'Ce produit n’est pas disponible ici (inactif ?).' }
    pick(val)
    justScanned.current = true
    return { ok: true, text: `✓ ${found.product.name}${found.variant ? ' — ' + found.variant.label : ''}` }
  }

  return (
    <>
    <Modal title="Entrée de stock" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Notice tone="blue">Pour du stock sans commande fournisseur (stock de départ, achat sur place). Pour une commande à un fournisseur, utilisez plutôt un <b>Projet</b> puis une réception.</Notice>
        <Select label="Produit / variante" value={f.pick} onChange={pick} placeholder="— choisir (ou saisir un libellé libre) —" options={opts} />
        <button type="button" className="btn-gold w-full" onClick={() => setScanning(true)}><Icon name="scan" size={16} />Scanner le produit</button>
        {app.multiLoc && <Select label="Reçu dans (boutique / dépôt)" value={f.locationId} onChange={(v) => setF({ ...f, locationId: v })} options={app.locations.map((l) => ({ value: l.id, label: l.name }))} />}
        <Input label="Libellé" value={f.label} onChange={(e) => set('label')(e.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          <div ref={qtyRef} className="scroll-mt-4"><NumberInput label="Quantité" value={f.qty} onChange={set('qty')} required /></div>
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
    {scanning && <Scanner title="Scanner le produit" onDetect={onScanEntry} onClose={() => setScanning(false)} />}
    </>
  )
}

// Suppression d'un produit du stock (administrateur) : choix des lots + code de l'administrateur → corbeille 30 jours
function DeleteStock({ row, onClose }) {
  const app = useApp()
  const keyOf = (l) => `${l.pid}|${l.itemId}`
  const [sel, setSel] = useState(() => new Set(row.lots.map(keyOf)))
  const chosen = row.lots.filter((l) => sel.has(keyOf(l)))
  const sold = chosen.reduce((s, l) => s + l.sold, 0)
  const toggle = (l) => setSel((o) => { const n = new Set(o); n.has(keyOf(l)) ? n.delete(keyOf(l)) : n.add(keyOf(l)); return n })
  return (
    <PasswordConfirm title="Supprimer du stock ?" confirmLabel="Mettre à la corbeille" askReason verify={app.verifyPassword}
      onConfirm={async (reason) => {
        if (!chosen.length) throw new Error('Cochez au moins un lot.')
        await app.trashItems(chosen.map((l) => ({ pid: l.pid, itemId: l.itemId })), reason)
      }}
      onClose={(done) => { onClose(); if (done) app.notify('Produit déplacé dans la corbeille (30 jours avant suppression définitive).') }}>
      <p><b>{row.label}</b> sera retiré du stock et des chiffres, et déplacé dans la <b>corbeille</b> (restaurable 30 jours).</p>
      <div className="mt-2 divide-y divide-line/70 rounded-xl ring-1 ring-line">
        {row.lots.map((l) => (
          <label key={keyOf(l)} className="flex items-center gap-3 px-3 py-2 text-sm">
            <input type="checkbox" checked={sel.has(keyOf(l))} onChange={() => toggle(l)} />
            <span className="flex-1">Lot {l.number}<span className="block text-xs text-neutral-500">reçu {l.received} · vendu {l.sold} · en stock {l.remaining}</span></span>
          </label>
        ))}
      </div>
      {sold > 0 && <p className="mt-2 rounded-xl bg-gold-100/60 p-2.5 text-xs">{sold} unité(s) déjà vendue(s) : les ventes restent intactes (historique conservé).</p>}
    </PasswordConfirm>
  )
}

// Fiche produit affichée après un scan dans la page Stock
function ScanResult({ found, showMoney, canSell, canAdd, low, onScanAgain, onClose }) {
  const app = useApp()
  const { code, f, matched } = found
  const total = matched.reduce((s, r) => s + r.remaining, 0)
  const unknown = !f && !matched.length
  const price = f?.variant?.price || f?.product?.price
  const priceCur = f?.variant?.priceCurrency || 'USD'
  const title = f ? `${f.product.name}${f.variant ? ' — ' + f.variant.label : ''}` : matched[0]?.label || 'Code inconnu'
  return (
    <Modal title={unknown ? 'Code inconnu' : 'Produit scanné'} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <div className="font-display text-lg font-semibold">{title}</div>
          <div className="text-xs text-neutral-500">Code : {code}{f && codeOf(f.variant || f.product) && codeOf(f.variant || f.product) !== code ? ` · ${codeOf(f.variant || f.product)}` : ''}</div>
        </div>
        {unknown ? (
          <Notice>Aucun produit ni article en stock ne correspond à ce code.</Notice>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="card !p-3"><div className="text-xs text-neutral-500">En stock</div><div className={'text-2xl font-semibold ' + (total <= 0 ? 'text-blush-600' : '')}>{total}</div>{total > 0 && total <= low && <Badge tone="amber">Stock faible</Badge>}</div>
            <div className="card !p-3"><div className="text-xs text-neutral-500">Prix habituel</div><div className="text-lg font-semibold">{Number(price) ? money(price, priceCur) : '—'}</div></div>
            {showMoney && matched.length > 0 && <div className="card col-span-2 !p-3"><div className="text-xs text-neutral-500">Valeur du stock</div><div className="font-semibold">{money(matched.reduce((s, r) => s + r.value, 0), app.ref)}</div></div>}
          </div>
        )}
        {matched.flatMap((r) => r.lots).filter((l) => l.remaining > 0).length > 0 && (
          <div className="text-xs text-neutral-500">Lots : {matched.flatMap((r) => r.lots).filter((l) => l.remaining > 0).map((l) => `${l.number} (${l.remaining})`).join(' · ')}</div>
        )}
        <div className="flex flex-wrap gap-2">
          {canSell && matched.some((r) => r.parts.length) && <Link to={`/ventes/nouvelle?item=${encodeURIComponent(matched.find((r) => r.parts.length).parts[0].link)}`} className="btn-primary flex-1"><Icon name="cart" size={16} />Vendre</Link>}
          {canAdd && f && <Link to={`/stock?add=${f.product.id}${f.variant ? `&v=${f.variant.id}` : ''}`} className="btn-gold flex-1" onClick={onClose}><Icon name="plus" size={16} />Ajouter au stock</Link>}
          {unknown && app.can('products.write') && <Link to={`/produits?newcode=${encodeURIComponent(code)}`} className="btn-gold flex-1">Créer un produit avec ce code</Link>}
          <button className="btn-ghost flex-1" onClick={onScanAgain}><Icon name="scan" size={16} />Scanner un autre</button>
        </div>
      </div>
    </Modal>
  )
}

// Transfert de stock entre deux lieux : la quantité est prélevée sur les lots du lieu d'origine (les plus anciens d'abord)
function TransferModal({ rows, onClose }) {
  const app = useApp()
  const firstLoc = app.locations[0].id
  const [key, setKey] = useState('')
  const [from, setFrom] = useState(firstLoc)
  const [to, setTo] = useState(app.locations[1]?.id || '')
  const [qty, setQty] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const row = rows.find((r) => r.key === key)
  const itemOf = (l) => app.D.projects.find((p) => p.id === l.pid)?.items?.find((i) => i.id === l.itemId)
  const avail = row ? row.byLoc[from] || 0 : 0

  async function submit(e) {
    e.preventDefault()
    setErr('')
    const q = Number(qty)
    if (!row) return setErr('Choisissez un article.')
    if (from === to) return setErr('Choisissez deux lieux différents.')
    if (!(q > 0) || q > avail) return setErr(`Quantité invalide (disponible à l'origine : ${avail}).`)
    setBusy(true)
    try {
      let left = q
      const byP = {}
      for (const l of row.lots) {
        if (left <= 0) break
        const it = itemOf(l)
        if (!it) continue
        const here = Math.min(left, Math.max(0, itemStockAt(it, app.D.sales, from, firstLoc)))
        if (here <= 0) continue
        left -= here
        ;(byP[l.pid] ||= []).push({ itemId: l.itemId, qty: here })
      }
      for (const [pid, moves] of Object.entries(byP)) {
        const p = app.D.projects.find((x) => x.id === pid)
        const items = p.items.map((it) => { const m = moves.find((x) => x.itemId === it.id); return m ? { ...it, transfers: [...(it.transfers || []), { id: uid(), from, to, qty: m.qty, at: nowIso(), by: app.profile?.name || '' }] } : it })
        await app.save('projects', pid, { items, history: arrayUnion({ at: nowIso(), by: app.profile?.name || '', text: `Transfert ${q} × ${row.label} : ${app.locations.find((l) => l.id === from)?.name} → ${app.locations.find((l) => l.id === to)?.name}` }) }, 'transfert de stock')
      }
      app.notify('Transfert enregistré ✓')
      onClose()
    } catch (ex) { setErr(ex.message); setBusy(false) }
  }
  return (
    <Modal title="Transférer du stock" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Select label="Article" value={key} onChange={setKey} placeholder="— choisir —" options={rows.filter((r) => r.remaining > 0).map((r) => ({ value: r.key, label: `${r.label} (${r.remaining})` }))} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="De" value={from} onChange={setFrom} options={app.locations.map((l) => ({ value: l.id, label: l.name }))} />
          <Select label="Vers" value={to} onChange={setTo} placeholder="— lieu —" options={app.locations.map((l) => ({ value: l.id, label: l.name }))} />
        </div>
        <NumberInput label={`Quantité${row ? ` (disponible : ${avail})` : ''}`} value={qty} onChange={setQty} required />
        {err && <Notice tone="red">{err}</Notice>}
        <button className="btn-gold w-full" disabled={busy}>{busy ? '…' : 'Transférer'}</button>
      </form>
    </Modal>
  )
}
