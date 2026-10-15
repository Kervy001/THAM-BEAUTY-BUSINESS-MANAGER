import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../lib/store.jsx'
import { itemStock } from '../lib/calc.js'
import { codeOf, makeCode } from '../lib/codes.js'
import { money } from '../lib/util.js'
import { Barcode, QR } from '../components/CodeImages.jsx'
import Icon from '../components/Icon.jsx'
import { Empty, Notice, PageHeader } from '../components/ui.jsx'

// Étiquettes imprimables : code-barres (Code 128) + code QR + nom + prix, prêtes à coller sur les produits.
export default function Labels() {
  const app = useApp()
  const [params] = useSearchParams()
  const pid = params.get('p')
  const [q, setQ] = useState('')
  const [copies, setCopies] = useState(1)
  const [byStock, setByStock] = useState(false)
  const [show, setShow] = useState({ barcode: true, qr: true, price: true })
  const [sel, setSel] = useState(() => new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const st = document.createElement('style')
    st.textContent = '@page { size: A4; margin: 8mm; }'
    document.head.appendChild(st)
    return () => st.remove()
  }, [])

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

  // Sélection de départ : le produit demandé (lien depuis la page Produits)
  useEffect(() => { if (pid) setSel(new Set(entries.filter((e) => e.p.id === pid).map((e) => e.key))) }, [pid, entries.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = entries.filter((e) => (e.name + ' ' + e.label + ' ' + e.code).toLowerCase().includes(q.toLowerCase()))
  const chosen = entries.filter((e) => sel.has(e.key))
  const missing = chosen.filter((e) => !e.code)
  const labels = chosen.filter((e) => e.code).flatMap((e) => Array.from({ length: Math.max(0, byStock ? stockOf[e.key] || 0 : copies) }, (_, i) => ({ ...e, n: i })))
  const toggle = (k) => setSel((o) => { const n = new Set(o); n.has(k) ? n.delete(k) : n.add(k); return n })

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
      </PageHeader>

      <div className="no-print space-y-3">
        <div className="card space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block"><span className="label">Étiquettes par article</span>
              <input className="input" type="number" min="1" max="200" value={copies} disabled={byStock} onChange={(e) => setCopies(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} /></label>
            <label className="flex items-end gap-2 pb-2.5 text-sm"><input type="checkbox" checked={byStock} onChange={(e) => setByStock(e.target.checked)} />Une par unité en stock</label>
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
          {missing.length > 0 && (
            <Notice>
              {missing.length} article(s) sélectionné(s) n'ont ni SKU ni code-barres : ils ne seront pas imprimés.
              {app.can('products.write') && <div className="mt-2"><button className="btn-primary btn-sm" disabled={busy} onClick={assignCodes}>{busy ? '…' : 'Attribuer des codes automatiquement'}</button></div>}
            </Notice>
          )}
        </div>
      </div>

      {labels.length > 0 && (
        <div className="print-area mt-4" style={{ background: '#fff', padding: 8, borderRadius: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 56mm)', gap: '3mm', justifyContent: 'start' }}>
            {labels.map((l, i) => (
              <div key={l.key + i} style={{ width: '56mm', height: '34mm', border: '0.3mm dashed #999', borderRadius: '1.5mm', padding: '1.5mm', boxSizing: 'border-box', background: '#fff', color: '#000', display: 'flex', flexDirection: 'column', overflow: 'hidden', breakInside: 'avoid', fontFamily: 'Arial, sans-serif' }}>
                <div style={{ fontSize: '8.5pt', fontWeight: 700, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7.5pt', lineHeight: 1.2 }}>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.label}</span>
                  {show.price && Number(l.price) > 0 && <b>{money(l.price, l.cur)}</b>}
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1.5mm', minHeight: 0, marginTop: '0.5mm' }}>
                  {show.barcode && <div style={{ flex: 1, minWidth: 0 }}><Barcode value={l.code} height="13mm" /></div>}
                  {show.qr && <QR value={l.code} size="15mm" />}
                </div>
                <div style={{ fontSize: '6.5pt', textAlign: 'center', letterSpacing: '0.5pt' }}>{l.code}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
