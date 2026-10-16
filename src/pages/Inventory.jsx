import { useMemo, useRef, useState } from 'react'
import { arrayUnion } from 'firebase/firestore'
import { useApp } from '../lib/store.jsx'
import { stockRows } from '../lib/stockRows.js'
import { lookupCode, normCode } from '../lib/codes.js'
import { fdt, money, nowIso, today, uid } from '../lib/util.js'
import Scanner from '../components/Scanner.jsx'
import Icon from '../components/Icon.jsx'
import { Badge, Empty, Modal, Notice, PageHeader, Select } from '../components/ui.jsx'

// Inventaire physique : on compte les articles (scan ou saisie), l'application montre les écarts avec le stock théorique,
// puis la validation corrige le stock (ajustements tracés) et garde un rapport.
export default function Inventory() {
  const app = useApp()
  const canApply = app.can('stock.write')
  const firstLoc = app.locations[0].id
  const [loc, setLoc] = useState((!app.isAdmin && app.profile?.locationId) || firstLoc)
  const draftKey = `tb-inv-${app.authUser?.uid}-${loc}`
  const read = () => { try { return JSON.parse(localStorage.getItem(draftKey) || '{}') } catch { return {} } }
  const [counts, setCountsRaw] = useState(read)
  const setCounts = (fn) => setCountsRaw((c) => { const n = typeof fn === 'function' ? fn(c) : fn; try { localStorage.setItem(draftKey, JSON.stringify(n)) } catch { /* brouillon non sauvegardé */ } return n })
  const [q, setQ] = useState('')
  const [onlyDiff, setOnlyDiff] = useState(false)
  const [scan, setScan] = useState(false)
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const rowsRef = useRef([])
  const countsRef = useRef({})
  countsRef.current = counts

  const rows = useMemo(() => stockRows(app.D, app.costing, loc, firstLoc), [app.D, app.costing, loc])
  rowsRef.current = rows
  const touched = rows.filter((r) => counts[r.key] !== undefined)
  const diffOf = (r) => (counts[r.key] === undefined ? null : Number(counts[r.key]) - r.expected)
  const withDiff = touched.filter((r) => diffOf(r) !== 0)
  const shown = rows.filter((r) => (r.label + ' ' + r.sku).toLowerCase().includes(q.toLowerCase()) && (!onlyDiff || (counts[r.key] !== undefined && diffOf(r) !== 0)))

  function changeLoc(v) {
    const next = (() => { try { return JSON.parse(localStorage.getItem(`tb-inv-${app.authUser?.uid}-${v}`) || '{}') } catch { return {} } })()
    setLoc(v); setCountsRaw(next)
  }
  const setCount = (key, v) => setCounts((c) => ({ ...c, [key]: v === '' ? undefined : Math.max(0, Number(v) || 0) }))
  const bump = (key, d) => setCounts((c) => ({ ...c, [key]: Math.max(0, (c[key] === undefined ? 0 : Number(c[key])) + d) }))

  function onScan(code) {
    const f = lookupCode(code, app.D.products)
    const c = normCode(code)
    if (f && f.product.variants?.length && !f.variant) return { ok: false, text: 'Code du produit sans variante : scannez le code de la variante.' }
    const r = rowsRef.current.find((x) => (f && x.productId === f.product.id && (!f.variant || x.variantId === f.variant.id)) || normCode(x.sku) === c)
    if (!r) return { ok: false, text: f ? `« ${f.product.name} » n'a aucun lot : faites d'abord une Entrée de stock.` : `Code inconnu : ${code}` }
    const n = (countsRef.current[r.key] === undefined ? 0 : Number(countsRef.current[r.key])) + 1
    countsRef.current = { ...countsRef.current, [r.key]: n }
    setCounts((cs) => ({ ...cs, [r.key]: n }))
    return { ok: true, text: `✓ ${r.label} — compté ${n} (attendu ${r.expected})` }
  }

  const valueOf = (r, d) => (r.expected ? (r.value / r.expected) * d : (r.lots[0]?.unitCost || 0) * d)

  async function apply() {
    setErr(''); setBusy(true)
    try {
      const invId = uid()
      const by = app.profile?.name || ''
      const at = nowIso()
      const perProject = {}
      withDiff.forEach((r) => {
        const d = diffOf(r)
        if (d > 0) { (perProject[r.lots[0].pid] ||= []).push({ itemId: r.lots[0].itemId, qty: d }); return }
        let left = -d
        r.lots.slice().sort((a, b) => b.expected - a.expected).forEach((l) => {
          if (left <= 0 || l.expected <= 0) return
          const take = Math.min(left, l.expected)
          left -= take
          ;(perProject[l.pid] ||= []).push({ itemId: l.itemId, qty: -take })
        })
      })
      for (const [pid, adjs] of Object.entries(perProject)) {
        const p = app.D.projects.find((x) => x.id === pid)
        const items = p.items.map((it) => {
          const mine = adjs.filter((a) => a.itemId === it.id)
          return mine.length ? { ...it, adjustments: [...(it.adjustments || []), ...mine.map((a) => ({ id: uid(), qty: a.qty, locationId: loc, at, by, reason: 'Inventaire', inv: invId }))] } : it
        })
        await app.save('projects', pid, { items, history: arrayUnion({ at, by, text: `Inventaire : ajustements de stock (${adjs.map((a) => (a.qty > 0 ? '+' : '') + a.qty).join(', ')})` }) }, 'ajustement de stock (inventaire)')
      }
      const detail = touched.map((r) => ({ label: r.label, sku: r.sku, expected: r.expected, counted: Number(counts[r.key]), diff: diffOf(r), valueRef: Math.round(valueOf(r, diffOf(r)) * 100) / 100 }))
      await app.save('inventories', invId, {
        date: today(), locationId: loc, locationName: app.locations.find((l) => l.id === loc)?.name || '', by, at, refCurrency: app.ref,
        counted: touched.length, withDiff: withDiff.length, missingQty: detail.filter((d) => d.diff < 0).reduce((t, d) => t - d.diff, 0), extraQty: detail.filter((d) => d.diff > 0).reduce((t, d) => t + d.diff, 0),
        lossValue: Math.round(detail.filter((d) => d.diff < 0).reduce((t, d) => t - d.valueRef, 0) * 100) / 100, rows: detail
      }, 'inventaire validé')
      setCounts({})
      setReview(false)
      app.notify('Inventaire validé : stock corrigé ✓')
    } catch (ex) { setErr(ex.code === 'permission-denied' ? 'Permission refusée.' : ex.message) } finally { setBusy(false) }
  }

  const history = [...app.D.inventories].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 15)
  const lossPreview = withDiff.filter((r) => diffOf(r) < 0).reduce((t, r) => t - valueOf(r, diffOf(r)), 0)

  return (
    <>
      <PageHeader title="Inventaire" subtitle="Comptez vos articles et corrigez le stock en fonction de ce que vous avez réellement.">
        <button className="btn-gold" onClick={() => setScan(true)}><Icon name="scan" size={16} />Scanner</button>
      </PageHeader>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        {app.multiLoc && <Select className="min-w-[12rem]" label="Lieu compté" value={loc} onChange={changeLoc} options={app.locations.map((l) => ({ value: l.id, label: l.name }))} />}
        <input className="input min-w-[10rem] flex-1 sm:max-w-xs" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />Écarts seulement</label>
      </div>

      <div className="card mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm"><b>{touched.length}</b> article(s) compté(s) sur {rows.length} · <b className={withDiff.length ? 'text-blush-600' : ''}>{withDiff.length}</b> écart(s)</div>
        <div className="flex gap-2">
          {touched.length > 0 && <button className="btn-ghost btn-sm" onClick={() => confirm('Effacer le comptage en cours ?') && setCounts({})}>Effacer</button>}
          {canApply ? <button className="btn-primary btn-sm" disabled={!touched.length} onClick={() => setReview(true)}>Valider l'inventaire</button> : <span className="text-xs text-neutral-500">La validation demande l'autorisation « Réceptions, retours, pertes ».</span>}
        </div>
      </div>

      {!rows.length ? <Empty icon="layers">Aucun article en stock à compter.</Empty> : (
        <div className="space-y-2">
          {shown.map((r) => {
            const d = diffOf(r)
            return (
              <div key={r.key} className="card !p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="font-medium leading-snug">{r.label}</div><div className="text-xs text-neutral-500">{r.sku} · attendu <b>{r.expected}</b></div></div>
                  {d !== null && <Badge tone={d === 0 ? 'green' : d < 0 ? 'red' : 'amber'}>{d === 0 ? 'OK' : (d > 0 ? '+' : '') + d}</Badge>}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" className="btn-ghost !px-3.5" onClick={() => bump(r.key, -1)}>−</button>
                  <input className="input text-center" type="number" inputMode="numeric" min="0" placeholder="non compté" value={counts[r.key] ?? ''} onChange={(e) => setCount(r.key, e.target.value)} />
                  <button type="button" className="btn-ghost !px-3.5" onClick={() => bump(r.key, 1)}>+</button>
                </div>
              </div>
            )
          })}
          {!shown.length && <Empty>Aucun article pour ce filtre.</Empty>}
        </div>
      )}

      <h2 className="section-title mt-8">Inventaires précédents</h2>
      {!history.length ? <div className="text-sm text-neutral-500">Aucun inventaire validé pour le moment.</div> : (
        <div className="space-y-2">
          {history.map((h) => (
            <details key={h.id} className="card !p-3">
              <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                <span><b>{h.date}</b> — {h.locationName || 'Stock'} · {h.by}<span className="block text-xs text-neutral-500">{h.counted} compté(s) · {h.withDiff} écart(s) · manquant {h.missingQty} · en plus {h.extraQty}</span></span>
                {h.lossValue > 0 && app.can('finance.read') && <span className="shrink-0 font-semibold text-blush-600">−{money(h.lossValue, h.refCurrency)}</span>}
              </summary>
              <div className="mt-2 divide-y divide-line/70 text-sm">
                {(h.rows || []).filter((x) => x.diff !== 0).map((x, i) => <div key={i} className="flex justify-between gap-3 py-1.5"><span>{x.label}</span><span className="shrink-0">{x.expected} → {x.counted} <b className={x.diff < 0 ? 'text-blush-600' : 'text-emerald-700'}>({x.diff > 0 ? '+' : ''}{x.diff})</b></span></div>)}
                {!(h.rows || []).some((x) => x.diff !== 0) && <div className="py-1.5 text-neutral-500">Aucun écart 🎉</div>}
              </div>
              <div className="mt-1 text-[11px] text-neutral-400">{fdt(h.at)}</div>
            </details>
          ))}
        </div>
      )}

      {scan && <Scanner title="Compter par scan" continuous onDetect={onScan} onClose={() => setScan(false)} />}
      {review && (
        <Modal title="Valider l'inventaire" onClose={() => setReview(false)}>
          <div className="space-y-3 text-sm">
            <p>{touched.length} article(s) compté(s), dont <b>{withDiff.length}</b> avec écart. Le stock sera corrigé pour correspondre à votre comptage. Les articles <b>non comptés</b> ne sont pas modifiés.</p>
            {withDiff.length > 0 && (
              <div className="max-h-56 divide-y divide-line/70 overflow-y-auto rounded-xl ring-1 ring-line">
                {withDiff.map((r) => <div key={r.key} className="flex justify-between gap-3 px-3 py-2"><span>{r.label}</span><span className="shrink-0">{r.expected} → {counts[r.key]} <b className={diffOf(r) < 0 ? 'text-blush-600' : 'text-emerald-700'}>({diffOf(r) > 0 ? '+' : ''}{diffOf(r)})</b></span></div>)}
              </div>
            )}
            {lossPreview > 0 && app.can('finance.read') && <Notice tone="red">Valeur du manquant (au coût) : {money(lossPreview, app.ref)}</Notice>}
            {err && <Notice tone="red">{err}</Notice>}
            <div className="flex gap-2"><button className="btn-ghost flex-1" onClick={() => setReview(false)}>Annuler</button><button className="btn-gold flex-1" disabled={busy} onClick={apply}>{busy ? '…' : 'Corriger le stock'}</button></div>
          </div>
        </Modal>
      )}
    </>
  )
}
