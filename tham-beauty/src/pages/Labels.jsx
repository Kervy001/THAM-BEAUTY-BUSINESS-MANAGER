import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { itemStock } from '../lib/calc.js'
import { codeOf, duplicateCodes, makeCode } from '../lib/codes.js'
import { LabelPages } from '../components/LabelSheet.jsx'
import Icon from '../components/Icon.jsx'
import { exportLabels } from '../lib/labelExport.js'
import { LABEL_FORMATS, getPrintPrefs, setPrintPrefs, labelSize, labelPageCss, labelOpts } from '../lib/printing.js'
import { Empty, Notice, PageHeader } from '../components/ui.jsx'

// Étiquettes imprimables : code-barres (Code 128) + code QR + nom + prix, prêtes à coller sur les produits.
export default function Labels() {
  const app = useApp()
  const [params] = useSearchParams()
  const pid = params.get('p')
  const projId = params.get('proj') // étiquettes d'un lot reçu : une par pièce reçue
  const [q, setQ] = useState('')
  const [copies, setCopies] = useState(1)
  const [mode, setMode] = useState(projId ? 'lot' : 'copies') // copies | stock | lot
  const byStock = mode === 'stock'
  const [show, setShow] = useState({ barcode: true, qr: true, price: true })
  const [sel, setSel] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState('')
  const [prefs, setPrefs] = useState(getPrintPrefs)
  const F = labelSize(prefs)
  const O = labelOpts(app.settings, prefs)
  const chooseFormat = (id) => setPrefs(setPrintPrefs({ label: id })) // le format choisi devient le format par défaut de cet appareil
  const chooseCustom = (k, v) => setPrefs(setPrintPrefs({ custom: { ...prefs.custom, [k]: v } }))

  useEffect(() => {
    const st = document.createElement('style')
    st.textContent = labelPageCss(F, prefs)
    document.head.appendChild(st)
    return () => st.remove()
  }, [F.id, F.w, F.h, F.sheet, prefs.rotate]) // eslint-disable-line react-hooks/exhaustive-deps

  const entries = useMemo(() => app.D.products.filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name)).flatMap((p) => (
    (p.variants || []).length
      ? p.variants.map((v) => ({ key: `${p.id}|${v.id}`, p, v, name: p.name, label: v.label, code: codeOf(v), price: v.price, cur: v.priceCurrency }))
      : [{ key: `${p.id}|`, p, v: null, name: p.name, label: '', code: codeOf(p), price: 0, cur: 'USD' }]
  )), [app.D.products])

  const stockOf = useMemo(() => {
    const m = {}
    app.D.projects.forEach((p) => (p.items || []).forEach((it) => {
      const k = `${it.productId || ''}|${it.variantId || ''}`
      m[k] = (m[k] || 0) + Math.max(0, itemStock(it, app.D.sales).remaining)
    }))
    return m
  }, [app.D.projects, app.D.sales])

  // Lot reçu : quantité reçue par produit/variante dans ce projet
  const lotCounts = useMemo(() => {
    const m = {}
    const p = projId ? app.D.projects.find((x) => x.id === projId) : null
    ;(p?.items || []).forEach((it) => { const k = `${it.productId || ''}|${it.variantId || ''}`; m[k] = (m[k] || 0) + (Number(it.qtyReceived) || 0) })
    return m
  }, [app.D.projects, projId])
  useEffect(() => { if (projId) setSel(new Set(entries.filter((e) => lotCounts[e.key] > 0).map((e) => e.key))) }, [projId, entries.length, Object.keys(lotCounts).length]) // eslint-disable-line react-hooks/exhaustive-deps
  const dups = useMemo(() => duplicateCodes(app.D.products), [app.D.products])
  // Sélection de départ : le produit demandé (lien depuis la page Produits)
  useEffect(() => { if (pid) setSel(new Set(entries.filter((e) => e.p.id === pid).map((e) => e.key))) }, [pid, entries.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = entries.filter((e) => (e.name + ' ' + e.label + ' ' + e.code).toLowerCase().includes(q.toLowerCase()))
  const chosen = entries.filter((e) => sel.has(e.key))
  const missing = chosen.filter((e) => !e.code)
  const labels = chosen.filter((e) => e.code).flatMap((e) => Array.from({ length: Math.max(0, mode === 'lot' ? lotCounts[e.key] || 0 : byStock ? stockOf[e.key] || 0 : copies) }, (_, i) => ({ ...e, n: i })))
  const toggle = (k) => setSel((o) => { const n = new Set(o); n.has(k) ? n.delete(k) : n.add(k); return n })

  // Enregistre les étiquettes en fichiers (1 étiquette = 1 PNG ; plusieurs = un ZIP ; PDF = une page par étiquette) pour les imprimer avec l'application de l'imprimante
  async function runExport(kind) {
    setExporting(kind)
    try {
      const n = await exportLabels(kind, labels, F, show, O, prefs)
      app.notify(`${n} étiquette${n > 1 ? 's' : ''} exportée${n > 1 ? 's' : ''} ✓`)
    } catch (ex) { app.notify(ex.message || 'Export impossible.', 'error') }
    setExporting('')
  }

  // Attribue un code automatique aux articles sélectionnés qui n'en ont pas encore
  async function assignCodes() {
    setBusy(true)
    try {
      const byP = {}
      missing.forEach((e) => { (byP[e.p.id] ||= []).push(e) })
      for (const list of Object.values(byP)) {
        const p = list[0].p
        if (p.variants?.length) {
          const ids = new Set(list.map((e) => e.v.id))
          await app.save('products', p.id, { variants: p.variants.map((v) => (ids.has(v.id) ? { ...v, barcode: makeCode() } : v)) }, 'codes-barres générés')
        } else await app.save('products', p.id, { barcode: makeCode() }, 'code-barres généré')
      }
      app.notify('Codes attribués ✓')
    } finally { setBusy(false) }
  }

  return (
    <>
      <div className="no-print mb-3 text-sm"><Link to="/produits" className="text-neutral-500 underline">← Produits</Link></div>
      <PageHeader title="Étiquettes code-barres & QR" subtitle="Le code utilisé est le code-barres du produit, sinon son SKU.">
        <button className="btn-gold no-print" disabled={!labels.length} onClick={() => window.print()}><Icon name="printer" size={16} />Imprimer ({labels.length})</button>
        <button className="btn-ghost no-print" disabled={!labels.length || !!exporting} onClick={() => runExport('png')}><Icon name="download" size={16} />{exporting === 'png' ? '…' : 'Image PNG'}</button>
        <button className="btn-ghost no-print" disabled={!labels.length || !!exporting} onClick={() => runExport('pdf')}><Icon name="download" size={16} />{exporting === 'pdf' ? '…' : 'PDF'}</button>
      </PageHeader>

      <div className="no-print space-y-3">
        <div className="card space-y-3">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
            <label className="block"><span className="label">Format d’étiquette (gardé par défaut sur cet appareil)</span>
              <select className="input" value={prefs.label} onChange={(e) => chooseFormat(e.target.value)}>{LABEL_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
            {prefs.label === 'custom' && <>
              <label className="block"><span className="label">Largeur (mm)</span><input className="input" type="number" min="15" max="210" value={prefs.custom?.w ?? 50} onChange={(e) => chooseCustom('w', e.target.value)} /></label>
              <label className="block"><span className="label">Hauteur (mm)</span><input className="input" type="number" min="10" max="300" value={prefs.custom?.h ?? 30} onChange={(e) => chooseCustom('h', e.target.value)} /></label>
            </>}
          </div>
          {<p className="text-xs text-neutral-500">Boutons « Image PNG » et « PDF » : enregistrez les étiquettes en fichiers (taille exacte {F.w} × {F.h} mm) pour les ouvrir dans l’application de votre imprimante. Pour imprimer ici : une étiquette par page. Dans la fenêtre d’impression : votre imprimante d’étiquettes, la même taille de papier, « Marges : aucune », « Échelle : 100 % ». Réglages avancés (type de papier, décalage, rotation, modèle d’étiquette) : <Link className="underline" to="/materiel">Scanner & imprimante</Link>.</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block"><span className="label">Étiquettes par article</span>
              <input className="input" type="number" min="1" max="200" value={copies} disabled={mode !== 'copies'} onChange={(e) => setCopies(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} /></label>
            <label className="block"><span className="label">Nombre d’étiquettes</span>
              <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}><option value="copies">Même nombre pour chaque article</option><option value="stock">Une par unité en stock</option>{projId && <option value="lot">Une par pièce reçue (ce lot)</option>}</select></label>
            {[['barcode', 'Code-barres'], ['qr', 'QR'], ['price', 'Prix']].map(([k, l]) => (
              <label key={k} className="flex items-end gap-2 pb-2.5 text-sm"><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />{l}</label>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input" placeholder="Rechercher un produit…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn-ghost shrink-0" onClick={() => setSel(new Set(shown.map((e) => e.key)))}>Tout</button>
            <button className="btn-ghost shrink-0" onClick={() => setSel(new Set())}>Aucun</button>
          </div>
          {!entries.length ? <Empty>Aucun produit. Créez d'abord vos produits.</Empty> : (
            <div className="max-h-64 divide-y divide-line/70 overflow-y-auto rounded-xl ring-1 ring-line">
              {shown.map((e) => (
                <label key={e.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <input type="checkbox" checked={sel.has(e.key)} onChange={() => toggle(e.key)} />
                  <span className="min-w-0 flex-1 truncate">{e.name}{e.label ? ` — ${e.label}` : ''}</span>
                  <span className={'shrink-0 text-xs ' + (e.code ? 'text-neutral-500' : 'text-blush-600')}>{e.code || 'sans code'}</span>
                </label>
              ))}
            </div>
          )}
          {dups.length > 0 && (
            <Notice tone="red">
              <b>{dups.length} code{dups.length > 1 ? 's' : ''} en double :</b> un même code sur plusieurs articles ferait vendre le mauvais produit au scan.
              <ul className="mt-1 list-disc pl-5 text-xs">{dups.slice(0, 5).map((d) => <li key={d.code}><b>{d.code}</b> : {d.names.join(' ; ')}</li>)}</ul>
            </Notice>
          )}
          {missing.length > 0 && (
            <Notice>
              {missing.length} article(s) sélectionné(s) n'ont ni SKU ni code-barres : ils ne seront pas imprimés.
              {app.can('products.write') && <div className="mt-2"><button className="btn-primary btn-sm" disabled={busy} onClick={assignCodes}>{busy ? '…' : 'Attribuer des codes automatiquement'}</button></div>}
            </Notice>
          )}
        </div>
      </div>

      {labels.length > 0 && (
        <div className="print-area mt-4" style={{ background: '#fff', borderRadius: 12 }}>
          <LabelPages labels={labels} show={show} prefs={prefs} F={F} o={O} />
        </div>
      )}
    </>
  )
}

