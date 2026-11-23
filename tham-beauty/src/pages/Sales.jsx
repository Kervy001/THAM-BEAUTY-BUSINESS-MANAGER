import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { arrayUnion } from 'firebase/firestore'
import { useApp } from '../lib/store.jsx'
import { convert, itemStock, itemStockAt, pctSub, round2, saleProfit, saleSummary, saleTotals } from '../lib/calc.js'
import { DELIVERY, PAY_STATUS, fdate, fdt, money, nowIso, sellerOf, today, uid } from '../lib/util.js'
import { Badge, Empty, Input, Modal, MoneyStat, Notice, NumberInput, NumInput, PageHeader, Select, Stat, Table, Textarea, payTone } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { receiptLogo } from '../components/Logo.jsx'
import CustomerPicker from '../components/CustomerPicker.jsx'
import CashChange, { changeFields, emptyChange } from '../components/CashChange.jsx'
import { saleTime } from '../lib/cashflow.js'
import { Barcode } from '../components/CodeImages.jsx'
import { barcodeRaster } from '../lib/escposLogo.js'
import PaymentModal from '../components/PaymentModal.jsx'
import Scanner from '../components/Scanner.jsx'
import { useWedgeScanner, wedgeNotify } from '../lib/wedge.js'
import { RECEIPT_FORMATS, getPrintPrefs, receiptCss, receiptWidth, setPrintPrefs } from '../lib/printing.js'
import { logoDots, logoRaster } from '../lib/escposLogo.js'
import { OS_LABEL, capabilities, chooseMethod, friendlyError, sendDirect, shareReceipt } from '../lib/printer.js'
import { colsFor, receiptToEscpos } from '../lib/escpos.js'
import { reminderMessage, saleMessage, waLink } from '../lib/whatsapp.js'
import { lookupCode, stockMatchesFor } from '../lib/codes.js'
import { allocateForSale, bundleCandidates } from '../lib/bundles.js'

// Articles réellement en stock (reçus et non épuisés), quel que soit le statut du projet (sauf archivé).
// `include` : identifiants d'articles à garder même à 0 en stock (articles déjà présents dans une vente à modifier).
export function stockOptionsOf(projects, sales, include, locId, firstLoc) {
  const o = []
  projects.filter((p) => p.status !== 'archive').forEach((p) => {
    ;(p.items || []).forEach((it) => {
      const rem = locId ? itemStockAt(it, sales, locId, firstLoc) : itemStock(it, sales).remaining
      if (rem > 0 || include?.has(it.id)) o.push({ value: `${p.id}|${it.id}`, label: it.label, lot: p.number, p, it, remaining: rem })
    })
  })
  return o.sort((a, b) => a.label.localeCompare(b.label))
}

// Scan du code-barres d'un reçu (douchette USB / Bluetooth ou caméra) → ouvre la vente correspondante
export function useOpenSaleByScan(app, nav) {
  const find = (code) => { const c = String(code || '').trim().toUpperCase(); return app.D.sales.find((x) => String(x.number || '').toUpperCase() === c) }
  return (code) => {
    const sale = find(code)
    if (!sale) return { ok: false, text: `Aucune vente avec le code ${code}` }
    nav(`/ventes/${sale.id}`)
    return { ok: true, text: `✓ Vente ${sale.number}` }
  }
}

export function Sales() {
  const app = useApp()
  const nav = useNavigate()
  const [scanSale, setScanSale] = useState(false)
  const openByScan = useOpenSaleByScan(app, nav)
  const [q, setQ] = useState('')
  const [ps, setPs] = useState('')
  const rows = useMemo(() => app.D.sales
    .map((s) => ({ s, r: saleSummary(s) }))
    .filter(({ s, r }) => (!ps || (ps === 'demande' ? s.deleteRequest?.status === 'pending' : ps === 'annule' ? s.status === 'annule' : s.status !== 'annule' && r.payStatus === ps)) && ((s.number || '') + (s.customerName || '') + sellerOf(s)).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.s.date || '').localeCompare(a.s.date || '') || (b.s.number || '').localeCompare(a.s.number || '')), [app.D.sales, q, ps])
  return (
    <>
      <PageHeader title="Ventes">
        <button type="button" className="btn-ghost" onClick={() => setScanSale(true)}><Icon name="scan" size={18} />Scanner un reçu</button>
        {app.can('sales.write') && <Link to="/ventes/nouvelle" className="btn-primary">+ Nouvelle vente</Link>}
      </PageHeader>
      {scanSale && <Scanner title="Scanner le code d’un reçu" onDetect={(c) => { const r = openByScan(c); if (r.ok) setScanSale(false); return r.text }} onClose={() => setScanSale(false)} />}
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input !w-56" placeholder="N°, client ou vendeur…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input !w-auto" value={ps} onChange={(e) => setPs(e.target.value)}>
          <option value="">Tous les paiements</option>
          {['impaye', 'partiel', 'paye', 'trop_percu'].map((k) => <option key={k} value={k}>{PAY_STATUS[k]}</option>)}
          <option value="annule">Annulées</option>
          {app.isAdmin && <option value="demande">Demandes de suppression</option>}
        </select>
      </div>
      {app.isAdmin && app.D.deleteRequests.length > 0 && ps !== 'demande' && (
        <button type="button" onClick={() => setPs('demande')} className="mb-3 flex w-full items-center gap-2 rounded-xl border border-blush-100 bg-blush-50 p-3 text-left text-sm text-blush-600">
          <Icon name="alert" size={16} /><span><b>{app.D.deleteRequests.length}</b> demande{app.D.deleteRequests.length > 1 ? 's' : ''} de suppression de vente à examiner</span>
        </button>
      )}
      {!rows.length ? <Empty>Aucune vente.</Empty> : (
        <div className="card !p-2">
          <Table head={['N°', 'Date', 'Client', 'Vendeur', 'Net', 'Payé', 'Solde', 'Statut']}>
            {rows.map(({ s, r }) => (
              <tr key={s.id} className={s.status === 'annule' ? 'opacity-50' : ''}>
                <td className="td"><Link className="font-medium underline" to={`/ventes/${s.id}`}>{s.number}</Link></td>
                <td className="td">{fdate(s.date)}</td><td className="td">{s.customerName}</td><td className="td text-neutral-500">{sellerOf(s)}</td>
                <td className="td">{money(r.netKept, s.currency)}</td><td className="td">{money(r.paid, s.currency)}</td><td className="td">{money(r.balance, s.currency)}</td>
                <td className="td">{s.status === 'annule' ? <Badge tone="red">Annulée</Badge> : <Badge tone={payTone(r.payStatus)}>{PAY_STATUS[r.payStatus]}</Badge>}{s.deleteRequest?.status === 'pending' && <div className="mt-1"><Badge tone="amber">Suppression demandée</Badge></div>}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </>
  )
}

export function NewSale() {
  const app = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const firstLoc = app.locations[0].id
  const [f, setF] = useState({ locationId: app.defaultLoc, customerId: '', customerName: '', date: today(), currency: 'USD', rate: String(app.rate), delivery: 'retire', globalType: 'fixed', globalValue: '', notes: '', feeAmount: '', feeCur: 'HTG', courierId: '', feeIn: true })
  const [lines, setLines] = useState([])
  const [chg, setChg] = useState(emptyChange())
  const [payAuto, setPayAuto] = useState(true)
  const [pay, setPay] = useState({ amount: '', currency: 'USD', rate: String(app.rate), method: 'Espèces' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')

  const stockOptions = useMemo(() => stockOptionsOf(app.D.projects, app.D.stockSales, undefined, app.multiLoc ? f.locationId : undefined, firstLoc), [app.D.projects, app.D.stockSales, app.multiLoc, f.locationId])
  const [scan, setScan] = useState(false)
  const linesRef = useRef([])
  const lastAdded = useRef('')
  // Après un ajout (liste ou scan), on fait défiler jusqu'à la ligne concernée dès que le scanner est fermé
  useEffect(() => {
    if (scan || !lastAdded.current) return
    const id = lastAdded.current
    lastAdded.current = ''
    setTimeout(() => document.getElementById(`line-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120)
  }, [lines, scan])

  const draft = { currency: f.currency, rate: Number(f.rate), globalDiscount: { type: f.globalType, value: app.can('discount.global') ? Number(f.globalValue) || 0 : 0 }, lines: lines.map((l) => ({ ...l, qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0, discount: { type: l.dType, value: Number(l.dValue) || 0 } })) }
  const t = saleTotals(draft)
  // Frais de livraison encaissés avec le paiement (convertis dans la devise du paiement) : ils comptent pour la monnaie à rendre, jamais pour la vente
  const feeInPay = f.delivery !== 'retire' && f.feeIn && Number(f.feeAmount) > 0 && Number(pay.amount) > 0 ? round2(convert(Number(f.feeAmount), f.feeCur, pay.currency, Number(pay.rate) || app.rate)) : 0
  const showCost = app.can('costs.read')

  // Prix de gros d'une ligne (défini sur la variante du produit), converti dans la devise de la vente
  function wholesaleOf(l) {
    const p = app.D.products.find((x) => x.id === l.productId)
    const v = p?.variants?.find((x) => x.id === l.variantId)
    const w = Number(v?.wholesalePrice)
    return w > 0 ? round2(convert(w, v.priceCurrency || 'USD', f.currency, f.rate)) : 0
  }
  function addLine(val) {
    const o = stockOptions.find((x) => x.value === val)
    if (!o) return
    lastAdded.current = o.it.id
    const price = o.it.plannedPrice ? round2(convert(o.it.plannedPrice, o.it.plannedCurrency || 'USD', f.currency, f.rate)) : ''
    setLines((ls) => {
      const same = ls.findIndex((l) => l.itemId === o.it.id)
      if (same >= 0) return ls.map((l, j) => (j === same ? { ...l, qty: String(Math.min(o.remaining, (Number(l.qty) || 0) + 1)) } : l))
      return [...ls, { id: uid(), baseP: Number(o.it.plannedPrice) || 0, baseC: o.it.plannedCurrency || 'USD', projectId: o.p.id, itemId: o.it.id, label: o.it.label, sku: o.it.sku || '', qty: '1', unitPrice: String(price), productId: o.it.productId || '', variantId: o.it.variantId || '', dType: 'fixed', dValue: '', max: o.remaining, projectNumber: o.p.number }]
    })
    setSearch('')
  }
  // Lien depuis la page Stock : /ventes/nouvelle?item=projet|article
  const wanted = params.get('item')
  useEffect(() => {
    if (wanted && stockOptions.some((x) => x.value === wanted) && !lines.length) addLine(wanted)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, stockOptions.length])

  // Conversion d'une boîte (vente en gros) : /ventes/nouvelle?boite=ID. Le prix de la boîte est réparti sur les articles ;
  // la vente passe ensuite par les mêmes contrôles que toute vente (stock, réductions, paiement).
  const boiteId = params.get('boite')
  const boite = boiteId ? app.D.bundles.find((b) => b.id === boiteId) : null
  const boiteDone = useRef(false)
  useEffect(() => {
    if (!boite || boiteDone.current || !stockOptions.length) return
    boiteDone.current = true
    if (boite.status === 'vendu') { setErr(`La boîte ${boite.number} a déjà été vendue.`); return }
    const rate = Number(f.rate) || app.rate
    const cands = bundleCandidates(app.D, app.costing, { currency: boite.currency, rate, ref: app.ref })
    const alloc = allocateForSale(boite.lines || [], cands, boite.price)
    const opts = Object.fromEntries(stockOptions.map((o) => [o.it.id, o]))
    const missing = []
    const next = []
    ;(boite.lines || []).forEach((bl) => {
      const a = alloc.find((x) => x.itemId === bl.itemId)
      const o = opts[bl.itemId]
      if (!a || !o) { missing.push(bl.label); return }
      if (a.qty > o.remaining) missing.push(`${bl.label} (stock ${o.remaining}/${a.qty})`)
      next.push({ id: uid(), projectId: o.p.id, itemId: o.it.id, label: o.it.label, sku: o.it.sku || '', qty: String(Math.min(a.qty, o.remaining)), unitPrice: String(a.unitPrice), productId: o.it.productId || '', variantId: o.it.variantId || '', dType: 'fixed', dValue: '', max: o.remaining, projectNumber: o.p.number })
    })
    setLines(next)
    setF((x) => ({ ...x, currency: boite.currency, customerId: boite.customerId || '', customerName: boite.customerName || '', notes: `Boîte ${boite.number}${boite.name ? ' — ' + boite.name : ''}` }))
    setPay((x) => ({ ...x, currency: boite.currency }))
    if (missing.length) setErr(`Stock insuffisant ou article indisponible : ${missing.join(', ')}. Corrigez la boîte ou ajustez les quantités.`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boite?.id, stockOptions.length])

  linesRef.current = lines
  // Scan d'un code-barres / QR : l'article est ajouté automatiquement (prix prévu, stock, lot) ; chaque nouveau scan = +1.
  function onScan(code) {
    const matches = stockMatchesFor(code, app.D.products, stockOptions)
    if (!matches.length) {
      const f = lookupCode(code, app.D.products)
      return { ok: false, text: f ? `${f.product.name}${f.variant ? ' — ' + f.variant.label : ''} : aucun stock disponible` : `Code inconnu : ${code}` }
    }
    const qtyOf = (o) => Number(linesRef.current.find((l) => l.itemId === o.it.id)?.qty) || 0
    const o = matches.find((x) => qtyOf(x) < x.remaining)
    if (!o) return { ok: false, text: `Stock épuisé pour « ${matches[0].label} » (${matches.reduce((t, x) => t + x.remaining, 0)} disponible)` }
    const q = qtyOf(o) + 1
    addLine(o.value)
    return { ok: true, text: `✓ ${o.label} — quantité ${q}` }
  }
  useWedgeScanner(wedgeNotify(app, onScan)) // scanner USB / Bluetooth / 2,4 GHz : l'article s'ajoute tout seul
  const setL = (i, k, v) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v, ...(k === 'unitPrice' ? { edited: true } : {}) } : l)))
  // Changement de devise ou de taux : les prix des articles suivent (prix prévu converti au taux de la vente ; prix saisis à la main convertis au taux)
  function applyBilling(cur, rateStr) {
    const oldCur = f.currency, oldRate = Number(f.rate) || 0, nr = Number(rateStr) || 0
    const conv = (v) => String(round2(convert(Number(v), oldCur, cur, oldRate)))
    setLines((ls) => ls.map((l) => {
      let unit = l.unitPrice
      if (!l.edited && l.baseP > 0) unit = String(round2(convert(l.baseP, l.baseC || 'USD', cur, nr)))
      else if (cur !== oldCur && unit !== '' && !Number.isNaN(Number(unit))) unit = conv(unit)
      const dv = cur !== oldCur && l.dType === 'fixed' && l.dValue !== '' && !Number.isNaN(Number(l.dValue)) ? conv(l.dValue) : l.dValue
      return { ...l, unitPrice: unit, dValue: dv }
    }))
    setF({ ...f, currency: cur, rate: rateStr, ...(cur !== oldCur && f.globalType === 'fixed' && f.globalValue !== '' ? { globalValue: conv(f.globalValue) } : {}) })
    setPay((x) => ({ ...x, currency: cur !== oldCur ? cur : x.currency, rate: x.rate === f.rate ? rateStr : x.rate, amount: cur !== oldCur && x.amount !== '' ? String(round2(convert(Number(x.amount), oldCur, cur, oldRate))) : x.amount }))
  }
  const matches = stockOptions.filter((o) => (o.label + ' ' + o.lot + ' ' + (o.it.sku || '')).toLowerCase().includes(search.toLowerCase()) || (search.length > 3 && stockMatchesFor(search, app.D.products, [o]).length > 0))

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (!lines.length) return setErr('Ajoutez au moins un article.')
    const used = {}
    for (const l of draft.lines) {
      if (!(l.qty > 0)) return setErr('Quantité invalide.')
      used[l.itemId] = (used[l.itemId] || 0) + l.qty
      const lim = lines.find((x) => x.itemId === l.itemId).max
      if (used[l.itemId] > lim) return setErr(`Stock insuffisant pour « ${l.label} » (disponible : ${lim}).`)
      if (l.unitPrice <= 0) return setErr('Prix unitaire requis.')
    }
    const pct = t.discountPct
    if (pct > app.settings.discountAuth && !app.can('discount.authorize')) return setErr(`Réduction de ${round2(pct)} % : dépasse la limite (${app.settings.discountAuth} %). Une autorisation est nécessaire.`)
    if (pct > app.settings.discountWarn && !window.confirm(`Attention : réduction de ${round2(pct)} % (limite d'avertissement ${app.settings.discountWarn} %). Continuer ?`)) return
    setBusy(true)
    try {
      const number = await app.nextNumber('VTE')
      const cust = app.D.customers.find((c) => c.id === f.customerId)
      const sale = {
        number, date: f.date, createdAtIso: nowIso(), customerId: f.customerId, customerName: cust?.name || f.customerName || 'Client de passage',
        currency: f.currency, rate: Number(f.rate), delivery: f.delivery, notes: f.notes, status: 'valide',
        locationId: f.locationId || app.defaultLoc,
        sellerId: app.authUser?.uid || '', sellerName: app.profile?.name || '',
        globalDiscount: { type: f.globalType, value: app.can('discount.global') ? Number(f.globalValue) || 0 : 0 },
        lines: draft.lines.map((l) => ({
          id: l.id, projectId: l.projectId, itemId: l.itemId, label: l.label, sku: l.sku, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, qtyReturned: 0,
          costSnapshot: app.costing[l.projectId]?.perItem?.[l.itemId]?.unitCostRef || 0
        })),
        ...(boite ? { bundleId: boite.id, bundleNumber: boite.number } : {}),
        payments: [], returns: [],
        ...(f.delivery !== 'retire' && (Number(f.feeAmount) > 0 || f.courierId) ? { deliveryFee: { amount: Number(f.feeAmount) || 0, currency: f.feeCur, courierId: f.courierId, courierName: (app.settings.couriers || []).find((c) => c.id === f.courierId)?.name || '' } } : {})
      }
      if (Number(pay.amount) > 0) {
        sale.payments.push({ id: uid(), type: 'payment', date: f.date, amount: Number(pay.amount), currency: pay.currency, rate: Number(pay.rate), method: pay.method, ...changeFields(chg, Number(pay.amount) + feeInPay, pay.currency, Number(pay.rate), pay.method), ...(feeInPay > 0 ? { feeIncluded: true } : {}), status: 'valide', by: app.profile?.name || '', at: nowIso() })
      }
      const id = await app.save('sales', null, sale, 'vente')
      if (boite) { try { await app.save('bundles', boite.id, { status: 'vendu', saleId: id, soldAt: nowIso() }, 'boîte vendue') } catch { /* la vente est enregistrée ; la boîte pourra être marquée à la main */ } }
      app.pushSaleNotification(sale, id, t.netKept) // alerte aux administrateurs
      if (!app.online) app.notify('Vente enregistrée sur l\u2019appareil — elle sera synchronisée au retour d\u2019Internet.', 'warn')
      nav(`/ventes/${id}${getPrintPrefs().autoReceipt ? '?print=recu' : ''}`, { replace: true })
    } catch (ex) { setErr(ex.message) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="mb-3 rounded-2xl border border-blush-200 bg-blush-50 px-4 py-2 text-sm text-blush-600"><b>Mode VENTE</b> — chaque scan <b>ajoute</b> l’article à cette vente.</div>
      <PageHeader title="Nouvelle vente" />
      <div className="card grid gap-3 sm:grid-cols-3">
        {app.multiLoc && (
          <Select label="Vendu depuis (boutique / dépôt)" value={f.locationId} disabled={app.myLocations.length < 2}
            onChange={(v) => { if (lines.length && !confirm('Changer de lieu vide le panier (le stock diffère d’un lieu à l’autre). Continuer ?')) return; setLines([]); setF({ ...f, locationId: v }) }}
            options={app.myLocations.map((l) => ({ value: l.id, label: l.name }))} />
        )}
        <CustomerPicker value={f.customerId} onChange={(v) => setF({ ...f, customerId: v })} />
        {!f.customerId && <Input label="Nom du client (facultatif)" value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} />}
        <Input label="Date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <Select label="Devise de facturation" value={f.currency} onChange={(v) => applyBilling(v, f.rate)} options={['USD', 'HTG']} />
        <NumberInput label="Taux de cette commande (HTG/USD)" value={f.rate} onChange={(v) => applyBilling(f.currency, v)} hint={`Taux général : ${app.rate}. Cette commande gardera son taux même si le taux général change.`} />
        <Select label="Livraison" value={f.delivery} onChange={(v) => setF({ ...f, delivery: v })} options={Object.entries(DELIVERY).map(([value, label]) => ({ value, label }))} />
        {f.delivery !== 'retire' && (
          <div className="col-span-full grid grid-cols-2 gap-3 rounded-xl bg-paper p-3 ring-1 ring-line sm:grid-cols-4">
            <NumberInput label="Frais de livraison" value={f.feeAmount} onChange={(v) => setF({ ...f, feeAmount: v })} hint="Encaissés à part : hors chiffre d’affaires." />
            <Select label="Devise des frais" value={f.feeCur} onChange={(v) => setF({ ...f, feeCur: v })} options={['HTG', 'USD']} />
            <Select label="Livreur" value={f.courierId} onChange={(v) => setF({ ...f, courierId: v })} placeholder="— choisir —" options={(app.settings.couriers || []).map((c) => ({ value: c.id, label: c.name }))} />
            <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={f.feeIn} onChange={(e) => setF({ ...f, feeIn: e.target.checked })} />Encaissés avec le paiement</label>
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-display text-base font-semibold">Articles</h3><span className="text-xs text-neutral-500">{stockOptions.length} article{stockOptions.length > 1 ? 's' : ''} en stock</span></div>
        {!stockOptions.length ? (
          <Notice>
            <b>Aucun article en stock pour le moment.</b> Le stock se remplit quand vous enregistrez une <b>réception</b> dans un projet, ou en ajoutant un <b>stock direct</b> (sans commande fournisseur).
            <div className="mt-2 flex flex-wrap gap-2"><Link to="/stock" className="btn-gold btn-sm">Ajouter du stock</Link><Link to="/projets" className="btn-ghost btn-sm">Voir les projets</Link></div>
          </Notice>
        ) : (
          <div>
            <div className="flex gap-2">
              <div className="relative flex-1"><Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input className="input !pl-10" placeholder="Rechercher un article en stock (nom, SKU, lot)…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <button type="button" className="btn-gold shrink-0" onClick={() => setScan(true)}><Icon name="scan" size={18} />Scanner</button>
            </div>
            <div className="mt-2 max-h-56 divide-y divide-line/70 overflow-y-auto rounded-xl ring-1 ring-line">
              {!matches.length && <div className="p-3 text-sm text-neutral-500">Aucun résultat.</div>}
              {matches.map((o) => (
                <button type="button" key={o.value} onClick={() => addLine(o.value)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-paper">
                  <span><span className="font-medium">{o.label}</span><span className="block text-xs text-neutral-500">Lot {o.lot}{o.it.sku ? ` · ${o.it.sku}` : ''}</span></span>
                  <span className="flex shrink-0 items-center gap-2"><Badge tone={o.remaining <= (app.settings.lowStock ?? 3) ? 'amber' : 'green'}>stock {o.remaining}</Badge>
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-gold-300"><Icon name="plus" size={14} /></span></span>
                </button>
              ))}
            </div>
          </div>
        )}
        {lines.map((l, i) => (
          <div key={l.id} id={`line-${l.itemId}`} className="scroll-mt-20 rounded-xl bg-paper p-3 ring-1 ring-line">
            <div className="mb-2 flex justify-between text-sm font-semibold"><span>{l.label} <span className="text-xs font-normal text-neutral-500">(lot {l.projectNumber}, dispo {l.max})</span></span><button type="button" className="text-blush-600" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Retirer"><Icon name="x" size={16} /></button></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <NumberInput label="Quantité" value={l.qty} onChange={(v) => setL(i, 'qty', v)} />
              <div>
                <NumberInput label={`Prix unitaire (${f.currency})`} value={l.unitPrice} onChange={(v) => setL(i, 'unitPrice', v)} />
                {(() => { const w = wholesaleOf(l); return w ? <button type="button" className="mt-1 rounded-lg bg-gold-100 px-2 py-1 text-xs font-medium text-gold-700 ring-1 ring-gold-300" onClick={() => setL(i, 'unitPrice', String(w))}>Prix de gros : {money(w, f.currency)}</button> : null })()}
              </div>
              <Select label="Réduction / unité" value={l.dType} onChange={(v) => setL(i, 'dType', v)} options={[{ value: 'fixed', label: `Montant (${f.currency})` }, { value: 'percent', label: 'Pourcentage (%)' }]} />
              <NumberInput label="Valeur" value={l.dValue} onChange={(v) => setL(i, 'dValue', v)} />
            </div>
            {showCost && app.costing[l.projectId]?.perItem?.[l.itemId] && <div className="mt-1.5 text-xs text-neutral-500">Coût de revient : {money(app.costing[l.projectId].perItem[l.itemId].unitCostRef, app.ref)} / unité</div>}
          </div>
        ))}
      </div>

      <div className="card space-y-3">
        {app.can('discount.global') && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Select label="Réduction globale" value={f.globalType} onChange={(v) => setF({ ...f, globalType: v })} options={[{ value: 'fixed', label: `Montant (${f.currency})` }, { value: 'percent', label: 'Pourcentage (%)' }]} />
            <NumberInput label="Valeur" value={f.globalValue} onChange={(v) => setF({ ...f, globalValue: v })} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Montant brut" value={money(t.gross, f.currency)} />
          <Stat label="Réductions" value={money(t.totalDiscount, f.currency)} sub={`${round2(t.discountPct)} %`} />
          <Stat label="Net à payer" value={money(t.net, f.currency)} />
        </div>
        {t.discountPct > app.settings.discountWarn && <Notice>Réduction de {round2(t.discountPct)} % : au-dessus de la limite d'avertissement ({app.settings.discountWarn} %).</Notice>}
      </div>

      {app.can('sales.pay') && (
        <div className="card">
          <div className="mb-3 font-display text-base font-semibold">Paiement reçu maintenant (facultatif)</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NumberInput label="Montant" value={pay.amount} onChange={(v) => { setPayAuto(false); setPay({ ...pay, amount: v }) }} />
            <Select label="Devise" value={pay.currency} onChange={(v) => setPay({ ...pay, currency: v })} options={['USD', 'HTG']} />
            <NumberInput label="Taux du paiement" value={pay.rate} onChange={(v) => setPay({ ...pay, rate: v })} />
            <Select label="Moyen" value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} options={['Espèces', 'MonCash', 'NatCash', 'Virement', 'Chèque', 'Carte', 'Autre']} />
          </div>
          {pay.method === 'Espèces' && (
            <div className="mt-3">
              <CashChange value={chg} onChange={(v) => {
                setChg(v)
                const tn = Number(v.tendered) || 0
                if (payAuto && tn > 0) { const due = round2(convert(t.net, f.currency, pay.currency, Number(pay.rate) || app.rate)); setPay({ ...pay, amount: String(Math.max(0, Math.min(round2(tn - feeInPay), due))) }) }
              }} amount={(Number(pay.amount) || 0) + feeInPay} currency={pay.currency} rate={Number(pay.rate) || app.rate} />
              {feeInPay > 0 && <div className="mt-1 text-xs text-neutral-500">Frais de livraison inclus dans le montant remis : {money(feeInPay, pay.currency)}.</div>}
            </div>
          )}
        </div>
      )}
      {err && <Notice tone="red">{err}</Notice>}
      <button className="btn-gold w-full sm:w-auto" disabled={busy}>{busy ? '…' : 'Valider la vente'}</button>
      {scan && <Scanner title="Scanner les articles" continuous onDetect={onScan} onClose={() => setScan(false)} />}
    </form>
  )
}

export function SaleDetail() {
  const { id } = useParams()
  const app = useApp()
  const [pay, setPay] = useState(null)
  const [ret, setRet] = useState(false)
  const [dlg, setDlg] = useState(null) // 'request' | 'delete' | 'approve' | 'refuse' | 'edit'
  const nav = useNavigate()
  const [doc, setDoc] = useState('facture')
  const [btBusy, setBtBusy] = useState(false)
  const [printFail, setPrintFail] = useState(null)
  const [feeDlg, setFeeDlg] = useState(false)
  // Format par défaut selon le document (Réglages → Logo & documents) ; le réglage propre à l'appareil (Matériel) passe devant pour le reçu
  const docFormat = (d) => (d === 'recu' ? getPrintPrefs().receipt || app.settings?.print?.recu || app.settings?.receipt?.format || 'a4' : app.settings?.print?.facture || 'a4')
  const manualFmt = useRef(false)
  const [fmt, setFmt] = useState(() => docFormat('facture'))
  const showDoc = (d) => { setDoc(d); if (!manualFmt.current) setFmt(docFormat(d)) }
  // Attend que le logo soit chargé avant d'ouvrir la fenêtre d'impression (sinon il manque sur le papier)
  const printSoon = () => setTimeout(async () => {
    const imgs = [...document.querySelectorAll('.print-area img')]
    await Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; setTimeout(ok, 2500) }))))
    window.print()
  }, 120)
  const [sp] = useSearchParams()
  const thermal = fmt === 'ticket' || fmt === 'ticket58'
  useEffect(() => {
    const st = document.createElement('style')
    st.textContent = receiptCss(fmt, getPrintPrefs())
    document.head.appendChild(st)
    return () => st.remove()
  }, [fmt])
  // Impression automatique du reçu juste après une vente (réglage « Matériel », propre à cet appareil)
  const autoPrinted = useRef(false)
  const hasSale = app.D.sales.some((x) => x.id === id)
  useEffect(() => {
    if (sp.get('print') !== 'recu' || !hasSale || autoPrinted.current) return
    autoPrinted.current = true
    showDoc('recu')
    const t = setTimeout(() => printSoon(), 500)
    return () => clearTimeout(t)
  }, [hasSale]) // eslint-disable-line react-hooks/exhaustive-deps
  const s = app.D.sales.find((x) => x.id === id)
  if (!s) return <Empty>Vente introuvable (chargement…). <Link className="underline" to="/ventes">Retour</Link></Empty>
  const r = saleSummary(s)
  const canPay = app.can('sales.pay')
  // Impression directe du reçu sur une imprimante thermique (ESC/POS) par Bluetooth ou câble USB, sans passer par la fenêtre d'impression
  // Impression intelligente du reçu : choisit le meilleur mode pour cet appareil, et propose des solutions si ça échoue
  async function printSmart(force, pick = false) {
    if (btBusy) return
    const P = getPrintPrefs()
    const caps = capabilities()
    const method = force || chooseMethod(P, caps)
    setPrintFail(null)
    if (method === 'dialog') { showDoc('recu'); printSoon(); return }
    const m = (x) => money(x, s.currency)
    const model = {
      company: { name: co.name, address: co.address, phone: co.phone }, docTitle: 'Reçu de paiement', number: s.number, date: fdate(s.date) + (saleTime(s) ? ' ' + saleTime(s) : ''), barcodeText: s.number, customer: s.customerName, seller: sellerOf(s),
      lines: r.lines.map((p) => ({ label: p.l.label, qty: p.qty, unit: m(p.l.unitPrice), total: m(p.net), disc: p.lineDisc + p.globalShare > 0 ? m(p.lineDisc + p.globalShare) : '', returned: p.l.qtyReturned > 0 ? p.l.qtyReturned : 0 })),
      totals: [['Montant brut', m(r.gross)], ...(r.totalDiscount > 0 ? [['Réductions', '-' + m(r.totalDiscount)]] : []), ['Net', m(r.net), true], ...(r.net !== r.netKept ? [['Après retours', m(r.netKept)]] : []), ['Payé', m(r.paid)], ['Solde', m(r.balance), true], ...(s.deliveryFee?.amount > 0 ? [['Livraison (à part)', money(s.deliveryFee.amount, s.deliveryFee.currency)]] : [])],
      payments: (s.payments || []).filter((p) => p.status !== 'annule').map((p) => `${fdate(p.date)} - ${p.type === 'refund' ? 'Remboursement' : 'Paiement'} ${money(p.amount, p.currency)} (${p.method})` + (p.tendered > 0 && p.change ? ` Reçu ${money(p.tendered, p.currency)}, monnaie rendue ${money(p.change.amount, p.change.currency)}` : '')),
      note: `Taux : 1 USD = ${s.rate} HTG`, footer: co.footer
    }
    const cols = Number(P.btCols) || colsFor(fmt === 'a4' ? 'ticket58' : fmt, receiptWidth(fmt, P))
    setBtBusy(true)
    try {
      if (method === 'share') {
        const how = await shareReceipt(model, { cols, logoUrl: rc.showLogo ? receiptLogo(app.settings) : '' })
        setPrintPrefs({ lastOk: 'share' })
        app.notify(how === 'partagé' ? 'Reçu partagé ✓' : 'Image du reçu téléchargée ✓')
      } else {
        let logo
        if (rc.showLogo) {
          try { logo = await logoRaster(receiptLogo(app.settings), { widthDots: logoDots(cols, rc.logoWidth) }) } catch { app.notify('Logo non imprimé (image illisible).', 'error') }
        }
        let barcode
        try { barcode = barcodeRaster(s.number, { widthDots: logoDots(cols, 300) }) } catch { barcode = null }
        await sendDirect(method, receiptToEscpos(model, { cols, accents: !!P.btAccents, cut: !!P.btCut, feed: Number(P.btFeed) || 0, logo, barcode }), { pick })
        setPrintPrefs({ lastOk: method })
        app.notify(method === 'rawbt' ? 'Reçu envoyé à RawBT ✓ (si rien ne sort : installez RawBT et associez l’imprimante)' : 'Reçu envoyé à l’imprimante ✓')
      }
    } catch (e) {
      if (e?.name === 'AbortError') { /* partage annulé : rien à signaler */ } else setPrintFail({ method, msg: friendlyError(method, e), caps })
    } finally { setBtBusy(false) }
  }
  const showProfit = app.can('finance.read')
  const pr = saleProfit(s, {}, app.costing, app.ref)
  const cancelled = s.status === 'annule'
  const co = app.settings.company
  const rc = app.settings.receipt

  async function addPayment(p) {
    await app.save('sales', s.id, { payments: arrayUnion(p) }, p.type === 'refund' ? 'remboursement' : 'paiement client')
  }
  async function cancelPayment(p) {
    const reason = window.prompt('Motif de l\'annulation (le paiement reste visible, barré) :')
    if (!reason) return
    await app.save('sales', s.id, { payments: s.payments.map((x) => (x.id === p.id ? { ...x, status: 'annule', cancelReason: reason } : x)) }, 'annulation paiement client')
  }
  async function cancelSale() {
    const reason = window.prompt('Motif de l\'annulation de la vente (les articles retournent en stock ; la vente reste archivée) :')
    if (!reason) return
    await app.save('sales', s.id, { status: 'annule', cancelReason: reason, cancelledAt: nowIso() }, 'annulation vente')
  }
  const dr = s.deleteRequest
  const afterTrash = () => { app.notify('Vente déplacée dans la corbeille (30 jours avant suppression définitive).'); nav('/ventes', { replace: true }) }
  async function setDelivery(v) { await app.save('sales', s.id, { delivery: v }, 'livraison') }

  return (
    <>
      <div className="no-print mb-3 text-sm"><Link to="/ventes" className="text-neutral-500 underline">← Ventes</Link></div>
      <PageHeader title={`Vente ${s.number}`}>
        <select className="input no-print !w-auto !py-2" value={fmt} onChange={(e) => { manualFmt.current = true; setFmt(e.target.value) }} aria-label="Format du document">
          {RECEIPT_FORMATS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <button className="btn-ghost no-print" onClick={() => { showDoc('facture'); printSoon() }}><Icon name="printer" size={16} />Facture</button>
        <button className="btn-primary no-print" disabled={btBusy} onClick={() => printSmart()}><Icon name="printer" size={16} />{btBusy ? 'Envoi…' : 'Imprimer le reçu'}</button>
        <details className="no-print relative">
          <summary className="btn-ghost cursor-pointer list-none">Autres modes ▾</summary>
          <div className="absolute right-0 z-30 mt-1 flex w-60 flex-col gap-1 rounded-xl border bg-white p-2 shadow-lg dark:bg-neutral-900">
            <button className="btn-ghost btn-sm justify-start" onClick={() => printSmart('dialog')}>Fenêtre d’impression</button>
            <button className="btn-ghost btn-sm justify-start" onClick={() => printSmart('usb', true)}>Câble USB (choisir l’imprimante)</button>
            <button className="btn-ghost btn-sm justify-start" onClick={() => printSmart('bt', true)}>Bluetooth (choisir l’imprimante)</button>
            <button className="btn-ghost btn-sm justify-start" onClick={() => printSmart('rawbt')}>RawBT (Android)</button>
            <button className="btn-ghost btn-sm justify-start" onClick={() => printSmart('share')}>Partager en image</button>
          </div>
        </details>
        <Link className="btn-ghost no-print" to={`/ventes/${s.id}/colis`}><Icon name="package" size={16} />Étiquette colis</Link>
        <a className="btn-gold no-print" target="_blank" rel="noopener noreferrer" aria-label="Envoyer par WhatsApp"
          href={waLink(app.D.customers.find((c) => c.id === s.customerId)?.phone, saleMessage(s, r, app.settings.company, 'facture'), app.settings.whatsappCC)}>WhatsApp</a>
      </PageHeader>
      {printFail && (
        <div className="no-print mb-3"><Notice tone="red">
          <div className="font-medium">L’impression n’a pas abouti ({printFail.caps ? OS_LABEL[printFail.caps.os] : ''})</div>
          <div className="mb-2 text-sm">{printFail.msg}</div>
          <div className="flex flex-wrap gap-2">
            {(printFail.method === 'usb' || printFail.method === 'bt') && <button className="btn-gold btn-sm" onClick={() => printSmart(printFail.method, true)}>Choisir l’imprimante et réessayer</button>}
            {printFail.caps?.usb && printFail.method !== 'usb' && <button className="btn-ghost btn-sm" onClick={() => printSmart('usb', true)}>Essayer par USB</button>}
            {printFail.caps?.bt && printFail.method !== 'bt' && <button className="btn-ghost btn-sm" onClick={() => printSmart('bt', true)}>Essayer par Bluetooth</button>}
            {printFail.caps?.rawbt && printFail.method !== 'rawbt' && <button className="btn-ghost btn-sm" onClick={() => printSmart('rawbt')}>Essayer avec RawBT</button>}
            <button className="btn-ghost btn-sm" onClick={() => printSmart('share')}>Partager en image</button>
            <button className="btn-ghost btn-sm" onClick={() => printSmart('dialog')}>Fenêtre d’impression</button>
          </div>
        </Notice></div>
      )}
      {cancelled && <div className="no-print mb-3"><Notice tone="red">Vente annulée le {fdate(s.cancelledAt)} — {s.cancelReason}</Notice></div>}
      {dr?.status === 'pending' && (
        <div className="no-print mb-3"><Notice tone="amber">
          <b>Suppression demandée</b> par {dr.by || '—'} le {fdate(dr.at)}{dr.reason ? ` — « ${dr.reason} »` : ''}.
          {app.isAdmin ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn-danger btn-sm" onClick={() => setDlg('approve')}>Autoriser (corbeille)</button>
              <button className="btn-ghost btn-sm" onClick={() => setDlg('refuse')}>Refuser</button>
            </div>
          ) : <div className="mt-1 text-xs text-neutral-600">En attente de l'autorisation de l'administrateur.</div>}
        </Notice></div>
      )}

      <div className="no-print mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Net" value={money(r.netKept, s.currency)} sub={`Taux ${s.rate}`} />
        <Stat label="Payé" value={money(r.paid, s.currency)} />
        <Stat label="Solde" value={money(r.balance, s.currency)} />
        <div className="card !p-3"><div className="text-xs text-neutral-500">Paiement</div><div className="mt-1"><Badge tone={payTone(r.payStatus)}>{PAY_STATUS[r.payStatus]}</Badge></div>
          <select className="input mt-2 !py-1 text-xs" value={s.delivery || 'retire'} onChange={(e) => setDelivery(e.target.value)} disabled={cancelled || !app.can('sales.write')}>{Object.entries(DELIVERY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      {!cancelled && (s.deliveryFee?.amount > 0 || s.deliveryFee?.courierId || s.delivery === 'a_livrer') && (
        <div className="card no-print mb-4 flex flex-wrap items-center justify-between gap-3 !p-3 text-sm">
          <div>
            <div className="text-xs text-neutral-500">Livraison (hors chiffre d’affaires)</div>
            <div><b>{s.deliveryFee?.amount > 0 ? money(s.deliveryFee.amount, s.deliveryFee.currency) : 'Pas de frais'}</b>{s.deliveryFee?.courierName ? ` · Livreur : ${s.deliveryFee.courierName}` : ' · livreur non choisi'}{s.deliveryFee?.remittedAt ? ` · remis au livreur le ${fdate(s.deliveryFee.remittedAt)}` : s.deliveryFee?.amount > 0 ? ' · à remettre au livreur' : ''}</div>
          </div>
          {app.can('sales.write') && <button className="btn-ghost btn-sm" onClick={() => setFeeDlg(true)}>Modifier</button>}
        </div>
      )}
      {feeDlg && <FeeDialog sale={s} onClose={() => setFeeDlg(false)} />}
      {showProfit && !cancelled && (
        <div className="no-print mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MoneyStat label="Coût des articles" v={pr.cogs} cur={app.ref} />
          <MoneyStat label="Bénéfice réalisé" v={pr.profit} cur={app.ref} signed sub={pctSub(pr.revenue, pr.cogs)} />
          <MoneyStat label="Écart de change (paiements)" v={r.fxUSD} cur="USD" signed />
        </div>
      )}

      <div className={'print-area card mb-4 ' + (thermal ? 'receipt-thermal ' : '') + (thermal ? (fmt === 'ticket58' ? 'mx-auto max-w-[230px] !p-2 text-[11px] [&_table]:min-w-0 [&_.td]:px-0.5 [&_.td]:py-1 [&_.th]:px-0.5' : 'mx-auto max-w-[340px] !p-3 text-[13px] [&_table]:min-w-0 [&_.td]:px-1 [&_.td]:py-1.5 [&_.th]:px-1') : '')}>
        <div className={'mb-4 border-b border-line pb-4 ' + (thermal ? 'text-center' : 'flex flex-wrap items-center justify-between gap-4')}>
          <div className={thermal ? 'flex flex-col items-center' : 'flex items-center gap-4'}>
            {rc.showLogo && <img src={receiptLogo(app.settings)} alt="" style={{ width: thermal ? Math.min(rc.logoWidth, 110) : rc.logoWidth, height: 'auto' }} />}
            <div><div className="font-display text-xl font-bold">{co.name || 'THAM BEAUTY'}</div><div className="text-xs text-neutral-600">{co.address} {co.phone && `· ${co.phone}`}</div></div>
          </div>
          <div className={'whitespace-nowrap ' + (thermal ? 'mt-2 text-sm' : 'text-right text-sm')}><div className="font-display text-lg font-semibold">{doc === 'recu' ? 'Reçu de paiement' : 'Facture'}</div><div>{s.number}</div><div>{fdate(s.date)}{saleTime(s) ? ' · ' + saleTime(s) : ''}</div></div>
        </div>
        <div className="mb-3 text-sm">Client : <b>{s.customerName}</b> <span className="text-neutral-500">· Vendeur : {sellerOf(s)}</span></div>
        <Table head={thermal ? ['Article', 'Qté × prix', ...(r.lines.some((p) => p.lineDisc + p.globalShare > 0) ? ['Réd.'] : []), 'Total'] : ['Article', 'Qté', 'Prix unit.', 'Réduction', 'Total']}>
          {r.lines.map((p) => (
            <tr key={p.l.id}>
              <td className="td">{p.l.label}{p.l.qtyReturned > 0 && <div className="text-xs text-red-600">retourné : {p.l.qtyReturned}</div>}</td>
              {thermal ? <td className="td whitespace-nowrap">{p.qty} × {money(p.l.unitPrice, s.currency)}</td> : <><td className="td">{p.qty}</td><td className="td">{money(p.l.unitPrice, s.currency)}</td></>}
              {(!thermal || r.lines.some((q) => q.lineDisc + q.globalShare > 0)) && <td className="td">{p.lineDisc + p.globalShare > 0 ? '-' + money(p.lineDisc + p.globalShare, s.currency) : '—'}</td>}
              <td className="td whitespace-nowrap">{money(p.net, s.currency)}</td>
            </tr>
          ))}
        </Table>
        <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>Montant brut</span><span>{money(r.gross, s.currency)}</span></div>
          {r.totalDiscount > 0 && <div className="flex justify-between"><span>Réductions</span><span>-{money(r.totalDiscount, s.currency)}</span></div>}
          <div className="flex justify-between border-t pt-1 font-semibold"><span>Net</span><span>{money(r.net, s.currency)}</span></div>
          {r.net !== r.netKept && <div className="flex justify-between"><span>Après retours</span><span>{money(r.netKept, s.currency)}</span></div>}
          <div className="flex justify-between"><span>Payé</span><span>{money(r.paid, s.currency)}</span></div>
          <div className="flex justify-between font-semibold"><span>Solde</span><span>{money(r.balance, s.currency)}</span></div>
          <div className="text-xs text-neutral-500">Taux de la commande : 1 USD = {s.rate} HTG</div>
          {s.deliveryFee?.amount > 0 && <div className="flex justify-between border-t border-dashed pt-1"><span>Livraison{s.deliveryFee.courierName ? ` (${s.deliveryFee.courierName})` : ''}</span><span>{money(s.deliveryFee.amount, s.deliveryFee.currency)}</span></div>}
          {s.deliveryFee?.amount > 0 && <div className="text-[10px] text-neutral-500">Frais de livraison encaissés à part (non inclus dans le net).</div>}
        </div>
        {doc === 'recu' && (s.payments || []).filter((p) => p.status !== 'annule').length > 0 && (
          <div className="mt-4 text-sm"><div className="mb-1 font-medium">Paiements</div>
            {s.payments.filter((p) => p.status !== 'annule').map((p) => <div key={p.id}>{fdate(p.date)} — {p.type === 'refund' ? 'Remboursement' : 'Paiement'} {money(p.amount, p.currency)} ({p.method}, taux {p.rate}){p.tendered > 0 && p.change && <div className="text-xs text-neutral-600">Reçu du client : {money(p.tendered, p.currency)} · Monnaie rendue : {money(p.change.amount, p.change.currency)}</div>}</div>)}
          </div>
        )}
        <div className="mt-6 text-center text-xs text-neutral-500">{co.footer}</div>
        <div className="mx-auto mt-3 max-w-[240px] text-center"><Barcode value={s.number} height={48} /><div className="text-[11px] tracking-widest">{s.number}</div></div>
      </div>

      <div className="no-print space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Paiements</h2>
          {canPay && !cancelled && <div className="flex gap-2"><button className="btn-primary btn-sm" onClick={() => setPay('payment')}>+ Paiement</button><button className="btn-ghost btn-sm" onClick={() => setPay('refund')}>Remboursement</button></div>}</div>
        {!(s.payments || []).length ? <Empty>Aucun paiement.</Empty> : (
          <div className="card !p-2"><Table head={['Date', 'Type', 'Montant', 'Crédité', 'Moyen', '']}>
            {s.payments.map((p) => (
              <tr key={p.id} className={p.status === 'annule' ? 'opacity-50 line-through' : ''}>
                <td className="td">{fdate(p.date)}</td><td className="td">{p.type === 'refund' ? 'Remboursement' : 'Paiement'}</td>
                <td className="td">{money(p.amount, p.currency)}<div className="text-xs text-neutral-500">taux {p.rate}</div></td>
                <td className="td">{money(p.currency === s.currency ? p.amount : convert(p.amount, p.currency, s.currency, p.rate), s.currency)}</td>
                <td className="td">{p.method}</td>
                <td className="td">{canPay && p.status !== 'annule' && !cancelled && <button className="btn-ghost btn-sm" onClick={() => cancelPayment(p)}>Annuler</button>}</td>
              </tr>
            ))}
          </Table></div>
        )}
        {!cancelled && (
          <div className="flex flex-wrap gap-2">
            {app.isAdmin && <button className="btn-gold" onClick={() => setDlg('edit')}><Icon name="scan" size={16} />Modifier les articles</button>}
            {(app.can('stock.write') || app.can('sales.write')) && <button className="btn-ghost" onClick={() => setRet(true)}>Enregistrer un retour</button>}
            {app.isAdmin && <button className="btn-danger" onClick={cancelSale}>Annuler la vente</button>}
          </div>
        )}
        {app.isAdmin ? (
          <div className="flex flex-wrap gap-2 border-t border-line/70 pt-3">
            <button className="btn-ghost !text-blush-600" onClick={() => setDlg('delete')}><Icon name="trash" size={16} />Supprimer la vente</button>
          </div>
        ) : (
          <p className="border-t border-line/70 pt-3 text-xs text-neutral-500">Une vente ne peut être modifiée ou supprimée que par l'administrateur. En cas d'erreur, contactez votre responsable.</p>
        )}
        {!!(s.edits || []).length && <div className="card text-sm"><b>Modifications après validation</b>{[...s.edits].reverse().map((x) => <div key={x.id} className="mt-1"><span className="text-xs text-neutral-500">{fdt(x.at)} · {x.by} —</span> {x.text}</div>)}</div>}
        {!!(s.returns || []).length && <div className="card text-sm"><b>Retours</b>{s.returns.map((x) => <div key={x.id}>{fdate(x.date)} — {x.lines.map((l) => `${l.label} ×${l.qty}`).join(', ')} {x.note && `(${x.note})`}</div>)}</div>}
      </div>

      {pay && <PaymentModal title={pay === 'refund' ? 'Remboursement' : 'Paiement client'} refund={pay === 'refund'} opCurrency={s.currency} opRate={s.rate} remaining={pay === 'refund' ? 0 : r.balance} onSave={addPayment} onClose={() => setPay(null)} />}
      {ret && <ReturnModal s={s} onClose={() => setRet(false)} />}
      {dlg === 'edit' && app.isAdmin && <EditSaleModal s={s} onClose={() => setDlg(null)} />}
      {dlg === 'delete' && (
        <ReasonModal title="Supprimer cette vente ?" confirmLabel="Mettre à la corbeille" danger
          note={`La vente ${s.number} sera déplacée dans la corbeille (restaurable pendant 30 jours). Ses articles retournent en stock et elle disparaît des chiffres.`}
          onConfirm={(reason) => app.trashSale(s, reason)} onClose={(done) => { setDlg(null); if (done) afterTrash() }} />
      )}
      {dlg === 'approve' && (
        <ReasonModal title="Autoriser la suppression ?" confirmLabel="Mettre à la corbeille" danger hideReason
          note={`La vente ${s.number} sera déplacée dans la corbeille (restaurable pendant 30 jours). Ses articles retournent en stock.`}
          onConfirm={() => app.trashSale(s, dr?.reason)} onClose={(done) => { setDlg(null); if (done) afterTrash() }} />
      )}
      {dlg === 'refuse' && (
        <ReasonModal title="Refuser la demande" confirmLabel="Refuser" placeholder="Explication (facultatif)"
          note="La vente est conservée. L'utilisateur verra que sa demande a été refusée."
          onConfirm={(note) => app.refuseSaleDeletion(s, note)} onClose={(done) => { setDlg(null); if (done) app.notify('Demande refusée.') }} />
      )}
    </>
  )
}

// Modification des articles d'une vente déjà validée (quantités, ajout par scan) : stock, totaux et solde se recalculent ; tout est tracé.
function EditSaleModal({ s, onClose }) {
  const app = useApp()
  const own = useMemo(() => new Set((s.lines || []).map((l) => l.itemId)), [s.id])
  const options = useMemo(() => stockOptionsOf(app.D.projects, app.D.stockSales, own, s.locationId, app.locations[0].id), [app.D.projects, app.D.stockSales, own, s.locationId])
  const origQty = Object.fromEntries((s.lines || []).map((l) => [l.id, Number(l.qty)]))
  const [lines, setLines] = useState(() => (s.lines || []).map((l) => ({ ...l, qty: String(l.qty) })))
  const [search, setSearch] = useState('')
  const [scan, setScan] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(lines)
  ref.current = lines
  const lastAdded = useRef('')
  useEffect(() => {
    if (scan || !lastAdded.current) return
    const id = lastAdded.current
    lastAdded.current = ''
    setTimeout(() => document.getElementById(`edit-line-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120)
  }, [lines, scan])
  const optOf = (itemId) => options.find((o) => o.it.id === itemId)
  // Maximum possible : quantité d'origine + ce qui reste en stock (le stock restant compte déjà cette vente)
  const maxOf = (l) => (l._new ? (optOf(l.itemId)?.remaining || 0) : origQty[l.id] + (optOf(l.itemId)?.remaining || 0))
  const minOf = (l) => (l._new ? 1 : Number(l.qtyReturned) || 0)
  const setQty = (i, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, qty: v } : l)))

  function add(o) {
    lastAdded.current = o.it.id
    const cur = ref.current.find((l) => l.itemId === o.it.id)
    if (cur) {
      const i = ref.current.indexOf(cur)
      const next = (Number(cur.qty) || 0) + 1
      if (next > maxOf(cur)) return { ok: false, text: `Stock insuffisant pour « ${o.label} » (maximum ${maxOf(cur)})` }
      setQty(i, String(next))
      return { ok: true, text: `✓ ${o.label} — quantité ${next}` }
    }
    if (o.remaining < 1) return { ok: false, text: `Stock épuisé pour « ${o.label} »` }
    const price = o.it.plannedPrice ? round2(convert(o.it.plannedPrice, o.it.plannedCurrency || 'USD', s.currency, s.rate)) : ''
    setLines((ls) => [...ls, { id: uid(), _new: true, projectId: o.p.id, itemId: o.it.id, label: o.it.label, sku: o.it.sku || '', qty: '1', unitPrice: String(price), discount: { type: 'fixed', value: 0 }, qtyReturned: 0 }])
    return { ok: true, text: `✓ ${o.label} ajouté` }
  }
  function onScan(code) {
    const matches = stockMatchesFor(code, app.D.products, options)
    if (!matches.length) {
      const f = lookupCode(code, app.D.products)
      return { ok: false, text: f ? `${f.product.name}${f.variant ? ' — ' + f.variant.label : ''} : aucun stock disponible` : `Code inconnu : ${code}` }
    }
    const o = matches.find((x) => { const c = ref.current.find((l) => l.itemId === x.it.id); return c ? (Number(c.qty) || 0) < maxOf(c) : x.remaining > 0 }) || matches[0]
    return add(o)
  }
  useWedgeScanner(wedgeNotify(app, onScan))
  const found = search.trim() ? options.filter((o) => o.remaining > 0 && (o.label + ' ' + o.lot + ' ' + (o.it.sku || '')).toLowerCase().includes(search.toLowerCase())).slice(0, 6) : []

  const draftLines = lines.map((l) => ({ ...l, qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0 }))
  const before = saleTotals(s)
  const after = saleTotals({ ...s, lines: draftLines })

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (!lines.length) return setErr('Une vente doit garder au moins un article.')
    const out = []
    const notes = []
    for (const l of lines) {
      const q = Number(l.qty)
      if (!(q > 0)) return setErr(`Quantité invalide pour « ${l.label} ».`)
      if (q < minOf(l)) return setErr(`« ${l.label} » : déjà ${l.qtyReturned} retourné(s), la quantité ne peut pas descendre sous ${minOf(l)}.`)
      if (q > maxOf(l)) return setErr(`Stock insuffisant pour « ${l.label} » (maximum ${maxOf(l)}).`)
      if (l._new && !(Number(l.unitPrice) > 0)) return setErr(`Prix unitaire requis pour « ${l.label} ».`)
      const clean = Object.fromEntries(Object.entries({ ...l, qty: q, unitPrice: Number(l.unitPrice) }).filter(([k]) => !k.startsWith('_')))
      if (l._new) { clean.costSnapshot = app.costing[l.projectId]?.perItem?.[l.itemId]?.unitCostRef || 0; notes.push(`+${q} ${l.label}`) }
      else if (q !== origQty[l.id]) notes.push(`${l.label} : ${origQty[l.id]} → ${q}`)
      out.push(clean)
    }
    s.lines.filter((l) => !lines.some((x) => x.id === l.id)).forEach((l) => notes.push(`−${l.label}`))
    if (!notes.length) return onClose()
    if (after.discountPct > app.settings.discountAuth && !app.can('discount.authorize')) return setErr(`Réduction de ${round2(after.discountPct)} % : dépasse la limite autorisée.`)
    setBusy(true)
    try {
      await app.save('sales', s.id, { lines: out, edits: arrayUnion({ id: uid(), at: nowIso(), by: app.profile?.name || '', text: notes.join(' ; ') }) }, 'modification des articles d’une vente')
      app.notify('Vente modifiée ✓')
      onClose()
    } catch (ex) { setErr(ex.message); setBusy(false) }
  }

  return (
    <>
      <Modal wide title={`Modifier la vente ${s.number}`} onClose={onClose}>
        <form onSubmit={submit} className="space-y-3">
          <Notice tone="blue">Changez les quantités ou ajoutez un article (recherche ou scan). Le stock, le net et le solde sont recalculés. Chaque modification est enregistrée dans la vente.</Notice>
          {lines.map((l, i) => (
            <div key={l.id} id={`edit-line-${l.itemId}`} className="scroll-mt-4 rounded-xl bg-paper p-3 ring-1 ring-line">
              <div className="mb-2 flex items-start justify-between gap-2 text-sm font-semibold">
                <span>{l.label}{l._new && <span className="ml-2 text-xs font-normal text-emerald-700">nouveau</span>}<span className="block text-xs font-normal text-neutral-500">{money(l.unitPrice, s.currency)} / unité · max {maxOf(l)}{l.qtyReturned > 0 ? ` · ${l.qtyReturned} retourné(s)` : ''}</span></span>
                {(l._new || !(l.qtyReturned > 0)) && lines.length > 1 && <button type="button" className="text-blush-600" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Retirer"><Icon name="x" size={16} /></button>}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="btn-ghost !px-3.5" onClick={() => setQty(i, String(Math.max(minOf(l), (Number(l.qty) || 0) - 1)))}>−</button>
                <NumInput className="input text-center" min={minOf(l)} max={maxOf(l)} value={l.qty} onChange={(v) => setQty(i, v)} />
                <button type="button" className="btn-ghost !px-3.5" onClick={() => setQty(i, String(Math.min(maxOf(l), (Number(l.qty) || 0) + 1)))}>+</button>
              </div>
              {l._new && <div className="mt-2"><NumberInput label={`Prix unitaire (${s.currency})`} value={l.unitPrice} onChange={(v) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unitPrice: v } : x)))} /></div>}
            </div>
          ))}
          <div className="flex gap-2">
            <input className="input" placeholder="Ajouter un article (nom, SKU…)" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button type="button" className="btn-gold shrink-0" onClick={() => setScan(true)}><Icon name="scan" size={18} />Scanner</button>
          </div>
          {found.length > 0 && (
            <div className="divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
              {found.map((o) => (
                <button type="button" key={o.value} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-paper" onClick={() => { const r = add(o); if (r.ok) setSearch(''); else setErr(r.text) }}>
                  <span><span className="font-medium">{o.label}</span><span className="block text-xs text-neutral-500">Lot {o.lot}</span></span>
                  <Badge tone="green">stock {o.remaining}</Badge>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="card !p-3"><div className="text-xs text-neutral-500">Net avant</div><div className="font-semibold">{money(before.netKept, s.currency)}</div></div>
            <div className="card !p-3"><div className="text-xs text-neutral-500">Net après</div><div className="font-semibold">{money(after.netKept, s.currency)}</div></div>
          </div>
          {err && <Notice tone="red">{err}</Notice>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : 'Enregistrer les modifications'}</button>
        </form>
      </Modal>
      {scan && <Scanner title="Scanner des articles" continuous onDetect={onScan} onClose={() => setScan(false)} />}
    </>
  )
}

function ReasonModal({ title, note, confirmLabel, danger, required, hideReason, placeholder, onConfirm, onClose }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (required && !reason.trim()) return setErr('Indiquez un motif.')
    setBusy(true)
    try { await onConfirm(reason.trim()); onClose(true) } catch (ex) { setErr(ex.code === 'permission-denied' ? 'Permission refusée.' : ex.message || 'Erreur'); setBusy(false) }
  }
  return (
    <Modal title={title} onClose={() => onClose(false)}>
      <form onSubmit={submit} className="space-y-3">
        {note && <p className="text-sm text-neutral-700">{note}</p>}
        {!hideReason && <Textarea label={required ? 'Motif' : 'Motif (facultatif)'} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} />}
        {err && <Notice tone="red">{err}</Notice>}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={() => onClose(false)}>Annuler</button>
          <button className={(danger ? 'btn-danger' : 'btn-primary') + ' flex-1'} disabled={busy}>{busy ? '…' : confirmLabel}</button>
        </div>
      </form>
    </Modal>
  )
}

function ReturnModal({ s, onClose }) {
  const app = useApp()
  const [qty, setQty] = useState({})
  const [note, setNote] = useState('')
  async function submit(e) {
    e.preventDefault()
    const lines = s.lines.map((l) => ({ lineId: l.id, label: l.label, qty: Number(qty[l.id]) || 0 })).filter((l) => l.qty > 0)
    for (const l of lines) {
      const line = s.lines.find((x) => x.id === l.lineId)
      if (l.qty > line.qty - (line.qtyReturned || 0)) return alert(`Retour trop grand pour « ${l.label} ».`)
    }
    if (!lines.length) return
    await app.save('sales', s.id, {
      lines: s.lines.map((l) => { const x = lines.find((y) => y.lineId === l.id); return x ? { ...l, qtyReturned: (l.qtyReturned || 0) + x.qty } : l }),
      returns: [...(s.returns || []), { id: uid(), date: today(), lines, note, by: app.profile?.name || '' }]
    }, 'retour client')
    onClose()
  }
  return (
    <Modal title="Retour d'articles" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {s.lines.map((l) => (
          <NumberInput key={l.id} label={`${l.label} — retournable : ${l.qty - (l.qtyReturned || 0)}`} value={qty[l.id] ?? ''} onChange={(v) => setQty({ ...qty, [l.id]: v })} />
        ))}
        <Input label="Motif" value={note} onChange={(e) => setNote(e.target.value)} />
        <Notice tone="blue">Les articles retournés reviennent en stock et le montant net de la vente diminue. Pensez à enregistrer un remboursement si vous rendez de l'argent.</Notice>
        <button className="btn-primary w-full">Enregistrer le retour</button>
      </form>
    </Modal>
  )
}


// Frais de livraison et livreur d'une vente (modifiable ; les frais ne comptent jamais dans le chiffre d'affaires)
function FeeDialog({ sale, onClose }) {
  const app = useApp()
  const d = sale.deliveryFee || {}
  const [f, setF] = useState({ amount: String(d.amount || ''), currency: d.currency || 'HTG', courierId: d.courierId || '', remitted: !!d.remittedAt })
  const [busy, setBusy] = useState(false)
  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const courier = (app.settings.couriers || []).find((c) => c.id === f.courierId)
      const deliveryFee = { amount: Number(f.amount) || 0, currency: f.currency, courierId: f.courierId, courierName: courier?.name || (f.courierId === d.courierId ? d.courierName || '' : ''), ...(f.remitted ? { remittedAt: d.remittedAt || today() } : {}) }
      await app.save('sales', sale.id, { deliveryFee }, 'frais de livraison')
      onClose()
    } finally { setBusy(false) }
  }
  return (
    <Modal title="Frais de livraison" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Montant" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
          <Select label="Devise" value={f.currency} onChange={(v) => setF({ ...f, currency: v })} options={['HTG', 'USD']} />
        </div>
        <Select label="Livreur" value={f.courierId} onChange={(v) => setF({ ...f, courierId: v })} placeholder="— aucun —" options={(app.settings.couriers || []).map((c) => ({ value: c.id, label: c.name }))} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.remitted} onChange={(e) => setF({ ...f, remitted: e.target.checked })} />Frais déjà remis au livreur</label>
        <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
      </form>
    </Modal>
  )
}
